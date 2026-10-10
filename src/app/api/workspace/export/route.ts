import { NextRequest, NextResponse } from 'next/server'
import { requireAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { assertPermission } from '@/lib/permissions'
import { checkFeatureLimit } from '@/lib/feature-limits'
import { checkRateLimit } from '@/lib/rate-limit'
import { getPlanLimits } from '@/lib/plans'
import { ExportCsvFilterSchema } from '@/lib/validations'
import { exportDataPointsToCsv } from '@/lib/analytics-engine'
import { logAuditEvent } from '@/lib/audit'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser()
    assertPermission(user.role, 'data:export')

    const exportRate = checkRateLimit(`export:${user.id}`, 20, 5 * 60 * 1000)
    if (!exportRate.allowed) {
      return NextResponse.json(
        { error: 'Too many export requests. Please try again shortly.' },
        { status: 429 }
      )
    }

    const exportLimit = await checkFeatureLimit(user.activeOrgId, 'export')
    if (!exportLimit.allowed) {
      return NextResponse.json(
        { error: exportLimit.message || 'CSV export is not available on your plan.' },
        { status: 403 }
      )
    }

    const org = await prisma.organization.findUnique({
      where: { id: user.activeOrgId },
      select: { plan: true },
    })
    const planLimits = getPlanLimits(org?.plan || 'FREE')

    if (!planLimits.canExportCsv) {
      return NextResponse.json(
        { error: 'CSV export is not available on your current plan.' },
        { status: 403 }
      )
    }

    const searchParams = req.nextUrl.searchParams
    const rawParams = {
      datasetId: searchParams.get('datasetId') || undefined,
      range: searchParams.get('range') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      category: searchParams.get('category') || undefined,
    }

    const parsed = ExportCsvFilterSchema.safeParse(rawParams)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid export filter parameters.' },
        { status: 400 }
      )
    }
    const { datasetId, range, startDate: customStartDate, endDate: customEndDate, category } = parsed.data

    const now = new Date()
    const retentionCutoff = new Date(Date.now() - planLimits.retentionDays * 24 * 60 * 60 * 1000)

    let filterStart: Date | undefined
    let filterEnd: Date | undefined

    if (range === 'custom') {
      if (customStartDate) {
        const d = new Date(customStartDate)
        if (!isNaN(d.getTime())) filterStart = d
      }
      if (customEndDate) {
        const d = new Date(customEndDate)
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

    if (!filterStart && customStartDate) {
      const d = new Date(customStartDate)
      if (!isNaN(d.getTime())) filterStart = d
    }
    if (!filterEnd && customEndDate) {
      const d = new Date(customEndDate)
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
    const csvContent = exportDataPointsToCsv(dataPoints, isMarketing)

    await logAuditEvent({
      organizationId: user.activeOrgId,
      userId: user.id,
      action: 'SETTINGS_UPDATED',
      entityType: 'Workspace',
      entityId: user.activeWorkspaceId,
      details: {
        event: 'CSV_EXPORT',
        rowCount: dataPoints.length,
        filters: rawParams,
      },
    })

    const dateTag = now.toISOString().split('T')[0]
    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="workspace-export-${dateTag}.csv"`,
      },
    })
  } catch (err: any) {
    console.error('Export route error:', err)
    return NextResponse.json(
      { error: err?.message || 'CSV export failed.' },
      { status: err?.message?.includes('Unauthorized') ? 401 : 500 }
    )
  }
}
