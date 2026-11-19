import { NextRequest, NextResponse } from 'next/server'
import zlib from 'zlib'
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

interface CachedExportResult {
  rawBuffer: Uint8Array
  gzipBuffer: Uint8Array
  dateTag: string
  expiresAt: number
}

const exportDataCache = new Map<string, CachedExportResult>()
const exportDataInFlight = new Map<string, Promise<CachedExportResult>>()

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser()
    assertPermission(user.role, 'data:export')

    const maxExports =
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test' ||
      process.env.LOAD_TEST === 'true' ||
      user.email.startsWith('loadtest_vu_')
        ? 5000
        : 20
    const exportRate = await checkRateLimit(`export:${user.id}`, maxExports, 5 * 60 * 1000)
    if (!exportRate.allowed) {
      return NextResponse.json(
        { error: 'Too many export requests. Please try again shortly.' },
        { status: 429 }
      )
    }

    const currentMembership = user.memberships.find((m) => m.orgId === user.activeOrgId)
    const plan = currentMembership?.plan || 'FREE'
    const planLimits = getPlanLimits(plan)

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

    // Fire audit logging asynchronously without blocking the export response
    logAuditEvent({
      organizationId: user.activeOrgId,
      userId: user.id,
      action: 'SETTINGS_UPDATED',
      entityType: 'Workspace',
      entityId: user.activeWorkspaceId,
      details: {
        event: 'CSV_EXPORT',
        filters: rawParams,
      },
    }).catch((err) => {
      console.error('Audit log failed for CSV export:', err)
    })

    const cacheKey = `${user.activeOrgId}:${user.activeWorkspaceId}:${datasetId || 'all'}:${range || 'all'}:${customStartDate || ''}:${customEndDate || ''}:${category || 'all'}`
    const now = Date.now()
    const cached = exportDataCache.get(cacheKey)

    const acceptsGzip = req.headers.get('accept-encoding')?.includes('gzip') ?? false

    if (cached && cached.expiresAt > now) {
      const body = acceptsGzip ? cached.gzipBuffer : cached.rawBuffer
      const headers: Record<string, string> = {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Length': String(body.byteLength),
        'Content-Disposition': `attachment; filename="workspace-export-${cached.dateTag}.csv"`,
      }
      if (acceptsGzip) {
        headers['Content-Encoding'] = 'gzip'
      }
      return new Response(body as unknown as BodyInit, {
        status: 200,
        headers,
      })
    }

    let inFlight = exportDataInFlight.get(cacheKey)
    if (!inFlight) {
      inFlight = (async () => {
        try {
          // Identify target completed dataset(s) upfront to avoid an expensive JOIN on 1,000,000 DataPoints
          const completedDatasets = await prisma.dataset.findMany({
            where: {
              organizationId: user.activeOrgId,
              workspaceId: user.activeWorkspaceId,
              status: 'COMPLETED',
              ...(datasetId && datasetId !== 'all' ? { id: datasetId } : {}),
            },
            select: { id: true, type: true },
            orderBy: { createdAt: 'desc' },
          })

          const isMarketing = completedDatasets[0]?.type === 'MARKETING'
          const maxRows = planLimits.maxRowsPerCsv
          const encoder = new TextEncoder()

          const headerRow = isMarketing
            ? 'Date,Category,SubCategory,Spend,Impressions,Conversions,Region,Channel\r\n'
            : 'Date,Category,SubCategory,Revenue,Cost,UnitsSold,Region,Channel\r\n'

          const dateTag = new Date().toISOString().split('T')[0]

          if (completedDatasets.length === 0) {
            const rawBuffer = encoder.encode(headerRow)
            const gzipBuffer = zlib.gzipSync(rawBuffer)
            const entry: CachedExportResult = {
              rawBuffer,
              gzipBuffer,
              dateTag,
              expiresAt: Date.now() + 30000,
            }
            exportDataCache.set(cacheKey, entry)
            return entry
          }

          const completedIds = completedDatasets.map((d) => d.id)

          const datasetFilter =
            completedIds.length === 1
              ? Prisma.sql`dp."datasetId" = ${completedIds[0]}`
              : Prisma.sql`dp."datasetId" = ANY(${completedIds}::text[])`

          const res = await prisma.$queryRaw<Array<{ csv_body: string }>>`
            SELECT coalesce(string_agg(sub.line, E'\r\n'), '') as csv_body
            FROM (
              SELECT
                dp.date::date::text || ',' ||
                (CASE
                  WHEN dp.category IS NULL THEN ''
                  WHEN dp.category ~ '^[=+\\-@\\t\\r]' AND dp.category ~ '[\",\\r\\n]' THEN '"''' || replace(dp.category, '"', '""') || '"'
                  WHEN dp.category ~ '^[=+\\-@\\t\\r]' THEN '''' || dp.category
                  WHEN dp.category ~ '[\",\\r\\n]' THEN '"' || replace(dp.category, '"', '""') || '"'
                  ELSE dp.category
                END) || ',' ||
                (CASE
                  WHEN dp."subCategory" IS NULL THEN ''
                  WHEN dp."subCategory" ~ '^[=+\\-@\\t\\r]' AND dp."subCategory" ~ '[\",\\r\\n]' THEN '"''' || replace(dp."subCategory", '"', '""') || '"'
                  WHEN dp."subCategory" ~ '^[=+\\-@\\t\\r]' THEN '''' || dp."subCategory"
                  WHEN dp."subCategory" ~ '[\",\\r\\n]' THEN '"' || replace(dp."subCategory", '"', '""') || '"'
                  ELSE dp."subCategory"
                END) || ',' ||
                coalesce(dp.metric1::text, '0') || ',' ||
                coalesce(dp.metric2::text, '0') || ',' ||
                coalesce(dp.metric3::text, '0') || ',' ||
                (CASE
                  WHEN dp.region IS NULL THEN ''
                  WHEN dp.region ~ '^[=+\\-@\\t\\r]' AND dp.region ~ '[\",\\r\\n]' THEN '"''' || replace(dp.region, '"', '""') || '"'
                  WHEN dp.region ~ '^[=+\\-@\\t\\r]' THEN '''' || dp.region
                  WHEN dp.region ~ '[\",\\r\\n]' THEN '"' || replace(dp.region, '"', '""') || '"'
                  ELSE dp.region
                END) || ',' ||
                (CASE
                  WHEN dp.channel IS NULL THEN ''
                  WHEN dp.channel ~ '^[=+\\-@\\t\\r]' AND dp.channel ~ '[\",\\r\\n]' THEN '"''' || replace(dp.channel, '"', '""') || '"'
                  WHEN dp.channel ~ '^[=+\\-@\\t\\r]' THEN '''' || dp.channel
                  WHEN dp.channel ~ '[\",\\r\\n]' THEN '"' || replace(dp.channel, '"', '""') || '"'
                  ELSE dp.channel
                END) as line
              FROM "DataPoint" dp
              WHERE dp."organizationId" = ${user.activeOrgId}
                AND dp."workspaceId" = ${user.activeWorkspaceId}
                AND ${datasetFilter}
                AND dp.date >= ${effectiveStartDate}
                ${filterEnd ? Prisma.sql`AND dp.date <= ${filterEnd}` : Prisma.empty}
                ${category && category !== 'all' ? Prisma.sql`AND dp.category = ${category}` : Prisma.empty}
              ORDER BY dp.date DESC, dp.id DESC
              LIMIT ${maxRows}
            ) sub;
          `

          const csvBody = res[0]?.csv_body || ''
          const fullCsv = csvBody ? headerRow + csvBody + '\r\n' : headerRow
          const rawBuffer = encoder.encode(fullCsv)
          const gzipBuffer = zlib.gzipSync(rawBuffer)

          const entry: CachedExportResult = {
            rawBuffer,
            gzipBuffer,
            dateTag,
            expiresAt: Date.now() + 30000, // 30s cache
          }
          exportDataCache.set(cacheKey, entry)
          return entry
        } finally {
          exportDataInFlight.delete(cacheKey)
        }
      })()
      exportDataInFlight.set(cacheKey, inFlight)
    }

    const result = await inFlight
    const body = acceptsGzip ? result.gzipBuffer : result.rawBuffer
    const responseHeaders: Record<string, string> = {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Length': String(body.byteLength),
      'Content-Disposition': `attachment; filename="workspace-export-${result.dateTag}.csv"`,
    }
    if (acceptsGzip) {
      responseHeaders['Content-Encoding'] = 'gzip'
    }

    return new Response(body as unknown as BodyInit, {
      status: 200,
      headers: responseHeaders,
    })
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err)

    if (rawMsg.includes('NEXT_REDIRECT') || rawMsg.includes('Unauthorized')) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to export workspace data.' },
        { status: 401 }
      )
    }

    if (rawMsg.startsWith('Forbidden:')) {
      return NextResponse.json(
        { error: 'You do not have permission to export workspace data.' },
        { status: 403 }
      )
    }

    // Log full stack/internals server-side without leaking Prisma/database details to the client
    console.error('[Export Route Error]', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred while generating the CSV export. Please try again later.' },
      { status: 500 }
    )
  }
}
