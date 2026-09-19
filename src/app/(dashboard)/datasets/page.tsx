import React from 'react'
import { requireAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { CsvUploader } from '@/components/datasets/csv-uploader'
import { PermissionGate } from '@/components/auth/auth-guard'
import { getPlanLimits } from '@/lib/feature-limits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { hasPermission } from '@/lib/permissions'
import { deleteDatasetAction } from '@/app/actions/dataset-actions'
import Link from 'next/link'
import {
  Database,
  FileSpreadsheet,
  Download,
  BarChart2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowUpRight,
} from 'lucide-react'

export default async function DatasetsPage() {
  const currentUser = await requireAuthUser()

  const activeMembership = currentUser.memberships.find(
    (m) => m.orgId === currentUser.activeOrgId
  )
  const limits = getPlanLimits(activeMembership?.plan  || 'FREE')

  const datasets = await prisma.dataset.findMany({
    where: {
      organizationId: currentUser.activeOrgId,
      workspaceId: currentUser.activeWorkspaceId,
    },
    include: {
      uploadedBy: {
        select: { name: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const canUpload = hasPermission(currentUser.role, 'datasets:upload')
  const canDelete = hasPermission(currentUser.role, 'datasets:delete')

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {currentUser.activeWorkspaceName} Datasets
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Manage ingested CSV files for {currentUser.activeWorkspaceName} ({currentUser.activeOrgName})
          </p>
        </div>
      </div>

      {/* Sample CSV Download Bar */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-50/60 via-purple-50/40 to-blue-50/60 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-blue-950/30 border border-indigo-100 dark:border-indigo-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-400/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Download className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Need sample data to test the pipeline?
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Download pre-formatted CSV templates containing real-looking sales transactions or marketing campaigns.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/samples/sales-data.csv"
            download="sales-data.csv"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-750 shadow-xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Sample Sales CSV
          </a>
          <a
            href="/samples/marketing-data.csv"
            download="marketing-data.csv"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-750 shadow-xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            Sample Marketing CSV
          </a>
        </div>
      </div>

      {/* CSV Uploader with Permission Gate */}
      <PermissionGate
        permission="datasets:upload"
        fallback={
          <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
            <span>
              You have <strong>{currentUser.role}</strong> permissions. Only Owners, Admins, and Members can upload new CSV datasets.
            </span>
          </div>
        }
      >
        <CsvUploader maxRows={limits.maxRowsPerCsv} />
      </PermissionGate>

      {/* Datasets Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xs overflow-hidden">
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Active Workspace Datasets ({datasets.length})
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Partitioned and isolated specifically for {currentUser.activeOrgName}
            </p>
          </div>
        </div>

        {datasets.length === 0 ? (
          <div className="py-12">
            <EmptyState
              icon={Database}
              title="No datasets uploaded"
              description="Upload your first CSV file above or download our sample datasets to get started."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Dataset Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Rows</th>
                  <th className="py-3 px-4 text-right">Size</th>
                  <th className="py-3 px-4">Uploaded By</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {datasets.map((d) => (
                  <tr
                    key={d.id}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-zinc-400 shrink-0" />
                      <span className="truncate max-w-xs">{d.name}</span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          d.type === 'SALES'
                            ? 'success'
                            : d.type === 'MARKETING'
                            ? 'info'
                            : 'default'
                        }
                      >
                        {d.type}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      {d.status === 'COMPLETED' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                        </span>
                      )}
                      {d.status === 'PROCESSING' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          <Clock className="w-3.5 h-3.5 animate-spin" /> Processing
                        </span>
                      )}
                      {d.status === 'FAILED' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                          <AlertTriangle className="w-3.5 h-3.5" /> Failed
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                      {d.rowCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-500 font-mono">
                      {(d.fileSize / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3 px-4 text-zinc-600 dark:text-zinc-300">
                      {d.uploadedBy.name}
                    </td>
                    <td className="py-3 px-4 text-zinc-500 font-mono">
                      {d.createdAt.toISOString().split('T')[0]}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard?datasetId=${d.id}`}
                          className="p-1 rounded text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          title="View in Dashboard"
                        >
                          <BarChart2 className="w-4 h-4" />
                        </Link>
                        {canDelete && (
                          <form
                            action={async () => {
                              'use server'
                              await deleteDatasetAction(d.id)
                            }}
                          >
                            <button
                              type="submit"
                              className="p-1 rounded text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                              title="Delete Dataset"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
