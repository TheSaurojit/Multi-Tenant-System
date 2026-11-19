import { prisma } from './db'
import Papa from 'papaparse'
import { getPlanLimits } from './plans'
import { Prisma } from '../../generated/prisma'
import { unstable_cache } from 'next/cache'

export interface AnalyticsFilter {
  organizationId: string
  workspaceId?: string
  datasetId?: string
  startDate?: Date
  endDate?: Date
  categories?: string[]
  cacheIdentity?: {
    range?: string
    startDate?: string
    endDate?: string
  }
}

export interface KpiSummary {
  primaryLabel: string
  primaryTotal: number
  primaryChange: number | null // percentage or null
  secondaryLabel: string
  secondaryTotal: number
  secondaryChange: number | null
  tertiaryLabel: string
  tertiaryTotal: number
  tertiaryChange: number | null
  efficiencyLabel: string
  efficiencyValue: number // AOV or ROAS
  efficiencyUnit: string
  totalRecords: number
}

export interface TimeSeriesPoint {
  date: string
  metric1: number
  metric2: number
  metric3: number
}

export interface CategoryBreakdownPoint {
  category: string
  total: number
  percentage: number
}

export interface DatasetItem {
  id: string
  name: string
  type: string
  rowCount: number
  status: string
  createdAt: Date
}

export interface RetentionInfo {
  retentionDays: number
  hiddenCount: number
  plan: string
}

export function resolveDateRange(params: {
  range?: string
  startDate?: string
  endDate?: string
}): { startDate?: Date; endDate?: Date } {
  const { startDate: customStartDateStr, endDate: customEndDateStr } = params
  // Default range preset to 'last30' when no range or custom dates are specified
  const range = params.range || (!customStartDateStr && !customEndDateStr ? 'last30' : undefined)
  const now = new Date()

  let startDate: Date | undefined
  let endDate: Date | undefined

  if (range === 'custom') {
    if (customStartDateStr) {
      const d = new Date(customStartDateStr)
      if (!isNaN(d.getTime())) startDate = d
    }
    if (customEndDateStr) {
      const d = new Date(customEndDateStr)
      if (!isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999)
        endDate = d
      }
    }
  } else if (range === 'last7') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    endDate = now
  } else if (range === 'last30') {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    endDate = now
  } else if (range === 'last90') {
    startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    endDate = now
  } else if (range === 'ytd') {
    startDate = new Date(now.getFullYear(), 0, 1)
    endDate = now
  } else if (range === 'all') {
    endDate = now
  }

  // Fallback support for explicit date query strings if not set by range preset
  if (!startDate && customStartDateStr) {
    const d = new Date(customStartDateStr)
    if (!isNaN(d.getTime())) startDate = d
  }
  if (!endDate && customEndDateStr) {
    const d = new Date(customEndDateStr)
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999)
      endDate = d
    }
  }

  return { startDate, endDate }
}

