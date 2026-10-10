import React from 'react'
import { requireAuthUser } from '@/lib/auth'
import { getWorkspaceAnalytics } from '@/lib/analytics-engine'
import { prisma } from '@/lib/db'
import { DashboardView } from '@/components/dashboard/dashboard-view'
import { EmptyState } from '@/components/ui/empty-state'
import { BarChart3 } from 'lucide-react'

import { getPlanLimits } from '@/lib/plans'
import { Prisma } from '../../../../generated/prisma'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const currentUser = await requireAuthUser()

  const resolvedParams = await searchParams
  const datasetId = typeof resolvedParams.datasetId === 'string' ? resolvedParams.datasetId : undefined
  const range = typeof resolvedParams.range === 'string' ? resolvedParams.range : 'last90'
  const category = typeof resolvedParams.category === 'string' && resolvedParams.category !== 'all' ? [resolvedParams.category] : undefined
  const customStartDateStr = typeof resolvedParams.startDate === 'string' ? resolvedParams.startDate : undefined
  const customEndDateStr = typeof resolvedParams.endDate === 'string' ? resolvedParams.endDate : undefined

  // Compute date range
  let startDate: Date | undefined
  let endDate: Date | undefined
  const now = new Date()

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

  // Support explicit query params if provided
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

  const analytics = await getWorkspaceAnalytics({
    organizationId: currentUser.activeOrgId,
    workspaceId: currentUser.activeWorkspaceId,
    datasetId,
    startDate,
    endDate,
    categories: category,
  })

  // Check if workspace has any datasets
  const datasetCount = await prisma.dataset.count({
    where: {
      organizationId: currentUser.activeOrgId,
      workspaceId: currentUser.activeWorkspaceId,
    },
  })

  if (datasetCount === 0) {
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

  // Fetch saved reports for this workspace
  const savedReports = await prisma.savedReport.findMany({
    where: {
      organizationId: currentUser.activeOrgId,
      workspaceId: currentUser.activeWorkspaceId,
    },
    orderBy: { updatedAt: 'desc' },
  })

  // Fetch active org plan limits
  const org = await prisma.organization.findUnique({
    where: { id: currentUser.activeOrgId },
    select: { plan: true },
  })
  const planLimits = getPlanLimits(org?.plan || 'FREE')

  // Fetch recent data points for current filter
  const retentionCutoff = new Date(Date.now() - planLimits.retentionDays * 24 * 60 * 60 * 1000)
  let effectiveRecentStart = startDate
  if (!effectiveRecentStart || effectiveRecentStart < retentionCutoff) {
    effectiveRecentStart = retentionCutoff
  }

  const recentWhere: Prisma.DataPointWhereInput = {
    organizationId: currentUser.activeOrgId,
    workspaceId: currentUser.activeWorkspaceId,
    dataset: { status: 'COMPLETED' },
    date: {
      gte: effectiveRecentStart,
      ...(endDate ? { lte: endDate } : {}),
    },
  }
  if (datasetId && datasetId !== 'all') recentWhere.datasetId = datasetId
  if (category) recentWhere.category = { in: category }

  const recentPoints = await prisma.dataPoint.findMany({
    where: recentWhere,
    orderBy: { date: 'desc' },
    take: 50,
  })

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
      />
    </div>
  )
}
