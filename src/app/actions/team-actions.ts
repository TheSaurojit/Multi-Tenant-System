'use server'

import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { assertPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { checkFeatureLimit } from '@/lib/feature-limits'
import { Role } from '@prisma/client'
import crypto from 'crypto'
import { revalidatePath } from 'next/cache'

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

  const normalizedEmail = email.toLowerCase().trim()
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { error: 'Please enter a valid email address.' }
  }
  // Check  if user email exists or not 
  const userEmail = await prisma.user.findFirst({
    where : { email : normalizedEmail}
  })
   if (!userEmail) {
    return { error: "No user exists with this email" }
  } 

  // Check plan member limit
  const limitCheck = await checkFeatureLimit(user.activeOrgId, 'members')
  if (!limitCheck.allowed) {
    return { error: limitCheck.message }
  }

  // Check if user is already a member
  const existingMembership = await prisma.membership.findFirst({
    where: {
      organizationId: user.activeOrgId,
      user: { email: normalizedEmail },
    },
  })

  if (existingMembership) {
    return { error: 'This user is already a member of this workspace.' }
  }

  // Check if pending invite already exists
  const existingInvite = await prisma.invitation.findFirst({
    where: {
      organizationId: user.activeOrgId,
      email: normalizedEmail,
      status: 'PENDING',
    },
  })

  if (existingInvite) {
    return { error: 'An active invitation has already been sent to this email.' }
  }

  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const invite = await prisma.invitation.create({
    data: {
      email: normalizedEmail,
      role,
      token,
      organizationId: user.activeOrgId,
      invitedById: user.id,
      expiresAt,
    },
  })

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
  return { success: true, inviteUrl }
}

export async function revokeInviteAction(inviteId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  assertPermission(user.role, 'members:invite')

  const invite = await prisma.invitation.findUnique({
    where: { id: inviteId },
  })

  if (!invite || invite.organizationId !== user.activeOrgId) {
    throw new Error('Invitation not found')
  }

  await prisma.invitation.update({
    where: { id: inviteId },
    data: { status: 'REVOKED' },
  })

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'INVITE_REVOKED',
    entityType: 'Invitation',
    entityId: inviteId,
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

  // Only Owner can modify another Admin or promote to Owner
  if (targetMembership.role === 'OWNER') {
    return { error: 'Cannot modify the workspace Owner.' }
  }

  if (targetMembership.role === 'ADMIN' && user.role !== 'OWNER') {
    return { error: 'Only the workspace Owner can modify Admin permissions.' }
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
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  assertPermission(user.role, 'members:remove')

  if (user.id === targetUserId) {
    return { error: 'You cannot remove yourself from the workspace.' }
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
    return { error: 'Member not found.' }
  }

  if (targetMembership.role === 'OWNER') {
    return { error: 'Cannot remove the workspace Owner.' }
  }

  await prisma.membership.delete({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId: user.activeOrgId,
      },
    },
  })

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'MEMBER_REMOVED',
    entityType: 'User',
    entityId: targetUserId,
    details: { role: targetMembership.role },
  })

  revalidatePath('/workspace/team')
  return { success: true }
}
