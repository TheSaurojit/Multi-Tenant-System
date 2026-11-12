import { NextRequest, NextResponse } from 'next/server'
import { requireAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { assertPermission } from '@/lib/permissions'
import { checkFeatureLimit } from '@/lib/feature-limits'
import { checkRateLimit } from '@/lib/rate-limit'
import { getPlanLimits } from '@/lib/plans'
import { ExportCsvFilterSchema } from '@/lib/validations'
import { resolveDateRange } from '@/lib/analytics-engine'
import { logAuditEvent } from '@/lib/audit'
import { Prisma } from '../../../../../generated/prisma'

function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return ''
  let str = String(val)
  // CSV formula injection protection: neutralize spreadsheet command prefixes
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`
  }
  // Standard RFC 4180 CSV escaping for values containing commas, quotes, or newlines
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser()
    assertPermission(user.role, 'data:export')

    const maxExports =
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test' ||
      process.env.LOAD_TEST === 'true'
        ? 5000
        : 20
    const exportRate = await checkRateLimit(`export:${user.id}`, maxExports, 5 * 60 * 1000)
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
    const maxRows = planLimits.maxRowsPerCsv
    const encoder = new TextEncoder()

    const headerRow = isMarketing
      ? 'Date,Category,SubCategory,Spend,Impressions,Conversions,Region,Channel\r\n'
      : 'Date,Category,SubCategory,Revenue,Cost,UnitsSold,Region,Channel\r\n'

    await logAuditEvent({
      organizationId: user.activeOrgId,
      userId: user.id,
      action: 'SETTINGS_UPDATED',
      entityType: 'Workspace',
      entityId: user.activeWorkspaceId,
      details: {
        event: 'CSV_EXPORT',
        filters: rawParams,
      },
    })

    // Stream the response in chunks to prevent blocking Node's event loop
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(headerRow))

          const BATCH_SIZE = 2500
          let offset = 0

          while (offset < maxRows) {
            const currentTake = Math.min(BATCH_SIZE, maxRows - offset)
            const batch = await prisma.dataPoint.findMany({
              where: whereClause,
              orderBy: { date: 'desc' },
              take: currentTake,
              skip: offset,
              select: {
                date: true,
                category: true,
                subCategory: true,
                metric1: true,
                metric2: true,
                metric3: true,
                region: true,
                channel: true,
              },
            })

            if (batch.length === 0) break

            let chunk = ''
            for (const p of batch) {
              const dateStr = p.date ? new Date(p.date).toISOString().split('T')[0] : ''
              chunk += `${dateStr},${escapeCsvValue(p.category)},${escapeCsvValue(p.subCategory)},${Number(p.metric1) || 0},${Number(p.metric2) || 0},${Number(p.metric3) || 0},${escapeCsvValue(p.region)},${escapeCsvValue(p.channel)}\r\n`
            }

            controller.enqueue(encoder.encode(chunk))
            offset += batch.length

            if (batch.length < currentTake) break

            // Yield to the Node event loop between batches
            await new Promise((resolve) => setImmediate(resolve))
          }

          controller.close()
        } catch (streamErr) {
          controller.error(streamErr)
        }
      },
    })

    const dateTag = new Date().toISOString().split('T')[0]
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="workspace-export-${dateTag}.csv"`,
        'Transfer-Encoding': 'chunked',
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
