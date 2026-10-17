'use client'

import React, { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  Layers,
  Calendar,
  Filter,
  Download,
  BookmarkPlus,
  ArrowUpRight,
  Database,
  Check,
} from 'lucide-react'
import { DashboardCharts } from './dashboard-charts'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { CurrentUser } from '@/lib/auth'
import { useAuth } from '@/contexts/auth-context'
import { hasPermission } from '@/lib/permissions'
import { saveReportAction } from '@/app/actions/report-actions'
import Link from 'next/link'
import {
  KpiSummary,
  TimeSeriesPoint,
  CategoryBreakdownPoint,
  DatasetItem,
  RetentionInfo,
} from '@/lib/analytics-engine'

export interface SavedReportItem {
  id: string
  name: string
  description?: string | null
  filters: unknown
  updatedAt?: Date
}

export interface DataPointItem {
  id: string
  date: Date
  category: string
  subCategory?: string | null
  metric1: number | string | { toNumber?: () => number; toString: () => string }
  metric2: number | string | { toNumber?: () => number; toString: () => string }
  metric3: number | string | { toNumber?: () => number; toString: () => string }
  region?: string | null
  channel?: string | null
}

interface DashboardViewProps {
  kpis: KpiSummary
  timeSeries: TimeSeriesPoint[]
  categoryBreakdown: CategoryBreakdownPoint[]
  availableCategories: string[]
  datasets: DatasetItem[]
  savedReports: SavedReportItem[]
  recentPoints: DataPointItem[]
  currentUser?: CurrentUser
  isMarketing: boolean
  canExportCsv?: boolean
  retentionInfo?: RetentionInfo
}

