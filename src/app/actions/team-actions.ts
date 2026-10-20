'use server'

import { getCurrentUser, bumpSessionVersion, refreshSessionCookies } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { assertPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { checkFeatureLimit } from '@/lib/feature-limits'
import { checkRateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/request-ip'
import crypto from 'crypto'
import { revalidatePath } from 'next/cache'
import { Role } from '../../../generated/prisma'
import { sendWorkspaceInviteEmail } from '@/lib/email'
import {
  InviteMemberSchema,
  UpdateMemberRoleSchema,
  AcceptInviteSchema,
  EntityIdSchema,
} from '@/lib/validations'

export async function inviteMemberAction({
  email,
  role,
}: {
  email: string
  role: Role
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  assertPermission(user.role, 'members:invite')

  const inviteLimit = checkRateLimit(`invite:${user.id}`, 10, 60 * 60 * 1000)
  if (!inviteLimit.allowed) {
    return {
      error: `Too many invitations sent. Please try again in ${inviteLimit.resetInSeconds} seconds.`,
    }
  }

  const validation = InviteMemberSchema.safeParse({ email, role })
  if (!validation.success) {
    return { error: validation.error.issues[0]?.message || 'Invalid invite parameters. Cannot invite members as Owner.' }
  }

  const normalizedEmail = validation.data.email

  // Admins cannot invite other Admins - only Owner can
  if (user.role === 'ADMIN' && role === 'ADMIN') {
    return { error: 'Only the Organization Owner can invite Admins.' }
  }

  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const result = await prisma.$transaction(async (tx) => {
    // Check plan member limit
    const limitCheck = await checkFeatureLimit(user.activeOrgId, 'members', tx)
    if (!limitCheck.allowed) {
      return { error: limitCheck.message }
    }

    // Check if user is already a member
    const existingMembership = await tx.membership.findFirst({
      where: {
        organizationId: user.activeOrgId,
        user: { email: normalizedEmail },
      },
    })

    if (existingMembership) {
      return { error: 'This user is already a member of this workspace.' }
    }

    // Check if pending invite already exists
    const existingInvite = await tx.invitation.findFirst({
      where: {
        organizationId: user.activeOrgId,
        email: normalizedEmail,
        status: 'PENDING',
      },
    })

    if (existingInvite) {
      return { error: 'An active invitation has already been sent to this email.' }
    }

    const invite = await tx.invitation.create({
      data: {
        email: normalizedEmail,
        role,
        token,
        organizationId: user.activeOrgId,
        invitedById: user.id,
        expiresAt,
      },
    })

    return { invite }
  })

  if ('error' in result && result.error) {
    return { error: result.error }
  }

  if (!('invite' in result) || !result.invite) {
    return { error: 'Failed to create invitation.' }
  }

  const invite = result.invite

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'USER_INVITED',
    entityType: 'Invitation',
    entityId: invite.id,
    details: { email: normalizedEmail, role },
  })

  revalidatePath('/workspace/team')

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/${token}`

  await sendWorkspaceInviteEmail({
    to: normalizedEmail,
    inviterName: user.name,
    organizationName: user.activeOrgName,
    role,
    inviteUrl,
  })

  return { success: true, inviteUrl }
}

export async function revokeInviteAction(inviteId: string) {
  const parsedId = EntityIdSchema.safeParse(inviteId)
  if (!parsedId.success) throw new Error('Invalid invitation ID')
  const validInviteId = parsedId.data

  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  assertPermission(user.role, 'members:invite')

  const invite = await prisma.invitation.findUnique({
    where: { id: validInviteId },
  })

  if (!invite || invite.organizationId !== user.activeOrgId) {
    throw new Error('Invitation not found')
  }

  await prisma.invitation.update({
    where: { id: validInviteId },
    data: { status: 'REVOKED' },
  })

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'INVITE_REVOKED',
    entityType: 'Invitation',
    entityId: validInviteId,
    details: { email: invite.email },
  })

  revalidatePath('/workspace/team')
  return { success: true }
}

export async function updateMemberRoleAction({
  targetUserId,
  newRole,
}: {
  targetUserId: string
  newRole: Role
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  assertPermission(user.role, 'members:role_update')

  const validation = UpdateMemberRoleSchema.safeParse({ targetUserId, newRole })
  if (!validation.success) {
    return { error: 'Invalid role update request. Organization ownership cannot be assigned through role changes.' }
  }

  if (user.id === targetUserId) {
    return { error: 'You cannot modify your own role.' }
  }

  const targetMembership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId: user.activeOrgId,
      },
    },
  })

  if (!targetMembership) {
    return { error: 'Member not found in workspace.' }
  }

  // Cannot modify Owner
  if (targetMembership.role === 'OWNER') {
    return { error: 'Cannot modify the workspace Owner.' }
  }

  // Admin cannot modify another Admin, nor promote anyone to Admin
  if (user.role === 'ADMIN') {
    if (targetMembership.role === 'ADMIN') {
      return { error: 'Only the workspace Owner can modify Admin permissions.' }
    }
    if (newRole === 'ADMIN') {
      return { error: 'Only the workspace Owner can promote members to Admin.' }
    }
  }

  // Only Owner can assign ADMIN
  if (newRole === 'ADMIN' && user.role !== 'OWNER') {
    return { error: 'Only the workspace Owner can assign the Admin role.' }
  }

  await prisma.membership.update({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId: user.activeOrgId,
      },
    },
    data: { role: newRole },
  })

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'ROLE_CHANGED',
    entityType: 'User',
    entityId: targetUserId,
    details: { oldRole: targetMembership.role, newRole },
  })

  revalidatePath('/workspace/team')
  return { success: true }
}

export async function removeMemberAction(targetUserId: string) {
  const parsedId = EntityIdSchema.safeParse(targetUserId)
  if (!parsedId.success) throw new Error('Invalid user ID')
  const validTargetId = parsedId.data

  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  assertPermission(user.role, 'members:remove')

  if (user.id === validTargetId) {
    return { error: 'You cannot remove yourself from the workspace.' }
  }

  const targetMembership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: validTargetId,
        organizationId: user.activeOrgId,
      },
    },
  })

  if (!targetMembership) {
    return { error: 'Member not found.' }
  }

  if (targetMembership.role === 'OWNER') {
    return { error: 'Cannot remove the workspace Owner.' }
  }

  // Admins cannot remove another Admin - only the Owner can
  if (user.role === 'ADMIN' && targetMembership.role === 'ADMIN') {
    return { error: 'Only the Organization Owner can remove an Administrator.' }
  }

  await prisma.membership.delete({
    where: {
      userId_organizationId: {
        userId: validTargetId,
        organizationId: user.activeOrgId,
      },
    },
  })

  // Revoke every outstanding session token for the removed user so they
  // lose access immediately instead of when their 7-day JWT expires.
  try {
    await bumpSessionVersion(validTargetId)
  } catch (error) {
    console.error('Failed to revoke sessions for removed member:', error)
  }

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'MEMBER_REMOVED',
    entityType: 'User',
    entityId: validTargetId,
    details: { role: targetMembership.role },
  })

  revalidatePath('/workspace/team')
  return { success: true }
}

export async function acceptInviteAction(token: string) {
  const parsed = AcceptInviteSchema.safeParse({ token })
  if (!parsed.success) {
    return { error: 'Invalid or missing invitation token.' }
  }
  const validToken = parsed.data.token

  const clientIp = await getClientIp()
  if (clientIp) {
    const acceptLimit = checkRateLimit(`invite-accept:${clientIp}`, 10, 60 * 60 * 1000)
    if (!acceptLimit.allowed) {
      return {
        error: `Too many invitation attempts. Please try again in ${acceptLimit.resetInSeconds} seconds.`,
      }
    }
  }

  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Authentication required to accept invitation.', requiresLogin: true }
  }

  const result = await prisma.$transaction(async (tx) => {
    const activeInvite = await tx.invitation.findUnique({
      where: { token: validToken },
      include: { organization: true },
    })

    if (!activeInvite) {
      return { error: 'Invitation not found.' }
    }

    if (activeInvite.status !== 'PENDING') {
      return { error: `This invitation has already been ${activeInvite.status.toLowerCase()}.` }
    }

    if (activeInvite.expiresAt < new Date()) {
      await tx.invitation.update({
        where: { id: activeInvite.id },
        data: { status: 'EXPIRED' },
      })
      return { error: 'This invitation has expired. Please ask an administrator for a new invite.' }
    }

    // Verify token is tied to the invited email
    if (user.email.toLowerCase().trim() !== activeInvite.email.toLowerCase().trim()) {
      return {
        error: `This invitation was issued to ${activeInvite.email}. You are logged in as ${user.email}. Please switch accounts to accept this invitation.`,
        emailMismatch: true,
      }
    }

    // Check existing membership to prevent demoting/overwriting higher role
    const existingMembership = await tx.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: activeInvite.organizationId,
        },
      },
    })

    if (existingMembership) {
      // Do not demote an OWNER or demote an ADMIN to MEMBER/VIEWER
      if (existingMembership.role === 'OWNER' || (existingMembership.role === 'ADMIN' && activeInvite.role !== 'ADMIN')) {
        await tx.invitation.update({
          where: { id: activeInvite.id },
          data: { status: 'ACCEPTED' },
        })
        return { success: true, alreadyMember: true, role: existingMembership.role, organizationId: activeInvite.organizationId }
      }

      await tx.membership.update({
        where: { id: existingMembership.id },
        data: { role: activeInvite.role },
      })
    } else {
      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: activeInvite.organizationId,
          role: activeInvite.role,
        },
      })
    }

    await tx.invitation.update({
      where: { id: activeInvite.id },
      data: { status: 'ACCEPTED' },
    })

    await logAuditEvent({
      organizationId: activeInvite.organizationId,
      userId: user.id,
      action: 'INVITE_ACCEPTED',
      entityType: 'User',
      entityId: user.id,
      details: { email: user.email, role: activeInvite.role },
    })

    return { success: true, organizationId: activeInvite.organizationId }
  })

  // Membership changed: invalidate all previously issued tokens (other
  // devices signed in as this user), then re-issue one for THIS session so
  // the accepting user stays signed in with their new membership.
  if (result && 'success' in result && result.success && !('alreadyMember' in result && result.alreadyMember)) {
    try {
      await bumpSessionVersion(user.id)
      await refreshSessionCookies({ id: user.id, email: user.email })
    } catch (error) {
      console.error('Failed to refresh session after accepting invitation:', error)
    }
  }

  return result
}
