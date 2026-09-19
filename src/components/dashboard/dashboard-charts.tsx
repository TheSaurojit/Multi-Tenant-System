'use client'

import React from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from 'recharts'
import { TimeSeriesPoint, CategoryBreakdownPoint } from '@/lib/analytics-engine'

interface DashboardChartsProps {
  timeSeries: TimeSeriesPoint[]
  categoryBreakdown: CategoryBreakdownPoint[]
  primaryLabel: string
  secondaryLabel: string
}

const COLORS = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6']

export function DashboardCharts({
  timeSeries,
  categoryBreakdown,
  primaryLabel,
  secondaryLabel,
}: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Time-Series Trend Area Chart */}
      <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Performance Trend Over Time
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Daily trajectory of {primaryLabel.toLowerCase()} and {secondaryLabel.toLowerCase()}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              {primaryLabel}
            </span>
            <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
              {secondaryLabel}
            </span>
          </div>
        </div>

        <div className="h-72 w-full pt-2">
          {timeSeries.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-zinc-400">
              No data points for this timeframe.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMetric1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorMetric2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60A5FA" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#60A5FA" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => (val >= 1000 ? `$${(val / 1000).toFixed(0)}k` : `$${val}`)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    borderColor: '#27272a',
                    borderRadius: '8px',
                    color: '#f4f4f5',
                    fontSize: '12px',
                  }}
                  formatter={(value: any, name: any) => [
                    `$${Number(value).toLocaleString()}`,
                    name === 'metric1' ? primaryLabel : secondaryLabel,
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="metric1"
                  stroke="#6366F1"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorMetric1)"
                />
                <Area
                  type="monotone"
                  dataKey="metric2"
                  stroke="#60A5FA"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorMetric2)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Category Breakdown Bar Chart */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Category Breakdown
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Contribution of each segment to {primaryLabel.toLowerCase()}
          </p>
        </div>

        <div className="h-72 w-full pt-2">
          {categoryBreakdown.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-zinc-400">
              No category data available.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryBreakdown.slice(0, 6)}
                layout="vertical"
                margin={{ top: 5, right: 15, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => (val >= 1000 ? `$${(val / 1000).toFixed(0)}k` : `$${val}`)}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    borderColor: '#27272a',
                    borderRadius: '8px',
                    color: '#f4f4f5',
                    fontSize: '12px',
                  }}
                  formatter={(value: any) => [`$${Number(value).toLocaleString()}`, primaryLabel]}
                />
                <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                  {categoryBreakdown.slice(0, 6).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
