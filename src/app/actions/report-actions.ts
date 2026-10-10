'use server'

import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { assertPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { checkFeatureLimit } from '@/lib/feature-limits'
import { getPlanLimits } from '@/lib/plans'
import { checkRateLimit } from '@/lib/rate-limit'
import { SaveReportSchema, EntityIdSchema, ExportCsvFilterSchema } from '@/lib/validations'
import { revalidatePath } from 'next/cache'
import Papa from 'papaparse'

function sanitizeCsvCell(val: string | number | null | undefined): string | number {
  if (val === null || val === undefined) return ''
  if (typeof val === 'number') return val
  const str = String(val)
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`
  }
  return str
}

export async function saveReportAction({
  name,
  description,
  filters,
}: {
  name: string
  description?: string
  filters: any
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

export async function exportFilteredCsvAction(rawParams: {
  datasetId?: string
  range?: string
  startDate?: string
  endDate?: string
  category?: string
}) {
  const parsed = ExportCsvFilterSchema.safeParse(rawParams)
  if (!parsed.success) {
    return { error: 'Invalid export filter parameters.' }
  }
  const { datasetId, range, startDate, endDate, category } = parsed.data

  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  assertPermission(user.role, 'data:export')

  const exportRate = checkRateLimit(`export:${user.id}`, 20, 5 * 60 * 1000)
  if (!exportRate.allowed) {
    return {
      error: `Too many export requests. Please try again in ${exportRate.resetInSeconds} seconds.`,
    }
  }

  const exportLimit = await checkFeatureLimit(user.activeOrgId, 'export')
  if (!exportLimit.allowed) {
    return { error: exportLimit.message || 'CSV export is not available on your plan.' }
  }

  const org = await prisma.organization.findUnique({
    where: { id: user.activeOrgId },
    select: { plan: true },
  })
  const planLimits = getPlanLimits(org?.plan || 'FREE')
  const retentionCutoff = new Date(Date.now() - planLimits.retentionDays * 24 * 60 * 60 * 1000)
  const now = new Date()

  let filterStart: Date | undefined
  let filterEnd: Date | undefined

  if (range === 'custom') {
    if (startDate) {
      const d = new Date(startDate)
      if (!isNaN(d.getTime())) filterStart = d
    }
    if (endDate) {
      const d = new Date(endDate)
      if (!isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999)
        filterEnd = d
      }
    }
  } else if (range === 'last7') {
    filterStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    filterEnd = now
  } else if (range === 'last30') {
    filterStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    filterEnd = now
  } else if (range === 'last90') {
    filterStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    filterEnd = now
  } else if (range === 'ytd') {
    filterStart = new Date(now.getFullYear(), 0, 1)
    filterEnd = now
  } else if (range === 'all') {
    filterEnd = now
  }

  if (!filterStart && startDate) {
    const d = new Date(startDate)
    if (!isNaN(d.getTime())) filterStart = d
  }
  if (!filterEnd && endDate) {
    const d = new Date(endDate)
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999)
      filterEnd = d
    }
  }

  let effectiveStartDate = filterStart
  if (!effectiveStartDate || effectiveStartDate < retentionCutoff) {
    effectiveStartDate = retentionCutoff
  }

  const whereClause: any = {
    organizationId: user.activeOrgId,
    workspaceId: user.activeWorkspaceId,
    dataset: { status: 'COMPLETED' },
    date: {
      gte: effectiveStartDate,
      ...(filterEnd ? { lte: filterEnd } : {}),
    },
  }

  if (datasetId && datasetId !== 'all') {
    whereClause.datasetId = datasetId
  }

  if (category && category !== 'all') {
    whereClause.category = category
  }

  const dataPoints = await prisma.dataPoint.findMany({
    where: whereClause,
    orderBy: { date: 'desc' },
    take: planLimits.maxRowsPerCsv,
  })

  const dataset = datasetId && datasetId !== 'all'
    ? await prisma.dataset.findFirst({
        where: {
          id: datasetId,
          organizationId: user.activeOrgId,
          workspaceId: user.activeWorkspaceId,
        },
      })
    : await prisma.dataset.findFirst({
        where: {
          organizationId: user.activeOrgId,
          workspaceId: user.activeWorkspaceId,
          status: 'COMPLETED',
        },
        orderBy: { createdAt: 'desc' },
      })

  const isMarketing = dataset?.type === 'MARKETING'

  const exportRows = dataPoints.map((p) => ({
    Date: p.date ? new Date(p.date).toISOString().split('T')[0] : '',
    Category: sanitizeCsvCell(p.category),
    SubCategory: sanitizeCsvCell(p.subCategory || ''),
    [isMarketing ? 'Spend' : 'Revenue']: p.metric1,
    [isMarketing ? 'Impressions' : 'Cost']: p.metric2,
    [isMarketing ? 'Conversions' : 'UnitsSold']: p.metric3,
    RegionOrChannel: sanitizeCsvCell(p.region || p.channel || ''),
  }))

  const csv = Papa.unparse(exportRows)

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'SETTINGS_UPDATED',
    entityType: 'Workspace',
    entityId: user.activeWorkspaceId,
    details: {
      event: 'CSV Export',
      rowCount: dataPoints.length,
      filters: { datasetId, range, category, startDate, endDate },
    },
  })

  return { success: true, csv, rowCount: dataPoints.length }
}
