'use server'

import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { assertPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { checkFeatureLimit } from '@/lib/feature-limits'
import { revalidatePath } from 'next/cache'

export async function saveReportAction({
  name,
  description,
  filters,
}: {
  name: string
  description?: string
  filters: any
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  assertPermission(user.role, 'reports:create')

  const limitCheck = await checkFeatureLimit(user.activeOrgId, 'reports')
  if (!limitCheck.allowed) {
    return { error: limitCheck.message }
  }

  const report = await prisma.savedReport.create({
    data: {
      name,
      description,
      filters,
      organizationId: user.activeOrgId,
      workspaceId: user.activeWorkspaceId,
      createdById: user.id,
    },
  })

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'REPORT_CREATED',
    entityType: 'SavedReport',
    entityId: report.id,
    details: { reportName: name },
  })

  revalidatePath('/dashboard')
  revalidatePath('/reports')
  return { success: true, reportId: report.id }
}

export async function deleteReportAction(reportId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  assertPermission(user.role, 'reports:delete')

  const report = await prisma.savedReport.findUnique({
    where: { id: reportId },
  })

  if (!report || report.organizationId !== user.activeOrgId) {
    throw new Error('Report not found')
  }

  await prisma.savedReport.delete({
    where: { id: reportId },
  })

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'REPORT_DELETED',
    entityType: 'SavedReport',
    entityId: reportId,
    details: { reportName: report.name },
  })

  revalidatePath('/dashboard')
  revalidatePath('/reports')
  return { success: true }
}
