'use server'

import { redirect } from 'next/navigation'
import crypto from 'crypto'
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  setAuthCookies,
  setActiveOrgCookie,
  setActiveWorkspaceCookie,
  clearAuthCookies,
  getCurrentUser,
  bumpSessionVersion,
  resolveAuthRedirect,
} from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logAuditEvent } from '@/lib/audit'
import { checkFeatureLimit } from '@/lib/feature-limits'
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/request-ip'
import { generateUniqueSlug } from '@/lib/slug'
import { hasPermission } from '@/lib/permissions'
import {
  sendEmailVerificationEmail,
  sendSignupWelcomeEmail,
  sendForgotPasswordEmail,
  sendPasswordResetSuccessEmail,
} from '@/lib/email'
import {
  LoginSchema,
  SignupSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  VerifyEmailSchema,
  ResendVerificationSchema,
  CreateWorkspaceSchema,
  CreateOrgSchema,
  EntityIdSchema,
} from '@/lib/validations'

export async function loginAction(formData: FormData) {
  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Please provide both email and password.' }
  }

  const { email, password } = parsed.data
  const normalizedEmail = email.toLowerCase().trim()
  const clientIp = await getClientIp()

  // Rate limiting per IP + email and per IP (only when client IP can be verified,
  // preventing unknown / unproxied clients from sharing a global rate-limit bucket).
  if (clientIp) {
    const perIdentity = await checkRateLimit(`login:${clientIp}:${normalizedEmail}`, 5, 15 * 60 * 1000)
    if (!perIdentity.allowed) {
      return {
        error: `Too many login attempts. Please try again in ${perIdentity.resetInSeconds} seconds.`,
      }
    }

    const perIp = await checkRateLimit(`login-ip:${clientIp}`, 30, 15 * 60 * 1000)
    if (!perIp.allowed) {
      return {
        error: `Too many login attempts. Please try again in ${perIp.resetInSeconds} seconds.`,
      }
    }
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      memberships: {
        include: {
          organization: {
            include: {
              workspaces: {
                orderBy: { createdAt: 'asc' },
              },
            },
          },
        },
      },
    },
  })

  if (!user) {
    return { error: 'Invalid email or password.' }
  }

  const isValid = await verifyPassword(password, user.passwordHash)
  if (!isValid) {
    return { error: 'Invalid email or password.' }
  }

  // Verify that email has been confirmed
  if (!user.emailVerified) {
    return {
      error: 'Please verify your email address before signing in. Check your inbox for the verification link.',
      unverified: true,
      email: user.email,
    }
  }

  // Clear the per-identity counter on successful credentials.
  // The per-IP counter intentionally survives: a valid login must not reset
  // the credential-stuffing budget shared across emails.
  if (clientIp) {
    await resetRateLimit(`login:${clientIp}:${normalizedEmail}`)
  }

  if (user.memberships.length === 0) {
    return { error: 'Account has no active organization workspaces.' }
  }

  const defaultOrgId = user.memberships[0].organizationId
  const defaultWorkspaceId = user.memberships[0].organization.workspaces[0]?.id

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    sessionVersion: user.sessionVersion,
  })
  await setAuthCookies(token, defaultOrgId, defaultWorkspaceId)

  const rawFrom = formData.get('from')
  const redirectTo = resolveAuthRedirect(rawFrom)
  redirect(redirectTo)
}

