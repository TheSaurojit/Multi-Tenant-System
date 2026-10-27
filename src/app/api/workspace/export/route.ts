import { NextRequest, NextResponse } from 'next/server'
import { requireAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { assertPermission } from '@/lib/permissions'
import { checkFeatureLimit } from '@/lib/feature-limits'
import { checkRateLimit } from '@/lib/rate-limit'
import { getPlanLimits } from '@/lib/plans'
import { ExportCsvFilterSchema } from '@/lib/validations'
import { exportDataPointsToCsv, resolveDateRange } from '@/lib/analytics-engine'
import { logAuditEvent } from '@/lib/audit'
import { Prisma } from '../../../../../generated/prisma'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser()
    assertPermission(user.role, 'data:export')

    const exportRate = await checkRateLimit(`export:${user.id}`, 20, 5 * 60 * 1000)
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

    const retentionCutoff = new Date(Date.now() - planLimits.retentionDays * 24 * 60 * 60 * 1000)

    const { startDate: filterStart, endDate: filterEnd } = resolveDateRange({
      range,
      startDate: customStartDate,
      endDate: customEndDate,
    })

    let effectiveStartDate = filterStart
    if (!effectiveStartDate || effectiveStartDate < retentionCutoff) {
      effectiveStartDate = retentionCutoff
    }

    const whereClause: Prisma.DataPointWhereInput = {
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

    const dateTag = new Date().toISOString().split('T')[0]
    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="workspace-export-${dateTag}.csv"`,
      },
    })
  } catch (err: unknown) {
    console.error('Export route error:', err)
    const errMsg = err instanceof Error ? err.message : 'CSV export failed.'
    return NextResponse.json(
      { error: errMsg },
      { status: errMsg.includes('Unauthorized') ? 401 : 500 }
    )
  }
}
