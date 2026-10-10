import { Plan, Prisma } from '../../generated/prisma'
import { prisma } from './db'
import { PLAN_CONFIGS, PlanLimits, getPlanLimits } from './plans'

export { PLAN_CONFIGS, getPlanLimits }
export type { PlanLimits }

export function getRetentionCutoff(plan: Plan): Date {
  const limits = getPlanLimits(plan)
  return new Date(Date.now() - limits.retentionDays * 24 * 60 * 60 * 1000)
}

export type FeatureType =
  | 'members'
  | 'uploads'
  | 'reports'
  | 'workspaces'
  | 'export'
  | 'audit_logs'

export async function checkFeatureLimit(
  organizationId: string,
  feature: FeatureType,
  client?: Prisma.TransactionClient | typeof prisma
): Promise<{ allowed: boolean; current: number; max: number; plan: Plan; message?: string }> {
  const db = client ?? prisma

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true },
  })

  const plan = org?.plan ?? 'FREE'
  const limits = getPlanLimits(plan)

  if (feature === 'members') {
    if (limits.maxMembers === Infinity) {
      return { allowed: true, current: 0, max: Infinity, plan }
    }

    const memberCount = await db.membership.count({
      where: { organizationId },
    })
    const pendingInvites = await db.invitation.count({
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
    if (limits.monthlyUploads === Infinity) {
      return { allowed: true, current: 0, max: Infinity, plan }
    }

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const uploadCount = await db.dataset.count({
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
        : `Your monthly upload limit of ${limits.monthlyUploads} CSV files for the ${limits.name} plan has been reached. Upgrade to Pro for 50 uploads/month.`,
    }
  }

  if (feature === 'reports') {
    if (limits.maxSavedReports === Infinity) {
      return { allowed: true, current: 0, max: Infinity, plan }
    }

    const reportCount = await db.savedReport.count({
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
    if (limits.maxWorkspaces === Infinity) {
      return { allowed: true, current: 0, max: Infinity, plan }
    }

    const workspaceCount = await db.workspace.count({
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

  if (feature === 'export') {
    const allowed = limits.canExportCsv

    return {
      allowed,
      current: 0,
      max: limits.maxRowsPerCsv,
      plan,
      message: allowed
        ? undefined
        : `CSV export is not available on your ${limits.name} plan. Upgrade to Pro or Advanced to export data.`,
    }
  }

  if (feature === 'audit_logs') {
    const allowed = limits.hasAuditLogs

    return {
      allowed,
      current: 0,
      max: 1,
      plan,
      message: allowed
        ? undefined
        : `Audit activity logging is not included in the ${limits.name} plan. Upgrade to Pro or Advanced to view audit logs.`,
    }
  }

  return { allowed: true, current: 0, max: Infinity, plan }
}
