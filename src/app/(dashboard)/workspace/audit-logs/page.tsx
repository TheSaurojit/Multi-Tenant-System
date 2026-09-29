import React from 'react'
import { requireAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { AuthGuard } from '@/components/auth/auth-guard'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  History,
  Shield,
  UserPlus,
  Trash2,
  FileSpreadsheet,
  FileText,
  CreditCard,
  Settings,
  Terminal,
} from 'lucide-react'
import { AuditAction, Prisma } from '@prisma/client'

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const currentUser = await requireAuthUser()

  const resolvedParams = await searchParams

  const actionFilter =
    typeof resolvedParams.action === "string" &&
      Object.values(AuditAction).includes(
        resolvedParams.action as AuditAction
      )
      ? (resolvedParams.action as AuditAction)
      : undefined;

  const whereClause: Prisma.AuditLogWhereInput = {
    organizationId: currentUser.activeOrgId,
  }

  if (actionFilter ) {
    whereClause.action = actionFilter
  }

  const logs = await prisma.auditLog.findMany({
    where: whereClause,
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'USER_INVITED':
      case 'INVITE_ACCEPTED':
        return <UserPlus className="w-3.5 h-3.5 text-blue-500" />
      case 'MEMBER_REMOVED':
      case 'INVITE_REVOKED':
      case 'DATASET_DELETED':
      case 'REPORT_DELETED':
        return <Trash2 className="w-3.5 h-3.5 text-rose-500" />
      case 'DATASET_UPLOADED':
        return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
      case 'REPORT_CREATED':
        return <FileText className="w-3.5 h-3.5 text-indigo-500" />
      case 'PLAN_UPGRADED':
        return <CreditCard className="w-3.5 h-3.5 text-purple-500" />
      default:
        return <Settings className="w-3.5 h-3.5 text-zinc-400" />
    }
  }

  return (
    <AuthGuard requiredRoles={['OWNER', 'ADMIN']}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Audit Activity Trail
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Immutable log of team actions, dataset uploads, role modifications, and plan changes
            </p>
          </div>

          {/* Filter Dropdown */}
          <form method="GET" className="flex items-center gap-2">
            <label className="text-xs font-medium text-zinc-500">Filter Event:</label>
            <select
              name="action"
              defaultValue={actionFilter || 'all'}
              // Using standard GET submission for server filter
              className="px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 font-medium focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Audit Events</option>
              <option value="USER_INVITED">User Invited</option>
              <option value="INVITE_ACCEPTED">Invite Accepted</option>
              <option value="MEMBER_REMOVED">Member Removed</option>
              <option value="ROLE_CHANGED">Role Changed</option>
              <option value="DATASET_UPLOADED">Dataset Uploaded</option>
              <option value="DATASET_DELETED">Dataset Deleted</option>
              <option value="REPORT_CREATED">Report Created</option>
              <option value="PLAN_UPGRADED">Plan Upgraded</option>
            </select>
            <button
              type="submit"
              className="px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 cursor-pointer"
            >
              Apply
            </button>
          </form>
        </div>

        {/* Audit Log Table */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
              Event Log ({logs.length} entries)
            </span>
          </div>

          {logs.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={History}
                title="No Audit Logs Found"
                description="No security or workspace events have been recorded for the selected filter."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Triggered By</th>
                    <th className="py-3 px-4">Entity</th>
                    <th className="py-3 px-4">Event Details</th>
                    <th className="py-3 px-4">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 text-zinc-500 font-mono whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-medium text-zinc-900 dark:text-zinc-100">
                          {getActionIcon(log.action)}
                          <span>{log.action}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {log.user ? (
                          <div>
                            <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                              {log.user.name}
                            </div>
                            <div className="text-[10px] text-zinc-400">{log.user.email}</div>
                          </div>
                        ) : (
                          <span className="text-zinc-400 font-mono text-[11px]">System / Stripe</span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge variant="default">{log.entityType}</Badge>
                      </td>

                      <td className="py-3 px-4">
                        {log.details ? (
                          <code className="text-[11px] font-mono bg-zinc-100 dark:bg-zinc-800/80 px-2 py-1 rounded text-zinc-700 dark:text-zinc-300 block max-w-md truncate">
                            {JSON.stringify(log.details)}
                          </code>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-zinc-400 text-[11px] whitespace-nowrap">
                        {log.ipAddress || '127.0.0.1'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
