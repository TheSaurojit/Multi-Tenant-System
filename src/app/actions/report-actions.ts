'use server'

import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { assertPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { checkFeatureLimit } from '@/lib/feature-limits'
import { SaveReportSchema, EntityIdSchema } from '@/lib/validations'
import { revalidatePath } from 'next/cache'

export async function saveReportAction({
  name,
  description,
  filters,
}: {
  name: string
  description?: string
  filters: unknown
}) {
  const parsed = SaveReportSchema.safeParse({ name, description, filters })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid report data.' }
  }
  const validData = parsed.data

  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  assertPermission(user.role, 'reports:create')

  const result = await prisma.$transaction(async (tx) => {
    const limitCheck = await checkFeatureLimit(user.activeOrgId, 'reports', tx)
    if (!limitCheck.allowed) {
      return { error: limitCheck.message }
    }

    const createdReport = await tx.savedReport.create({
      data: {
        name: validData.name,
        description: validData.description,
        filters: validData.filters,
        organizationId: user.activeOrgId,
        workspaceId: user.activeWorkspaceId,
        createdById: user.id,
      },
    })

    return { report: createdReport }
  })

  if ('error' in result && result.error) {
    return { error: result.error }
  }

  if (!('report' in result) || !result.report) {
    return { error: 'Failed to create report.' }
  }

  const report = result.report

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'REPORT_CREATED',
    entityType: 'SavedReport',
    entityId: report.id,
    details: { reportName: validData.name },
  })

  revalidatePath('/dashboard')
  revalidatePath('/reports')
  return { success: true, reportId: report.id }
}

export async function deleteReportAction(reportId: string) {
  const parsedId = EntityIdSchema.safeParse(reportId)
  if (!parsedId.success) {
    return { error: 'Invalid report ID.' }
  }
  const validReportId = parsedId.data

  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  assertPermission(user.role, 'reports:delete')

  const report = await prisma.savedReport.findUnique({
    where: { id: validReportId },
  })

  if (!report || report.organizationId !== user.activeOrgId || report.workspaceId !== user.activeWorkspaceId) {
    return { error: 'Report not found' }
  }

  await prisma.savedReport.delete({
    where: { id: validReportId },
  })

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'REPORT_DELETED',
    entityType: 'SavedReport',
    entityId: validReportId,
    details: { reportName: report.name },
  })

  revalidatePath('/dashboard')
  revalidatePath('/reports')
  return { success: true }
}

