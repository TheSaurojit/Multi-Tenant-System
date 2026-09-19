'use client'

import React, { useState } from 'react'
import { CurrentUser } from '@/lib/auth'
import { Sidebar } from '@/components/layout/sidebar'
import Link from 'next/link'
import { UploadCloud, Sparkles, Menu } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface DashboardShellProps {
  currentUser: CurrentUser
  currentPlan: string
  children: React.ReactNode
}

export function DashboardShell({
  currentUser,
  currentPlan,
  children,
}: DashboardShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased">
      {/* Sidebar with Desktop & Mobile Phone Drawer Support */}
      <Sidebar
        currentUser={currentUser}
        mobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top App Header */}
        <header className="h-14 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
            {/* Mobile Hamburger Toggle Button */}
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-1.5 -ml-1 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Open sidebar"
              title="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb Hierarchy */}
            <div className="flex items-center gap-1.5 sm:gap-2 truncate">
              <span className="text-[11px] font-medium text-zinc-400 hidden sm:inline">
                Org:
              </span>
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                {currentUser.activeOrgName}
              </span>
              <Badge
                variant={
                  currentPlan === 'PRO'
                    ? 'info'
                    : currentPlan === 'ADVANCED'
                    ? 'purple'
                    : 'default'
                }
              >
                {currentPlan}
              </Badge>
              <span className="text-zinc-300 dark:text-zinc-700 hidden xs:inline">/</span>
              <span className="text-[11px] font-medium text-zinc-400 hidden sm:inline">
                Workspace:
              </span>
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md border border-indigo-200/50 dark:border-indigo-900/50 truncate">
                {currentUser.activeWorkspaceName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {currentPlan === 'FREE' && (
              <Link
                href="/workspace/billing"
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-500 to-indigo-600 text-white shadow-xs hover:opacity-90 transition-opacity"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Upgrade to Pro
              </Link>
            )}

            <Link
              href="/datasets?upload=true"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs transition-colors"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Upload CSV</span>
              <span className="sm:hidden">Upload</span>
            </Link>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  )
}
