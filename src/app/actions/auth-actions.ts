'use server'

import { redirect } from 'next/navigation'
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  setAuthCookies,
  setActiveOrgCookie,
  setActiveWorkspaceCookie,
  clearAuthCookies,
  getCurrentUser,
} from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logAuditEvent } from '@/lib/audit'
import { checkFeatureLimit } from '@/lib/feature-limits'

export async function loginAction( formData: FormData) {
  
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Please provide both email and password.' }
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
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

  if (user.memberships.length === 0) {
    return { error: 'Account has no active organization workspaces.' }
  }

  const defaultOrgId = user.memberships[0].organizationId
  const defaultWorkspaceId = user.memberships[0].organization.workspaces[0]?.id

  const token = await createSessionToken({ userId: user.id, email: user.email })
  await setAuthCookies(token, defaultOrgId, defaultWorkspaceId)

  redirect('/dashboard')
}

export async function signupAction( formData: FormData) {
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const workspaceName = formData.get('workspaceName') as string

  if (!name || !email || !password || !workspaceName) {
    return { error: 'Please fill in all required fields.' }
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters long.' }
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  })

  if (existingUser) {
    return { error: 'An account with this email already exists. Please log in.' }
  }

  const passwordHash = await hashPassword(password)
  const baseSlug = workspaceName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  const slug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`

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
  const initialWorkspaceId = user.memberships[0].organization.workspaces[0]?.id

  await logAuditEvent({
    organizationId: orgId,
    userId: user.id,
    action: 'SETTINGS_UPDATED',
    entityType: 'Organization',
    entityId: orgId,
    details: { event: 'Organization registered with initial primary workspace' },
  })

  const token = await createSessionToken({ userId: user.id, email: user.email })
  await setAuthCookies(token, orgId, initialWorkspaceId)

  redirect('/dashboard')
}

export async function switchOrganizationAction(organizationId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const membership = user.memberships.find((m) => m.orgId === organizationId)
  if (!membership) throw new Error('Not a member of this organization')

  const firstWorkspace = await prisma.workspace.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
  })

  await setActiveOrgCookie(organizationId)
  if (firstWorkspace) {
    await setActiveWorkspaceCookie(firstWorkspace.id)
  }
  redirect('/dashboard')
}

export async function switchWorkspaceAction(workspaceId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  // Check that the workspace belongs to current user's active organization
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      organizationId: user.activeOrgId,
    },
  })

  if (!workspace) throw new Error('Workspace not found in this organization')

  await setActiveWorkspaceCookie(workspaceId)
  redirect('/dashboard')
}

export async function createWorkspaceAction( formData: FormData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const name = formData.get('name') as string
  const description = (formData.get('description') as string) || null

  if (!name || name.trim().length === 0) {
    return { error: 'Workspace name is required.' }
  }

  // Check quota limit for workspaces under this organization
  const limitCheck = await checkFeatureLimit(user.activeOrgId, 'workspaces')
  if (!limitCheck.allowed) {
    return { error: limitCheck.message }
  }

  const baseSlug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  const slug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`

  const newWorkspace = await prisma.workspace.create({
    data: {
      name: name.trim(),
      slug,
      description: description?.trim() || null,
      organizationId: user.activeOrgId,
    },
  })

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'SETTINGS_UPDATED',
    entityType: 'Workspace',
    entityId: newWorkspace.id,
    details: { event: 'Workspace created', workspaceName: newWorkspace.name },
  })

  await setActiveWorkspaceCookie(newWorkspace.id)
  redirect('/dashboard')
}

export async function createOrganizationAction( formData: FormData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const name = formData.get('name') as string
  if (!name || name.trim().length === 0) {
    return { error: 'Organization name is required.' }
  }

  const baseSlug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  const slug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`

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
  await clearAuthCookies()
  redirect('/login')
}
