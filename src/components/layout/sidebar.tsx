'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Database,
  FileText,
  Users,
  CreditCard,
  History,
  ChevronDown,
  Plus,
  LogOut,
  Building2,
  Check,
  Layers,
  Sparkles,
  X,
} from 'lucide-react'
import { CurrentUser } from '@/lib/auth'
import { useAuth } from '@/contexts/auth-context'
import {
  switchWorkspaceAction,
  switchOrganizationAction,
  logoutAction,
  createWorkspaceAction,
  createOrganizationAction,
} from '@/app/actions/auth-actions'
import { getRoleBadgeClass } from '@/lib/permissions'
import { PLAN_CONFIGS } from '@/lib/plans'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface SidebarProps {
  currentUser?: CurrentUser
  mobileOpen?: boolean
  onClose?: () => void
}

export function Sidebar({
  currentUser: propUser,
  mobileOpen = false,
  onClose,
}: SidebarProps = {}) {
  const auth = useAuth()
  const currentUser = propUser || auth.currentUser
  const pathname = usePathname()

  // Organization dropdown state
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false)
  const [isNewOrgModalOpen, setIsNewOrgModalOpen] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [isCreatingOrg, setIsCreatingOrg] = useState(false)
  const [createOrgError, setCreateOrgError] = useState<string | null>(null)

  // Workspace dropdown state
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false)
  const [isNewWorkspaceModalOpen, setIsNewWorkspaceModalOpen] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [newWorkspaceDesc, setNewWorkspaceDesc] = useState('')
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false)
  const [createWorkspaceError, setCreateWorkspaceError] = useState<string | null>(null)

  const activeMembership = currentUser.memberships.find(
    (m) => m.orgId === currentUser.activeOrgId
  )
  const currentPlan = (activeMembership?.plan as keyof typeof PLAN_CONFIGS) || 'FREE'
  const planLimits = PLAN_CONFIGS[currentPlan]
  const workspacesCount = currentUser.workspaces?.length || 1
  const isAtWorkspaceLimit = workspacesCount >= planLimits.maxWorkspaces

  const navItems = [
    { label: 'Analytics', href: '/dashboard', icon: BarChart3 },
    { label: 'Datasets', href: '/datasets', icon: Database },
    { label: 'Saved Reports', href: '/reports', icon: FileText },
    { label: 'Team & Roles', href: '/workspace/team', icon: Users },
    { label: 'Billing & Plans', href: '/workspace/billing', icon: CreditCard },
    {
      label: 'Audit Logs',
      href: '/workspace/audit-logs',
      icon: History,
      requiresAdmin: true,
    },
  ]

  // Automatically close mobile sidebar on route change
  useEffect(() => {
    if (mobileOpen) {
      onClose?.()
    }
  }, [pathname])

  // Close mobile sidebar on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen, onClose])

  // Prevent background scrolling when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const handleSwitchOrg = async (orgId: string) => {
    setOrgDropdownOpen(false)
    onClose?.()
    if (orgId !== currentUser.activeOrgId) {
      await switchOrganizationAction(orgId)
    }
  }

  const handleSwitchWorkspace = async (workspaceId: string) => {
    setWorkspaceDropdownOpen(false)
    onClose?.()
    if (workspaceId !== currentUser.activeWorkspaceId) {
      await switchWorkspaceAction(workspaceId)
    }
  }

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newOrgName.trim()) return
    setIsCreatingOrg(true)
    setCreateOrgError(null)

    const formData = new FormData()
    formData.append('name', newOrgName)

    try {
      const res = await createOrganizationAction(formData)
      if (res?.error) {
        setCreateOrgError(res.error)
        setIsCreatingOrg(false)
      } else {
        setIsNewOrgModalOpen(false)
      }
    } catch {
      // Redirect happens in server action
    }
  }

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWorkspaceName.trim()) return
    setIsCreatingWorkspace(true)
    setCreateWorkspaceError(null)

    const formData = new FormData()
    formData.append('name', newWorkspaceName)
    if (newWorkspaceDesc.trim()) {
      formData.append('description', newWorkspaceDesc)
    }

    try {
      const res = await createWorkspaceAction(formData)
      if (res?.error) {
        setCreateWorkspaceError(res.error)
        setIsCreatingWorkspace(false)
      } else {
        setIsNewWorkspaceModalOpen(false)
        setNewWorkspaceName('')
        setNewWorkspaceDesc('')
      }
    } catch {
      // Redirect happens in server action
    }
  }

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] lg:static lg:w-64 lg:shrink-0 lg:h-screen lg:z-auto border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col h-screen transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Parent Organization & Child Workspace Header */}
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
          {/* Level 1: Organization Switcher */}
          <div className="relative">
            <div className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase px-1 pb-1 flex items-center justify-between">
              <span>Organization</span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-normal text-zinc-400 hidden sm:inline">Company / Billing</span>
                {/* Mobile Close Button */}
                <button
                  type="button"
                  onClick={onClose}
                  className="lg:hidden p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  aria-label="Close sidebar"
                  title="Close sidebar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <button
              onClick={() => {
                setOrgDropdownOpen(!orgDropdownOpen)
                setWorkspaceDropdownOpen(false)
              }}
              className="w-full flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/70 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/80 transition-all text-left"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center shrink-0 shadow-xs text-xs">
                  {currentUser.activeOrgName.charAt(0).toUpperCase()}
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate leading-tight">
                      {currentUser.activeOrgName}
                    </p>
                    <span className="inline-flex items-center px-1 py-0.2 rounded text-[9px] font-semibold bg-zinc-200/80 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                      {currentPlan}
                    </span>
                  </div>
                  <span
                    className={`inline-block mt-0.5 px-1 py-0.2 rounded text-[9px] font-medium border ${getRoleBadgeClass(
                      currentUser.role
                    )}`}
                  >
                    {currentUser.role}
                  </span>
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0 ml-1" />
            </button>

            {/* Org Dropdown Menu */}
            {orgDropdownOpen && (
              <div className="absolute top-16 left-0 right-0 z-50 bg-white dark:bg-zinc-850 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 py-1.5 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-1.5 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                  Organizations
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {currentUser.memberships.map((m) => (
                    <button
                      key={m.orgId}
                      onClick={() => handleSwitchOrg(m.orgId)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Building2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span className="truncate">{m.orgName}</span>
                        <span className="text-[9px] px-1 rounded bg-zinc-100 dark:bg-zinc-750 text-zinc-500">
                          {m.plan}
                        </span>
                      </div>
                      {m.orgId === currentUser.activeOrgId && (
                        <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-1 px-1">
                  <button
                    onClick={() => {
                      setOrgDropdownOpen(false)
                      setIsNewOrgModalOpen(true)
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg transition-colors font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Organization
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Level 2: Child Workspace Selector */}
          <div className="relative">
            <div className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase px-1 pb-1 flex items-center justify-between">
              <span>Workspace</span>
              <span className="text-[9px] text-zinc-400 font-mono">
                {workspacesCount} / {planLimits.maxWorkspaces >= 100 ? '∞' : planLimits.maxWorkspaces}
              </span>
            </div>
            <button
              onClick={() => {
                setWorkspaceDropdownOpen(!workspaceDropdownOpen)
                setOrgDropdownOpen(false)
              }}
              className="w-full flex items-center justify-between p-2 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-900/60 transition-all text-left"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <div className="truncate">
                  <p className="font-semibold text-xs text-indigo-950 dark:text-indigo-200 truncate">
                    {currentUser.activeWorkspaceName}
                  </p>
                  <p className="text-[10px] text-zinc-400 truncate">Project Workspace</p>
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-indigo-500 shrink-0 ml-1" />
            </button>

            {/* Workspace Dropdown Menu */}
            {workspaceDropdownOpen && (
              <div className="absolute top-16 left-0 right-0 z-50 bg-white dark:bg-zinc-850 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 py-1.5 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-1.5 flex items-center justify-between text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                  <span>Workspaces ({workspacesCount})</span>
                  <span className="font-mono">
                    Quota: {workspacesCount}/{planLimits.maxWorkspaces >= 100 ? 'Unlimited' : planLimits.maxWorkspaces}
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {currentUser.workspaces?.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => handleSwitchWorkspace(w.id)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="truncate">{w.name}</span>
                      </div>
                      {w.id === currentUser.activeWorkspaceId && (
                        <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-1 px-1">
                  {isAtWorkspaceLimit ? (
                    <Link
                      href="/workspace/billing"
                      onClick={() => {
                        setWorkspaceDropdownOpen(false)
                        onClose?.()
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg transition-colors font-medium"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3" />
                        Upgrade for More
                      </span>
                      <span className="text-[10px] font-bold">Limit Reached</span>
                    </Link>
                  ) : (
                    <button
                      onClick={() => {
                        setWorkspaceDropdownOpen(false)
                        setIsNewWorkspaceModalOpen(true)
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg transition-colors font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      New Workspace
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            if (item.requiresAdmin && !['OWNER', 'ADMIN'].includes(currentUser.role)) {
              return null
            }
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onClose?.()}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Current User Footer */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-700 dark:text-zinc-300 shrink-0">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                {currentUser.name}
              </p>
              <p className="text-[10px] text-zinc-400 truncate">{currentUser.email}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Log out"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </aside>

      {/* New Organization Modal */}
      <Modal
        isOpen={isNewOrgModalOpen}
        onClose={() => setIsNewOrgModalOpen(false)}
        title="Register New Organization"
        description="Organizations hold your company billing subscription, invoices, and shared team memberships."
      >
        <form onSubmit={handleCreateOrg} className="space-y-4">
          {createOrgError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs border border-red-200 dark:border-red-900/60">
              {createOrgError}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Organization Name
            </label>
            <input
              type="text"
              required
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="e.g. Acme Corporation"
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsNewOrgModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isCreatingOrg}>
              Create Organization
            </Button>
          </div>
        </form>
      </Modal>

      {/* New Workspace Modal */}
      <Modal
        isOpen={isNewWorkspaceModalOpen}
        onClose={() => setIsNewWorkspaceModalOpen(false)}
        title={`New Workspace in ${currentUser.activeOrgName}`}
        description={`Workspaces isolate project datasets and reports within ${currentUser.activeOrgName}. Plan quota: ${workspacesCount}/${planLimits.maxWorkspaces >= 100 ? 'Unlimited' : planLimits.maxWorkspaces}.`}
      >
        <form onSubmit={handleCreateWorkspace} className="space-y-4">
          {createWorkspaceError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs border border-red-200 dark:border-red-900/60">
              {createWorkspaceError}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Workspace Name
            </label>
            <input
              type="text"
              required
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              placeholder="e.g. Growth Marketing Labs"
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              value={newWorkspaceDesc}
              onChange={(e) => setNewWorkspaceDesc(e.target.value)}
              placeholder="e.g. Q4 campaign analytics and retention tracking"
              className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsNewWorkspaceModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isCreatingWorkspace}>
              Create Workspace
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
