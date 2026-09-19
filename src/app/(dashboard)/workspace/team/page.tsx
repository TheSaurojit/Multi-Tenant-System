import React from 'react'
import { requireAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { TeamManagementView } from '@/components/team/team-management-view'
import { getPlanLimits } from '@/lib/feature-limits'

export default async function TeamPage() {
  const currentUser = await requireAuthUser()

  const activeMembership = currentUser.memberships.find(
    (m) => m.orgId === currentUser.activeOrgId
  )
  const limits = getPlanLimits(activeMembership?.plan as any || 'FREE')

  const members = await prisma.membership.findMany({
    where: { organizationId: currentUser.activeOrgId },
    include: {
      user: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const invitations = await prisma.invitation.findMany({
    where: { organizationId: currentUser.activeOrgId },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Team & Access Control
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Manage workspace members, assign RBAC roles, and invite collaborators
        </p>
      </div>

      <TeamManagementView
        members={members}
        invitations={invitations}
        currentUser={currentUser}
        maxMembers={limits.maxMembers}
      />
    </div>
  )
}
