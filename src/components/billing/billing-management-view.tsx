'use client'

import React, { useState } from 'react'
import {
  Check,
  Zap,
  Sparkles,
  ShieldCheck,
  ExternalLink,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PLAN_CONFIGS } from '@/lib/plans'
import {
  checkoutPlanAction,
  openBillingPortalAction,
} from '@/app/actions/billing-actions'
import { CurrentUser } from '@/lib/auth'
import { useAuth } from '@/contexts/auth-context'
import { Plan } from '../../../generated/prisma'

interface BillingManagementViewProps {
  currentPlan: Plan
  subscriptionStatus: string
  currentPeriodEnd?: string | null
  memberCount: number
  pendingInvitesCount?: number
  monthlyUploadCount: number
  workspaceCount?: number
  currentUser?: CurrentUser
}

export function BillingManagementView({
  currentPlan,
  subscriptionStatus,
  currentPeriodEnd,
  memberCount,
  pendingInvitesCount = 0,
  monthlyUploadCount,
  workspaceCount = 1,
  currentUser: propUser,
}: BillingManagementViewProps) {
  const auth = useAuth()
  const currentUser = propUser || auth.currentUser
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const canManageBilling = auth.isOwner || currentUser.role === 'OWNER'
  const currentLimits = PLAN_CONFIGS[currentPlan]

  const handleUpgrade = async (plan: Plan) => {
    setLoadingPlan(plan)
    setNotice(null)
    const res = await checkoutPlanAction(plan)
    setLoadingPlan(null)
    if (res && 'error' in res && res.error) {
      setNotice(res.error)
    }
  }

  const handleDowngrade = async () => {
    setLoadingPlan('FREE')
    setNotice(null)
    const res = await checkoutPlanAction('FREE')
    setLoadingPlan(null)
    if (res && 'error' in res && res.error) {
      setNotice(res.error)
    } else if (res && 'downgraded' in res) {
      setNotice('Workspace successfully downgraded to the Free plan.')
    }
  }

  const handleManagePortal = async () => {
    setPortalLoading(true)
    setNotice(null)
    const res = await openBillingPortalAction()
    setPortalLoading(false)
    if (res && 'error' in res && res.error) {
      setNotice(res.error)
    }
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 text-xs text-indigo-700 dark:text-indigo-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Current Plan Card & Usage Quotas */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Current Plan: {currentLimits.name} ({currentLimits.formattedPrice}/mo)
              </h2>
              <Badge
                variant={
                  subscriptionStatus === 'ACTIVE'
                    ? 'success'
                    : subscriptionStatus === 'PAST_DUE'
                    ? 'warning'
                    : 'default'
                }
              >
                {subscriptionStatus}
              </Badge>
              <Badge variant="info">
                {currentLimits.retentionLabel}
              </Badge>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {currentLimits.targetAudience} •{' '}
              {currentPeriodEnd
                ? `Renews on ${new Date(currentPeriodEnd).toLocaleDateString()}`
                : 'Standard monthly subscription cycle'}
            </p>
          </div>

          {canManageBilling && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleManagePortal}
              isLoading={portalLoading}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Stripe Customer Portal
            </Button>
          )}
        </div>

        {/* Usage Quota Meters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-6">
          {/* Meter 1: Workspaces */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-zinc-400" /> Workspaces
              </span>
              <span className="font-mono text-zinc-500">
                {workspaceCount} / {!isFinite(currentLimits.maxWorkspaces) ? 'Unlimited' : currentLimits.maxWorkspaces}
              </span>
            </div>
            <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    !isFinite(currentLimits.maxWorkspaces)
                      ? 0
                      : (workspaceCount / currentLimits.maxWorkspaces) * 100
                  )}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-zinc-400">
              {!isFinite(currentLimits.maxWorkspaces)
                ? `${workspaceCount} active workspace(s) (Unlimited)`
                : `${Math.max(0, currentLimits.maxWorkspaces - workspaceCount)} workspace(s) available`}
            </p>
          </div>

          {/* Meter 2: Team Seats (counts active members + pending invitations) */}
          {(() => {
            const totalSeats = memberCount + pendingInvitesCount
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Team Member Seats
                  </span>
                  <span className="font-mono text-zinc-500">
                    {totalSeats} / {!isFinite(currentLimits.maxMembers) ? 'Unlimited' : currentLimits.maxMembers}
                  </span>
                </div>
                <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        !isFinite(currentLimits.maxMembers)
                          ? 0
                          : (totalSeats / currentLimits.maxMembers) * 100
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-zinc-400">
                  {!isFinite(currentLimits.maxMembers)
                    ? `${memberCount} active${pendingInvitesCount > 0 ? `, ${pendingInvitesCount} pending` : ''} (Unlimited)`
                    : currentLimits.maxMembers - totalSeats > 0
                    ? `${currentLimits.maxMembers - totalSeats} seat(s) available (${memberCount} active, ${pendingInvitesCount} pending)`
                    : `Seat limit reached (${memberCount} active, ${pendingInvitesCount} pending)`}
                </p>
              </div>
            )
          })()}

          {/* Meter 3: Monthly Uploads */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                Monthly CSV Uploads
              </span>
              <span className="font-mono text-zinc-500">
                {monthlyUploadCount} / {currentLimits.monthlyUploads}
              </span>
            </div>
            <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    (monthlyUploadCount / currentLimits.monthlyUploads) * 100
                  )}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-zinc-400">
              {currentLimits.monthlyUploads - monthlyUploadCount} upload(s) remaining this month
            </p>
          </div>

          {/* Meter 4: Per-CSV Row Limit */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                CSV Row Limit
              </span>
              <span className="font-mono text-zinc-500">
                {currentLimits.maxRowsPerCsv >= 1000000
                  ? `${currentLimits.maxRowsPerCsv / 1000000}M rows/file`
                  : `${(currentLimits.maxRowsPerCsv / 1000).toFixed(0)}k rows/file`}
              </span>
            </div>
            <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.max(5, Math.round((currentLimits.maxRowsPerCsv / 100000) * 100)))}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-zinc-400">
              Enforced per CSV file • {currentLimits.retentionLabel}
            </p>
          </div>
        </div>
      </div>

      {/* Plan Pricing Tier Comparison */}
      <div>
        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-4">
          Choose Your Subscription Plan
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 1. FREE PLAN - ₹0/mo */}
          <div
            className={`bg-white dark:bg-zinc-900 border rounded-2xl p-6 shadow-xs flex flex-col justify-between ${
              currentPlan === 'FREE'
                ? 'border-indigo-600 ring-2 ring-indigo-600/20'
                : 'border-zinc-200 dark:border-zinc-800'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                  1. Free
                </span>
                {currentPlan === 'FREE' && (
                  <Badge variant="info">CURRENT PLAN</Badge>
                )}
              </div>
              <div className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 mb-1">
                ₹0{' '}
                <span className="text-xs text-zinc-400 font-normal">/ month (Free Forever)</span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
                For small businesses testing the platform.
              </p>

              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 mb-6">
                <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
                  {PLAN_CONFIGS.FREE.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {currentPlan !== 'FREE' && canManageBilling && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDowngrade}
                isLoading={loadingPlan === 'FREE'}
                className="w-full mt-4"
              >
                Downgrade to Free (₹0/mo)
              </Button>
            )}
          </div>

          {/* 2. PRO PLAN - ₹1,499/mo */}
          <div
            className={`bg-white dark:bg-zinc-900 border rounded-2xl p-6 shadow-md flex flex-col justify-between relative overflow-hidden ${
              currentPlan === 'PRO'
                ? 'border-indigo-600 ring-2 ring-indigo-600/30'
                : 'border-indigo-300 dark:border-indigo-800'
            }`}
          >
            <div className="absolute top-0 right-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-bl-lg uppercase tracking-wider">
              Most Popular
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-base text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <Zap className="w-4 h-4" /> 2. Pro
                </span>
                {currentPlan === 'PRO' && (
                  <Badge variant="success">CURRENT PLAN</Badge>
                )}
              </div>
              <div className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 mb-1">
                ₹1,499{' '}
                <span className="text-xs text-zinc-400 font-normal">/ month</span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
                For growing businesses and teams.
              </p>

              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 mb-6">
                <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
                  {PLAN_CONFIGS.PRO.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {currentPlan !== 'PRO' && canManageBilling && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleUpgrade('PRO')}
                isLoading={loadingPlan === 'PRO'}
                className="w-full"
              >
                Upgrade to Pro (₹1,499/mo)
              </Button>
            )}
          </div>

          {/* 3. ADVANCED PLAN - ₹4,999/mo */}
          <div
            className={`bg-white dark:bg-zinc-900 border rounded-2xl p-6 shadow-xs flex flex-col justify-between ${
              currentPlan === 'ADVANCED'
                ? 'border-purple-600 ring-2 ring-purple-600/30'
                : 'border-zinc-200 dark:border-zinc-800'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-base text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> 3. Advanced
                </span>
                {currentPlan === 'ADVANCED' && (
                  <Badge variant="purple">CURRENT PLAN</Badge>
                )}
              </div>
              <div className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 mb-1">
                ₹4,999{' '}
                <span className="text-xs text-zinc-400 font-normal">/ month</span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
                For larger teams/businesses.
              </p>

              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 mb-6">
                <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
                  {PLAN_CONFIGS.ADVANCED.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {currentPlan !== 'ADVANCED' && canManageBilling && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleUpgrade('ADVANCED')}
                isLoading={loadingPlan === 'ADVANCED'}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                Upgrade to Advanced (₹4,999/mo)
              </Button>
            )}
          </div>
        </div>
      </div>
     
    </div>
  )
}
