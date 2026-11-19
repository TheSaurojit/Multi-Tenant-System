import React from 'react'
import { requireAuthUser } from '@/lib/auth'
import { getWorkspaceAnalytics, resolveDateRange } from '@/lib/analytics-engine'
import { prisma } from '@/lib/db'
import { DashboardView } from '@/components/dashboard/dashboard-view'
import { EmptyState } from '@/components/ui/empty-state'
import { BarChart3 } from 'lucide-react'

import { getPlanLimits } from '@/lib/plans'
import { getRetentionCutoff } from '@/lib/feature-limits'
import { Prisma } from '../../../../generated/prisma'

interface DashboardDataCacheEntry {
  analytics: Awaited<ReturnType<typeof getWorkspaceAnalytics>>
  savedReports: any[]
  recentPoints: any[]
  expiresAt: number
}

const dashboardDataCache = new Map<string, DashboardDataCacheEntry>()
const dashboardInFlight = new Map<string, Promise<DashboardDataCacheEntry>>()

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const currentUser = await requireAuthUser()

  const resolvedParams = await searchParams
  const datasetId = typeof resolvedParams.datasetId === 'string' ? resolvedParams.datasetId : undefined
  const range = typeof resolvedParams.range === 'string' && resolvedParams.range ? resolvedParams.range : 'last30'
  const category = typeof resolvedParams.category === 'string' && resolvedParams.category !== 'all' ? [resolvedParams.category] : undefined
  const customStartDateStr = typeof resolvedParams.startDate === 'string' ? resolvedParams.startDate : undefined
  const customEndDateStr = typeof resolvedParams.endDate === 'string' ? resolvedParams.endDate : undefined

  // Compute date range via shared resolver
  const { startDate, endDate } = resolveDateRange({
    range,
    startDate: customStartDateStr,
    endDate: customEndDateStr,
  })

  // Get active org plan limits from currentUser membership
  const currentMembership = currentUser.memberships.find((m) => m.orgId === currentUser.activeOrgId)
  const plan = currentMembership?.plan || 'FREE'
  const planLimits = getPlanLimits(plan)
  const retentionCutoff = getRetentionCutoff(plan)

  let effectiveRecentStart = startDate
  if (!effectiveRecentStart || effectiveRecentStart < retentionCutoff) {
    effectiveRecentStart = retentionCutoff
  }

  const cacheKey = `${currentUser.activeOrgId}:${currentUser.activeWorkspaceId}:${datasetId || 'all'}:${range}:${category ? category.join(',') : 'all'}:${customStartDateStr || ''}:${customEndDateStr || ''}`
  const now = Date.now()
  let cachedData = dashboardDataCache.get(cacheKey)

  let analytics: Awaited<ReturnType<typeof getWorkspaceAnalytics>>
  let savedReports: any[]
  let recentPoints: any[]

  if (cachedData && cachedData.expiresAt > now) {
    analytics = cachedData.analytics
    savedReports = cachedData.savedReports
    recentPoints = cachedData.recentPoints
  } else {
    let inFlight = dashboardInFlight.get(cacheKey)
    if (!inFlight) {
      inFlight = (async () => {
        try {
          // Resolve completed datasets once to eliminate repeated JOINs on 1M rows
          const completedDatasets = await prisma.dataset.findMany({
            where: {
              organizationId: currentUser.activeOrgId,
              workspaceId: currentUser.activeWorkspaceId,
              status: 'COMPLETED',
              ...(datasetId && datasetId !== 'all' ? { id: datasetId } : {}),
            },
            select: { id: true },
          })
          const completedIds = completedDatasets.map((d) => d.id)

          const recentWhere: Prisma.DataPointWhereInput = {
            organizationId: currentUser.activeOrgId,
            workspaceId: currentUser.activeWorkspaceId,
            datasetId: completedIds.length === 1 ? completedIds[0] : { in: completedIds },
            date: {
              gte: effectiveRecentStart,
              ...(endDate ? { lte: endDate } : {}),
            },
          }
          if (category) recentWhere.category = { in: category }

          const results = await Promise.all([
            getWorkspaceAnalytics({
              organizationId: currentUser.activeOrgId,
              workspaceId: currentUser.activeWorkspaceId,
              datasetId,
              startDate,
              endDate,
              categories: category,
              cacheIdentity: {
                range,
                startDate: customStartDateStr,
                endDate: customEndDateStr,
              },
            }),
            prisma.savedReport.findMany({
              where: {
                organizationId: currentUser.activeOrgId,
                workspaceId: currentUser.activeWorkspaceId,
              },
              orderBy: { updatedAt: 'desc' },
            }),
            prisma.dataPoint.findMany({
              where: recentWhere,
              select: {
                id: true,
                datasetId: true,
                organizationId: true,
                workspaceId: true,
                date: true,
                category: true,
                subCategory: true,
                metric1: true,
                metric2: true,
                metric3: true,
                region: true,
                channel: true,
                metadata: true,
                createdAt: true,
              },
              orderBy: { date: 'desc' },
              take: 15,
            }),
          ])

          const entry: DashboardDataCacheEntry = {
            analytics: results[0],
            savedReports: results[1],
            recentPoints: results[2],
            expiresAt: Date.now() + 30000, // 30 second TTL
          }
          dashboardDataCache.set(cacheKey, entry)
          return entry
        } finally {
          dashboardInFlight.delete(cacheKey)
        }
      })()
      dashboardInFlight.set(cacheKey, inFlight)
    }

    const resolved = await inFlight
    analytics = resolved.analytics
    savedReports = resolved.savedReports
    recentPoints = resolved.recentPoints
  }

  // Check if workspace has any datasets
  if (analytics.datasets.length === 0) {
    return (
      <div className="py-12">
        <EmptyState
          icon={BarChart3}
          title="No Analytics Data in this Workspace"
          description={`Upload your first sales or marketing CSV dataset to '${currentUser.activeWorkspaceName}' in ${currentUser.activeOrgName} to visualize trends, compute unit economics, and generate team reports.`}
          actionLabel="Upload First CSV Dataset"
          href="/datasets?upload=true"
        />
      </div>
    )
  }

  // Serialize Prisma Decimal objects to plain numbers for RSC boundary
  const serializedRecentPoints = recentPoints.map((p) => ({
    id: p.id,
    datasetId: p.datasetId,
    organizationId: p.organizationId,
    workspaceId: p.workspaceId,
    date: p.date,
    category: p.category,
    subCategory: p.subCategory,
    metric1: Number(p.metric1) || 0,
    metric2: Number(p.metric2) || 0,
    metric3: Number(p.metric3) || 0,
    region: p.region,
    channel: p.channel,
    metadata: p.metadata,
    createdAt: p.createdAt,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Analytics Overview
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Real-time KPIs, performance trajectory, and segment breakdowns for {currentUser.activeWorkspaceName} ({currentUser.activeOrgName})
          </p>
        </div>
      </div>

      <DashboardView
        kpis={analytics.kpis}
        timeSeries={analytics.timeSeries}
        categoryBreakdown={analytics.categoryBreakdown}
        availableCategories={analytics.availableCategories}
        datasets={analytics.datasets}
        savedReports={savedReports}
        recentPoints={serializedRecentPoints}
        currentUser={currentUser}
        isMarketing={analytics.isMarketing}
        canExportCsv={planLimits.canExportCsv}
        retentionInfo={analytics.retentionInfo}
      />
    </div>
  )
}