export async function signupAction(formData: FormData) {
  const parsed = SignupSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    workspaceName: formData.get('workspaceName'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Please fill in all required fields.' }
  }

  const { name, email, password, workspaceName } = parsed.data

  const clientIp = await getClientIp()
  if (clientIp) {
    const signupLimit = await checkRateLimit(`signup:${clientIp}`, 5, 60 * 60 * 1000)
    if (!signupLimit.allowed) {
      return {
        error: `Too many signup attempts. Please try again in ${signupLimit.resetInSeconds} seconds.`,
      }
    }
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  })

  if (existingUser) {
    return { error: 'An account with this email already exists. Please log in.' }
  }

  const passwordHash = await hashPassword(password)
  const slug = await generateUniqueSlug(workspaceName, async (candidate) => {
    const existing = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    return !!existing
  })

  // Create user + org + initial child workspace in transaction
  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase().trim(),
      passwordHash,
      memberships: {
        create: {
          role: 'OWNER',
          organization: {
            create: {
              name: workspaceName,
              slug,
              plan: 'FREE',
              subscriptionStatus: 'INACTIVE',
              workspaces: {
                create: {
                  name: 'Primary Workspace',
                  slug: 'primary',
                  description: 'Default project workspace',
                },
              },
            },
          },
        },
      },
    },
    include: {
      memberships: {
        include: {
          organization: {
            include: {
              workspaces: true,
            },
          },
        },
      },
    },
  })

  const orgId = user.memberships[0].organizationId

  await logAuditEvent({
    organizationId: orgId,
    userId: user.id,
    action: 'SETTINGS_UPDATED',
    entityType: 'Organization',
    entityId: orgId,
    details: { event: 'Organization registered with initial primary workspace' },
  })

  // Generate verification token and dispatch verification email
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours TTL

  await prisma.emailVerificationToken.create({
    data: {
      email: user.email,
      tokenHash,
      userId: user.id,
      expiresAt,
    },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const verificationUrl = `${appUrl}/verify-email?token=${rawToken}`

  await sendEmailVerificationEmail({
    to: user.email,
    name: user.name,
    verificationUrl,
    expiresInHours: 24,
  })

  const rawFrom = formData.get('from')
  const safeFrom = resolveAuthRedirect(rawFrom, '')
  const redirectTo = safeFrom
    ? `/verify-email?sent=true&email=${encodeURIComponent(user.email)}&from=${encodeURIComponent(safeFrom)}`
    : `/verify-email?sent=true&email=${encodeURIComponent(user.email)}`

  redirect(redirectTo)
}

export async function switchOrganizationAction(organizationId: string) {
  const parsed = EntityIdSchema.safeParse(organizationId)
  if (!parsed.success) throw new Error('Invalid organization ID')
  const validOrgId = parsed.data

  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const membership = user.memberships.find((m) => m.orgId === validOrgId)
  if (!membership) throw new Error('Not a member of this organization')

  const firstWorkspace = await prisma.workspace.findFirst({
    where: { organizationId: validOrgId },
    orderBy: { createdAt: 'asc' },
  })

  await setActiveOrgCookie(validOrgId)
  if (firstWorkspace) {
    await setActiveWorkspaceCookie(firstWorkspace.id)
  }
  redirect('/dashboard')
}

export async function switchWorkspaceAction(workspaceId: string) {
  const parsed = EntityIdSchema.safeParse(workspaceId)
  if (!parsed.success) throw new Error('Invalid workspace ID')
  const validWsId = parsed.data

  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  // Check that the workspace belongs to current user's active organization
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: validWsId,
      organizationId: user.activeOrgId,
    },
  })

  if (!workspace) throw new Error('Workspace not found in this organization')

  await setActiveWorkspaceCookie(workspaceId)
  redirect('/dashboard')
}

export async function createWorkspaceAction(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  if (!hasPermission(user.role, 'org:update')) {
    return { error: 'Forbidden: Only Organization Owners and Admins can create workspaces.' }
  }

  const parsed = CreateWorkspaceSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Workspace name is required.' }
  }

  const { name, description } = parsed.data

  const slug = await generateUniqueSlug(name, async (candidate) => {
    const existing = await prisma.workspace.findFirst({
      where: { organizationId: user.activeOrgId, slug: candidate },
      select: { id: true },
    })
    return !!existing
  })

  const result = await prisma.$transaction(async (tx) => {
    // Lock the organization row to serialize concurrent quota checks
    await tx.$queryRaw`SELECT 1 FROM "Organization" WHERE id = ${user.activeOrgId} FOR UPDATE`

    const limitCheck = await checkFeatureLimit(user.activeOrgId, 'workspaces', tx)
    if (!limitCheck.allowed) {
      return { error: limitCheck.message }
    }

    const newWorkspace = await tx.workspace.create({
      data: {
        name: name.trim(),
        slug,
        description: description?.trim() || null,
        organizationId: user.activeOrgId,
      },
    })

    return { workspace: newWorkspace }
  })

  if ('error' in result && result.error) {
    return { error: result.error }
  }

  if (!('workspace' in result) || !result.workspace) {
    return { error: 'Failed to create workspace.' }
  }

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'SETTINGS_UPDATED',
    entityType: 'Workspace',
    entityId: result.workspace.id,
    details: { event: 'Workspace created', workspaceName: result.workspace.name },
  })

  await setActiveWorkspaceCookie(result.workspace.id)
  redirect('/dashboard')
}

