import React from 'react'

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-zinc-200/80 dark:bg-zinc-800 ${className}`}
    />
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Top Filter Bar Skeleton */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-44" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3"
          >
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>

      {/* Charts Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4">
          <div className="flex justify-between items-center">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-7 w-24" />
          </div>
          <Skeleton className="h-72 w-full rounded-lg" />
        </div>

        <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-72 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-6 w-20 rounded-md" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
