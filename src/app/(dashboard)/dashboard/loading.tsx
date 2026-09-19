import React from 'react'
import { DashboardSkeleton } from '@/components/ui/skeletons'

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="h-6 w-48 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
        <div className="h-3.5 w-72 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
      </div>
      <DashboardSkeleton />
    </div>
  )
}
