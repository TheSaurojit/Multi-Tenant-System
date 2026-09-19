import { Plan } from '@prisma/client'
import { prisma } from './db'
import { PLAN_CONFIGS, PlanLimits, getPlanLimits } from './plans'

export { PLAN_CONFIGS, getPlanLimits }
export type { PlanLimits }

export async function checkFeatureLimit(
  organizationId: string,
  feature: 'members' | 'uploads' | 'reports' | 'workspaces',
  userId?: string
): Promise<{ allowed: boolean; current: number; max: number; plan: Plan; message?: string }> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true },
  })

  const plan = org?.plan ?? 'FREE'
  const limits = getPlanLimits(plan)

  if (feature === 'members') {
    const memberCount = await prisma.membership.count({
      where: { organizationId },
    })
    const pendingInvites = await prisma.invitation.count({
      where: { organizationId, status: 'PENDING' },
    })
    const total = memberCount + pendingInvites
    const allowed = total < limits.maxMembers

    return {
      allowed,
      current: total,
      max: limits.maxMembers,
      plan,
      message: allowed
        ? undefined
        : `Your ${limits.name} plan limit of ${limits.maxMembers} team members has been reached. Please upgrade to add more seats.`,
    }
  }

  if (feature === 'uploads') {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const uploadCount = await prisma.dataset.count({
      where: {
        organizationId,
        createdAt: { gte: startOfMonth },
      },
    })

    const allowed = uploadCount < limits.monthlyUploads

    return {
      allowed,
      current: uploadCount,
      max: limits.monthlyUploads,
      plan,
      message: allowed
        ? undefined
        : `Your monthly upload limit of ${limits.monthlyUploads} CSV files for the ${limits.name} plan has been reached. Upgrade to Pro for 100 uploads/month.`,
    }
  }

  if (feature === 'reports') {
    const reportCount = await prisma.savedReport.count({
      where: { organizationId },
    })

    const allowed = reportCount < limits.maxSavedReports

    return {
      allowed,
      current: reportCount,
      max: limits.maxSavedReports,
      plan,
      message: allowed
        ? undefined
        : `Your ${limits.name} plan allows up to ${limits.maxSavedReports} saved reports. Upgrade for unlimited reports.`,
    }
  }

  if (feature === 'workspaces') {
    const workspaceCount = await prisma.workspace.count({
      where: { organizationId },
    })

    const allowed = workspaceCount < limits.maxWorkspaces

    return {
      allowed,
      current: workspaceCount,
      max: limits.maxWorkspaces,
      plan,
      message: allowed
        ? undefined
        : `Your ${limits.name} plan allows up to ${limits.maxWorkspaces} workspace(s) per organization. Upgrade to Pro for 5 workspaces or Advanced for unlimited.`,
    }
  }

  return { allowed: true, current: 0, max: Infinity, plan }
}