export async function computeWorkspaceAnalytics(filter: AnalyticsFilter) {
  const org = await prisma.organization.findUnique({
    where: { id: filter.organizationId },
    select: { plan: true },
  })
  const planLimits = getPlanLimits(org?.plan || 'FREE')
  const retentionCutoff = new Date(Date.now() - planLimits.retentionDays * 24 * 60 * 60 * 1000)

  const rollupWhereClause: Prisma.DailyRollupWhereInput = {
    organizationId: filter.organizationId,
    dataset: { status: 'COMPLETED' },
  }

  if (filter.workspaceId) {
    rollupWhereClause.workspaceId = filter.workspaceId
  }

  if (filter.datasetId && filter.datasetId !== 'all') {
    rollupWhereClause.datasetId = filter.datasetId
  }

  // Retention limit enforcement: date cannot be older than retentionCutoff
  let effectiveStartDate = filter.startDate
  if (!effectiveStartDate || effectiveStartDate < retentionCutoff) {
    effectiveStartDate = retentionCutoff
  }

  rollupWhereClause.date = {
    gte: effectiveStartDate,
  }

  if (filter.endDate) {
    rollupWhereClause.date.lte = filter.endDate
  }

  if (filter.categories && filter.categories.length > 0) {
    rollupWhereClause.category = { in: filter.categories }
  }

  // 1. High-Performance Rollup Aggregation for Totals & Count
  const totalsPromise = prisma.dailyRollup.aggregate({
    where: rollupWhereClause,
    _sum: {
      metric1: true,
      metric2: true,
      metric3: true,
      recordCount: true,
    },
  })

  // 2. High-Performance Rollup GroupBy for Time Series (scans ~3,650 rows instead of 1M)
  const timeSeriesPromise = prisma.dailyRollup.groupBy({
    by: ['date'],
    where: rollupWhereClause,
    _sum: {
      metric1: true,
      metric2: true,
      metric3: true,
    },
    orderBy: {
      date: 'asc',
    },
  })

  // 3. High-Performance Rollup GroupBy for Category Breakdown
  const categoryBreakdownPromise = prisma.dailyRollup.groupBy({
    by: ['category'],
    where: rollupWhereClause,
    _sum: {
      metric1: true,
    },
    orderBy: {
      _sum: {
        metric1: 'desc',
      },
    },
  })

  // 4. Combined Datasets Lookup (provides datasets and active dataset in 1 fast query)
  const datasetsPromise = prisma.dataset.findMany({
    where: {
      organizationId: filter.organizationId,
      ...(filter.workspaceId ? { workspaceId: filter.workspaceId } : {}),
    },
    select: { id: true, name: true, type: true, rowCount: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  // 5. Prior Period Aggregate Calculation via DailyRollup
  let priorPeriodPromise: Promise<{
    _sum: {
      metric1: Prisma.Decimal | null
      metric2: Prisma.Decimal | null
      metric3: Prisma.Decimal | null
    }
  } | null> = Promise.resolve(null)

  if (effectiveStartDate) {
    const periodEnd = filter.endDate ?? new Date()
    const durationMs = periodEnd.getTime() - effectiveStartDate.getTime()
    if (durationMs > 0) {
      const priorPeriodStart = new Date(effectiveStartDate.getTime() - durationMs)
      const priorPeriodEnd = effectiveStartDate

      priorPeriodPromise = prisma.dailyRollup.aggregate({
        where: {
          organizationId: filter.organizationId,
          dataset: { status: 'COMPLETED' },
          ...(filter.workspaceId ? { workspaceId: filter.workspaceId } : {}),
          ...(filter.datasetId && filter.datasetId !== 'all' ? { datasetId: filter.datasetId } : {}),
          ...(filter.categories && filter.categories.length > 0 ? { category: { in: filter.categories } } : {}),
          date: {
            gte: priorPeriodStart >= retentionCutoff ? priorPeriodStart : retentionCutoff,
            lt: priorPeriodEnd,
          },
        },
        _sum: {
          metric1: true,
          metric2: true,
          metric3: true,
        },
      })
    }
  }

  // 6. Count data points hidden specifically by retention cutoff via pre-aggregated DailyRollup
  const hiddenCountPromise = prisma.dailyRollup.aggregate({
    where: {
      organizationId: filter.organizationId,
      dataset: { status: 'COMPLETED' },
      ...(filter.workspaceId ? { workspaceId: filter.workspaceId } : {}),
      ...(filter.datasetId && filter.datasetId !== 'all' ? { datasetId: filter.datasetId } : {}),
      date: {
        lt: retentionCutoff,
      },
    },
    _sum: {
      recordCount: true,
    },
  })

  // 7. Retention-Aware Available Categories via DailyRollup
  const availableCategoriesWhere: Prisma.DailyRollupWhereInput = {
    organizationId: filter.organizationId,
    dataset: { status: 'COMPLETED' },
    date: {
      gte: retentionCutoff,
    },
  }
  if (filter.workspaceId) {
    availableCategoriesWhere.workspaceId = filter.workspaceId
  }
  if (filter.datasetId && filter.datasetId !== 'all') {
    availableCategoriesWhere.datasetId = filter.datasetId
  }

  const availableCategoriesPromise = prisma.dailyRollup.groupBy({
    by: ['category'],
    where: availableCategoriesWhere,
    orderBy: {
      category: 'asc',
    },
  })

  // Execute all independent queries concurrently via Promise.all
  const [
    totals,
    timeSeriesGroups,
    categoryGroups,
    priorPeriodTotals,
    allDatasets,
    hiddenCountResult,
    availableCategoriesGroups,
  ] = await Promise.all([
    totalsPromise,
    timeSeriesPromise,
    categoryBreakdownPromise,
    priorPeriodPromise,
    datasetsPromise,
    hiddenCountPromise,
    availableCategoriesPromise,
  ])

  const completedDatasets = allDatasets.filter((d) => d.status === 'COMPLETED')
  const dataset = filter.datasetId && filter.datasetId !== 'all'
    ? completedDatasets.find((d) => d.id === filter.datasetId) || null
    : completedDatasets[0] || null

  const availableCategories = availableCategoriesGroups
    .map((g) => g.category)
    .filter(Boolean)
  const hiddenCount = Number(hiddenCountResult._sum.recordCount || 0)

  const datasets = allDatasets

  const isMarketing = dataset?.type === 'MARKETING'

  // Metric Labels based on dataset type
  const primaryLabel = isMarketing ? 'Total Ad Spend' : 'Total Revenue'
  const secondaryLabel = isMarketing ? 'Impressions / Clicks' : 'Total Costs'
  const tertiaryLabel = isMarketing ? 'Total Conversions' : 'Units Sold'
  const efficiencyLabel = isMarketing ? 'Cost per Acquisition' : 'Average Order Value'
  const efficiencyUnit = '₹'

  // Extract totals safely from Decimal sums
  const primaryTotal = Number(totals._sum.metric1 || 0)
  const secondaryTotal = Number(totals._sum.metric2 || 0)
  const tertiaryTotal = Number(totals._sum.metric3 || 0)
  const totalRecords = Number(totals._sum.recordCount || 0)

  // Transform daily time-series
  const timeSeries: TimeSeriesPoint[] = timeSeriesGroups.map((g) => ({
    date: g.date.toISOString().split('T')[0],
    metric1: Math.round(Number(g._sum.metric1 || 0) * 100) / 100,
    metric2: Math.round(Number(g._sum.metric2 || 0) * 100) / 100,
    metric3: Math.round(Number(g._sum.metric3 || 0) * 100) / 100,
  }))

  // Transform category breakdown
  const categoryBreakdown: CategoryBreakdownPoint[] = categoryGroups.map((cg) => {
    const catTotal = Number(cg._sum.metric1 || 0)
    return {
      category: cg.category || 'Other',
      total: Math.round(catTotal * 100) / 100,
      percentage: primaryTotal > 0 ? Math.round((catTotal / primaryTotal) * 1000) / 10 : 0,
    }
  })

  // Efficiency calculation
  let efficiencyValue = 0
  if (isMarketing) {
    efficiencyValue = tertiaryTotal > 0 ? primaryTotal / tertiaryTotal : 0
  } else {
    efficiencyValue = tertiaryTotal > 0 ? primaryTotal / tertiaryTotal : (totalRecords > 0 ? primaryTotal / totalRecords : 0)
  }

  // True Period-over-period comparison (compare with previous adjacent window of identical duration)
  let primaryChange: number | null = null
  let secondaryChange: number | null = null
  let tertiaryChange: number | null = null

  if (priorPeriodTotals?._sum) {
    const priorPrimary = Number(priorPeriodTotals._sum.metric1 || 0)
    const priorSecondary = Number(priorPeriodTotals._sum.metric2 || 0)
    const priorTertiary = Number(priorPeriodTotals._sum.metric3 || 0)

    if (priorPrimary > 0) {
      primaryChange = Math.round(((primaryTotal - priorPrimary) / priorPrimary) * 1000) / 10
    }
    if (priorSecondary > 0) {
      secondaryChange = Math.round(((secondaryTotal - priorSecondary) / priorSecondary) * 1000) / 10
    }
    if (priorTertiary > 0) {
      tertiaryChange = Math.round(((tertiaryTotal - priorTertiary) / priorTertiary) * 1000) / 10
    }
  }

  return {
    kpis: {
      primaryLabel,
      primaryTotal: Math.round(primaryTotal * 100) / 100,
      primaryChange,
      secondaryLabel,
      secondaryTotal: Math.round(secondaryTotal * 100) / 100,
      secondaryChange,
      tertiaryLabel,
      tertiaryTotal: Math.round(tertiaryTotal * 100) / 100,
      tertiaryChange,
      efficiencyLabel,
      efficiencyValue: Math.round(efficiencyValue * 100) / 100,
      efficiencyUnit,
      totalRecords,
    },
    timeSeries,
    categoryBreakdown,
    availableCategories,
    datasets,
    isMarketing,
    retentionInfo: {
      retentionDays: planLimits.retentionDays,
      hiddenCount,
      plan: org?.plan || 'FREE',
    },
  }
}

export function getWorkspaceAnalyticsCacheKey(filter: AnalyticsFilter): string[] {
  const startStr = filter.cacheIdentity
    ? filter.cacheIdentity.startDate || 'none'
    : filter.startDate?.toISOString() || 'none'
  const endStr = filter.cacheIdentity
    ? filter.cacheIdentity.endDate || 'none'
    : filter.endDate?.toISOString() || 'none'
  const catStr =
    filter.categories && filter.categories.length > 0
      ? [...filter.categories].sort().join(',')
      : 'all'

  return [
    'workspace-analytics',
    filter.organizationId,
    filter.workspaceId || 'all',
    filter.datasetId || 'all',
    filter.cacheIdentity?.range || 'resolved',
    startStr,
    endStr,
    catStr,
  ]
}

export async function getWorkspaceAnalytics(filter: AnalyticsFilter) {
  if (typeof unstable_cache !== 'function') {
    return computeWorkspaceAnalytics(filter)
  }

  const workspaceId = filter.workspaceId || 'all'
  const cacheKey = getWorkspaceAnalyticsCacheKey(filter)

  const cachedFn = unstable_cache(
    async () => computeWorkspaceAnalytics(filter),
    cacheKey,
    {
      revalidate: 60,
      tags: [
        'analytics',
        `analytics-${workspaceId}`,
        `analytics-org-${filter.organizationId}`,
      ],
    }
  )

  return cachedFn()
}

function sanitizeCsvValue(val: unknown): string | number {
  if (val === null || val === undefined) return ''
  if (typeof val === 'number') return val
  const str = String(val)
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`
  }
  return str
}

export function exportDataPointsToCsv(
  dataPoints: Array<{
    date?: Date | string
    category: string
    subCategory?: string | null
    metric1: number | Prisma.Decimal
    metric2: number | Prisma.Decimal
    metric3: number | Prisma.Decimal
    region?: string | null
    channel?: string | null
  }>,
  isMarketing: boolean = false
): string {
  const exportRows = dataPoints.map((p) => ({
    Date: p.date ? new Date(p.date).toISOString().split('T')[0] : '',
    Category: sanitizeCsvValue(p.category),
    SubCategory: sanitizeCsvValue(p.subCategory || ''),
    [isMarketing ? 'Spend' : 'Revenue']: Number(p.metric1),
    [isMarketing ? 'Impressions' : 'Cost']: Number(p.metric2),
    [isMarketing ? 'Conversions' : 'UnitsSold']: Number(p.metric3),
    Region: sanitizeCsvValue(p.region || ''),
    Channel: sanitizeCsvValue(p.channel || ''),
  }))

  return Papa.unparse(exportRows)
}