export async function createOrganizationAction(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const parsed = CreateOrgSchema.safeParse({
    name: formData.get('name'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Organization name is required.' }
  }

  const { name } = parsed.data

  const slug = await generateUniqueSlug(name, async (candidate) => {
    const existing = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    return !!existing
  })

  const newOrg = await prisma.organization.create({
    data: {
      name: name.trim(),
      slug,
      plan: 'FREE',
      subscriptionStatus: 'INACTIVE',
      memberships: {
        create: {
          userId: user.id,
          role: 'OWNER',
        },
      },
      workspaces: {
        create: {
          name: 'Primary Workspace',
          slug: 'primary',
          description: 'Default project workspace',
        },
      },
    },
    include: {
      workspaces: true,
    },
  })

  await setActiveOrgCookie(newOrg.id)
  if (newOrg.workspaces[0]) {
    await setActiveWorkspaceCookie(newOrg.workspaces[0].id)
  }
  redirect('/dashboard')
}

export async function logoutAction() {
  // Invalidate every outstanding token server-side, not just this cookie
  const user = await getCurrentUser()
  if (user) {
    try {
      await bumpSessionVersion(user.id)
    } catch (error) {
      console.error('Failed to bump session version on logout:', error)
    }
  }
  await clearAuthCookies()
  redirect('/login')
}

export async function requestPasswordResetAction(formData: FormData) {
  const parsed = ForgotPasswordSchema.safeParse({
    email: formData.get('email'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Please provide a valid email address.' }
  }

  const { email } = parsed.data
  const normalizedEmail = email.toLowerCase().trim()
  const clientIp = await getClientIp()

  // Rate limiting per-IP (max 10 requests / hr) and per-email (max 3 requests / hr)
  if (clientIp) {
    const ipLimit = await checkRateLimit(`forgot-ip:${clientIp}`, 10, 60 * 60 * 1000)
    if (!ipLimit.allowed) {
      return {
        error: `Too many password reset requests. Please try again in ${ipLimit.resetInSeconds} seconds.`,
      }
    }
  }

  const emailLimit = await checkRateLimit(`forgot-email:${normalizedEmail}`, 3, 60 * 60 * 1000)
  if (!emailLimit.allowed) {
    return {
      error: `Too many password reset requests for this email. Please try again in ${emailLimit.resetInSeconds} seconds.`,
    }
  }

  // Anti-enumeration generic response
  const genericSuccess = {
    success: true,
    message: 'If an account exists with this email address, instructions to reset your password have been sent.',
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  })

  if (!user) {
    return genericSuccess
  }

  // Generate cryptographically secure random token and SHA-256 hash
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour TTL

  // Delete any existing reset tokens for this user
  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id },
  })

  await prisma.passwordResetToken.create({
    data: {
      email: user.email,
      tokenHash,
      userId: user.id,
      expiresAt,
    },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const resetUrl = `${appUrl}/reset-password?token=${rawToken}`

  await sendForgotPasswordEmail({
    to: user.email,
    name: user.name,
    resetUrl,
    expiresInHours: 1,
  })

  return genericSuccess
}

export async function resetPasswordAction(formData: FormData) {
  const parsed = ResetPasswordSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid parameters.' }
  }

  const { token, password } = parsed.data
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const resetRecord = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          memberships: true,
        },
      },
    },
  })

  if (!resetRecord || resetRecord.expiresAt < new Date()) {
    return {
      error: 'This password reset link is invalid or has expired. Please request a new one.',
    }
  }

  const newPasswordHash = await hashPassword(password)

  // Update password, increment sessionVersion to invalidate all existing sessions, delete reset token
  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetRecord.userId },
      data: {
        passwordHash: newPasswordHash,
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.passwordResetToken.delete({
      where: { id: resetRecord.id },
    }),
  ])

  // Log audit event if user has active organization
  const defaultOrgId = resetRecord.user.memberships[0]?.organizationId
  if (defaultOrgId) {
    await logAuditEvent({
      organizationId: defaultOrgId,
      userId: resetRecord.userId,
      action: 'SETTINGS_UPDATED',
      entityType: 'User',
      entityId: resetRecord.userId,
      details: { event: 'Password reset completed via token' },
    })
  }

  // Send confirmation email
  await sendPasswordResetSuccessEmail({
    to: resetRecord.user.email,
    name: resetRecord.user.name,
    timestamp: new Date(),
  })

  return { success: true }
}