export function DashboardView({
  kpis,
  timeSeries,
  categoryBreakdown,
  availableCategories,
  datasets,
  savedReports,
  recentPoints,
  currentUser: propUser,
  isMarketing,
  canExportCsv = true,
  retentionInfo,
}: DashboardViewProps) {
  const auth = useAuth()
  const currentUser = propUser || auth.currentUser
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentDatasetId = searchParams.get('datasetId') || 'all'
  const currentDateRange = searchParams.get('range') || 'last90'
  const currentCategory = searchParams.get('category') || 'all'
  const currentStartDate = searchParams.get('startDate') || ''
  const currentEndDate = searchParams.get('endDate') || ''

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [reportName, setReportName] = useState('')
  const [reportDesc, setReportDesc] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const updateFilters = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all' || !value) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    router.push(`/dashboard?${params.toString()}`)
  }

  const handleExportCsv = async () => {
    if (!canExportCsv) {
      alert('CSV export is not available on your current plan. Please upgrade to export data.')
      return
    }

    setIsExporting(true)

    try {
      const params = new URLSearchParams()
      if (currentDatasetId && currentDatasetId !== 'all') params.set('datasetId', currentDatasetId)
      if (currentDateRange) params.set('range', currentDateRange)
      if (currentStartDate) params.set('startDate', currentStartDate)
      if (currentEndDate) params.set('endDate', currentEndDate)
      if (currentCategory && currentCategory !== 'all') params.set('category', currentCategory)

      const response = await fetch(`/api/workspace/export?${params.toString()}`)
      if (!response.ok) {
        const errJson = await response.json().catch(() => null)
        throw new Error(errJson?.error || 'Failed to export CSV')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `workspace-export-${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(err.message || 'CSV export failed.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleSaveReport = async (e: React.SubmitEvent) => {
    e.preventDefault()
    if (!reportName.trim()) return

    setIsSaving(true)
    setSaveError(null)

    const res = await saveReportAction({
      name: reportName,
      description: reportDesc,
      filters: {
        datasetId: currentDatasetId,
        range: currentDateRange,
        startDate: currentStartDate || undefined,
        endDate: currentEndDate || undefined,
        category: currentCategory,
      },
    })

    setIsSaving(false)
    if (res?.error) {
      setSaveError(res.error)
    } else {
      setIsSaveModalOpen(false)
      setReportName('')
      setReportDesc('')
    }
  }

  const canSaveReport = auth.can('reports:create')

  return (
    <div className="space-y-6">
      {/* Interactive Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Dataset Selector */}
          <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-800/80 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs">
            <Database className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={currentDatasetId}
              onChange={(e) => updateFilters('datasetId', e.target.value)}
              className="bg-transparent border-0 text-zinc-900 dark:text-zinc-100 font-medium focus:ring-0 cursor-pointer pr-2 text-xs"
            >
              <option value="all">All Workspace Datasets ({datasets.length})</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.rowCount} rows)
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Selector */}
          <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-800/80 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs">
            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={currentDateRange}
              onChange={(e) => updateFilters('range', e.target.value)}
              className="bg-transparent border-0 text-zinc-900 dark:text-zinc-100 font-medium focus:ring-0 cursor-pointer pr-2 text-xs"
            >
              <option value="last7">Last 7 Days</option>
              <option value="last30">Last 30 Days</option>
              <option value="last90">Last 90 Days</option>
              <option value="ytd">Year to Date</option>
              <option value="all">All Time</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Custom Date Range Inputs */}
          {currentDateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-800/80 px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs">
                <span className="text-zinc-500 font-medium">From:</span>
                <input
                  type="date"
                  value={currentStartDate}
                  onChange={(e) => updateFilters('startDate', e.target.value)}
                  className="bg-transparent border-0 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-0 cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-1 bg-zinc-50 dark:bg-zinc-800/80 px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs">
                <span className="text-zinc-500 font-medium">To:</span>
                <input
                  type="date"
                  value={currentEndDate}
                  onChange={(e) => updateFilters('endDate', e.target.value)}
                  className="bg-transparent border-0 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-0 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Category Filter */}
          {availableCategories.length > 0 && (
            <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-800/80 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs">
              <Filter className="w-3.5 h-3.5 text-zinc-500" />
              <select
                value={currentCategory}
                onChange={(e) => updateFilters('category', e.target.value)}
                className="bg-transparent border-0 text-zinc-900 dark:text-zinc-100 font-medium focus:ring-0 cursor-pointer pr-2 text-xs"
              >
                <option value="all">All Categories</option>
                {availableCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Saved Reports Quick Select */}
          {savedReports.length > 0 && (
            <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-900/60 text-xs text-indigo-700 dark:text-indigo-300">
              <span className="font-semibold">Report:</span>
              <select
                onChange={(e) => {
                  const r = savedReports.find((rep) => rep.id === e.target.value)
                  if (r && r.filters && typeof r.filters === 'object') {
                    const filters = r.filters as Record<string, string | undefined>
                    const params = new URLSearchParams()
                    if (filters.datasetId) params.set('datasetId', filters.datasetId)
                    if (filters.range) params.set('range', filters.range)
                    if (filters.startDate) params.set('startDate', filters.startDate)
                    if (filters.endDate) params.set('endDate', filters.endDate)
                    if (filters.category) params.set('category', filters.category)
                    router.push(`/dashboard?${params.toString()}`)
                  }
                }}
                defaultValue=""
                className="bg-transparent border-0 text-indigo-900 dark:text-indigo-200 font-medium focus:ring-0 cursor-pointer pr-2 text-xs"
              >
                <option value="" disabled>
                  Load Saved Report...
                </option>
                {savedReports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Action Buttons: Save View & Export CSV */}
        <div className="flex items-center gap-2">
          {canSaveReport && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSaveModalOpen(true)}
              className="text-xs"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              Save View
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            disabled={isExporting || !canExportCsv}
            title={!canExportCsv ? 'Upgrade to Pro or Advanced to export CSV' : 'Export filtered data'}
            className="text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* Retention Policy Banner */}
      {retentionInfo && retentionInfo.hiddenCount > 0 && (
        <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl p-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>{retentionInfo.hiddenCount} data points</strong> are older than your {retentionInfo.retentionDays}-day retention policy and are hidden from current metrics.
            </span>
          </div>
          <Link
            href="/workspace/billing"
            className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 underline shrink-0"
          >
            Upgrade for 365-day history <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Primary Metric */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {kpis.primaryLabel}
            </span>
            {kpis.primaryChange !== null && kpis.primaryChange !== undefined ? (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                  kpis.primaryChange >= 0
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                }`}
              >
                {kpis.primaryChange >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {kpis.primaryChange >= 0 ? `+${kpis.primaryChange}%` : `${kpis.primaryChange}%`}
              </span>
            ) : (
              <span className="text-zinc-400 text-xs font-mono">—</span>
            )}
          </div>
          <div className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            ₹{kpis.primaryTotal.toLocaleString('en-IN')}
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">vs. previous period</p>
        </div>

        {/* Card 2: Secondary Metric */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {kpis.secondaryLabel}
            </span>
            {kpis.secondaryChange !== null && kpis.secondaryChange !== undefined ? (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                  kpis.secondaryChange >= 0
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                }`}
              >
                {kpis.secondaryChange >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {kpis.secondaryChange >= 0 ? `+${kpis.secondaryChange}%` : `${kpis.secondaryChange}%`}
              </span>
            ) : (
              <span className="text-zinc-400 text-xs font-mono">—</span>
            )}
          </div>
          <div className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {isMarketing
              ? kpis.secondaryTotal.toLocaleString('en-IN')
              : `₹${kpis.secondaryTotal.toLocaleString('en-IN')}`}
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">operational costs / traffic</p>
        </div>

        {/* Card 3: Volume Metric */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {kpis.tertiaryLabel}
            </span>
            {kpis.tertiaryChange !== null && kpis.tertiaryChange !== undefined ? (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                  kpis.tertiaryChange >= 0
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                }`}
              >
                {kpis.tertiaryChange >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {kpis.tertiaryChange >= 0 ? `+${kpis.tertiaryChange}%` : `${kpis.tertiaryChange}%`}
              </span>
            ) : (
              <span className="text-zinc-400 text-xs font-mono">—</span>
            )}
          </div>
          <div className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {kpis.tertiaryTotal.toLocaleString()}
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">completed transactions</p>
        </div>

        {/* Card 4: Efficiency Metric */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {kpis.efficiencyLabel}
            </span>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400">
              Optimal
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {kpis.efficiencyUnit}
            {kpis.efficiencyValue.toLocaleString()}
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">unit economics metric</p>
        </div>
      </div>

      {/* Interactive Charts Suite */}
      <DashboardCharts
        timeSeries={timeSeries}
        categoryBreakdown={categoryBreakdown}
        primaryLabel={kpis.primaryLabel}
        secondaryLabel={kpis.secondaryLabel}
      />

      {/* Recent Records Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Ingested Data Points
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Displaying recent rows matching the current filter view ({recentPoints.length} of {kpis.totalRecords} total)
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 font-semibold border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Product / Campaign</th>
                <th className="py-3 px-4 text-right">{kpis.primaryLabel}</th>
                <th className="py-3 px-4 text-right">{kpis.secondaryLabel}</th>
                <th className="py-3 px-4 text-right">{kpis.tertiaryLabel}</th>
                <th className="py-3 px-4">Region / Channel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {recentPoints.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-400">
                    No data points found matching criteria.
                  </td>
                </tr>
              ) : (
                recentPoints.slice(0, 15).map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-zinc-600 dark:text-zinc-300">
                      {new Date(p.date).toISOString().split('T')[0]}
                    </td>
                    <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                      {p.category}
                    </td>
                    <td className="py-3 px-4 text-zinc-500 dark:text-zinc-400">
                      {p.subCategory || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-zinc-900 dark:text-zinc-100">
                      ₹{Number(p.metric1).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-600 dark:text-zinc-300">
                      {isMarketing ? Number(p.metric2).toLocaleString('en-IN') : `₹${Number(p.metric2).toLocaleString('en-IN')}`}
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-600 dark:text-zinc-300">
                      {Number(p.metric3).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-zinc-500 dark:text-zinc-400">
                      {p.region || p.channel || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save Report Modal */}
      <Modal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        title="Save Current Filter View as Report"
        description="Bookmark your current timeframe, category filters, and dataset selections for fast one-click review."
      >
        <form onSubmit={handleSaveReport} className="space-y-4">
          {saveError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs border border-red-200 dark:border-red-900/60">
              {saveError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Report Name
            </label>
            <input
              type="text"
              required
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="e.g. Q3 High-Margin Cloud Services"
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              value={reportDesc}
              onChange={(e) => setReportDesc(e.target.value)}
              placeholder="Brief notes explaining the purpose of this analysis..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500 space-y-1">
            <p className="font-semibold text-zinc-700 dark:text-zinc-300">Current Filters:</p>
            <p>• Date Range: {currentDateRange}</p>
            <p>• Category: {currentCategory}</p>
            <p>• Dataset: {currentDatasetId}</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSaveModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>
              Save Report
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
