import React from 'react'
import { requireAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FileText, ArrowUpRight, Trash2, Calendar, Database, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { hasPermission } from '@/lib/permissions'
import { deleteReportAction } from '@/app/actions/report-actions'
import Link from 'next/link'

export default async function SavedReportsPage() {
  const currentUser = await requireAuthUser()

  const reports = await prisma.savedReport.findMany({
    where: {
      organizationId: currentUser.activeOrgId,
      workspaceId: currentUser.activeWorkspaceId,
    },
    include: {
      createdBy: {
        select: { name: true, email: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const canDeleteReport = hasPermission(currentUser.role, 'reports:delete')

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {currentUser.activeWorkspaceName} Reports
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Pre-configured dashboard views and custom metric filters in {currentUser.activeWorkspaceName} ({currentUser.activeOrgName})
          </p>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="py-12">
          <EmptyState
            icon={FileText}
            title="No Saved Reports Yet"
            description="Create your first report by customizing filters on the Analytics Dashboard and clicking 'Save View'."
            actionLabel="Go to Analytics"
            href="/dashboard"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {reports.map((report) => {
            const filters = (report.filters as any) || {}
            const reportParams = new URLSearchParams()
            if (filters.datasetId) reportParams.set('datasetId', filters.datasetId)
            if (filters.range) reportParams.set('range', filters.range)
            if (filters.category) reportParams.set('category', filters.category)

            return (
              <div
                key={report.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xs flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-750 transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    {canDeleteReport && (
                      <form
                        action={async () => {
                          'use server'
                          await deleteReportAction(report.id)
                        }}
                      >
                        <button
                          type="submit"
                          className="p-1 rounded text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                          title="Delete Report"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-3">
                    {report.name}
                  </h3>
                  {report.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                      {report.description}
                    </p>
                  )}

                  <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 space-y-1.5 text-[11px] text-zinc-500">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-zinc-400" />
                      <span>Range: <strong className="text-zinc-700 dark:text-zinc-300">{filters.range || 'Default'}</strong></span>
                    </div>
                    {filters.category && (
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3 h-3 text-zinc-400" />
                        <span>Category: <strong className="text-zinc-700 dark:text-zinc-300">{filters.category}</strong></span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400">
                    By {report.createdBy.name}
                  </span>
                  <Link
                    href={`/dashboard?${reportParams.toString()}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Open Report
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