export async function verifyEmailAction(formData: FormData) {
  const parsed = VerifyEmailSchema.safeParse({
    token: formData.get('token'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid verification token.' }
  }

  const { token } = parsed.data
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          memberships: {
            include: {
              organization: {
                include: {
                  workspaces: {
                    orderBy: { createdAt: 'asc' },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!record || record.expiresAt < new Date()) {
    return {
      error: 'This verification link is invalid or has expired. Please request a new one.',
    }
  }

  const user = record.user

  // Update user verified date & delete used token
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    }),
    prisma.emailVerificationToken.delete({
      where: { id: record.id },
    }),
  ])

  // Log audit event
  const primaryOrgId = user.memberships[0]?.organizationId
  const primaryWorkspaceId = user.memberships[0]?.organization.workspaces[0]?.id

  if (primaryOrgId) {
    await logAuditEvent({
      organizationId: primaryOrgId,
      userId: user.id,
      action: 'SETTINGS_UPDATED',
      entityType: 'User',
      entityId: user.id,
      details: { event: 'Email address verified successfully' },
    })
  }

  // Send welcome email now that the email is verified
  await sendSignupWelcomeEmail({
    to: user.email,
    name: user.name,
    workspaceName: user.memberships[0]?.organization.name || 'Workspace',
  })

  // Create active session cookies
  if (primaryOrgId && primaryWorkspaceId) {
    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email,
      sessionVersion: user.sessionVersion,
    })
    await setAuthCookies(sessionToken, primaryOrgId, primaryWorkspaceId)
  }

  return { success: true }
}

export async function resendVerificationEmailAction(formData: FormData) {
  const parsed = ResendVerificationSchema.safeParse({
    email: formData.get('email'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Please provide a valid email address.' }
  }

  const { email } = parsed.data
  const normalizedEmail = email.toLowerCase().trim()
  const clientIp = await getClientIp()
  const rateLimitKey = clientIp
    ? `resend-verify:${clientIp}:${normalizedEmail}`
    : `resend-verify:${normalizedEmail}`
  const rate = await checkRateLimit(rateLimitKey, 3, 60 * 60 * 1000)
  if (!rate.allowed) {
    return {
      error: `Too many verification requests. Please try again in ${rate.resetInSeconds} seconds.`,
    }
  }

  const genericResponse = {
    success: true,
    message: 'If an unverified account exists with this email address, a new verification link has been sent.',
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  })

  if (!user || user.emailVerified) {
    return genericResponse
  }

  // Delete previous verification tokens for this user
  await prisma.emailVerificationToken.deleteMany({
    where: { userId: user.id },
  })

  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours TTL

  await prisma.emailVerificationToken.create({
    data: {
      email: user.email,
      tokenHash,
      userId: user.id,
      expiresAt,
    },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const verificationUrl = `${appUrl}/verify-email?token=${rawToken}`

  await sendEmailVerificationEmail({
    to: user.email,
    name: user.name,
    verificationUrl,
    expiresInHours: 24,
  })

  return genericResponse
}
