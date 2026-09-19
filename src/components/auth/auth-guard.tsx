'use client'

import React from 'react'
import Link from 'next/link'
import { Role, Plan } from '@prisma/client'
import { AppPermission } from '@/lib/permissions'
import { useAuth } from '@/contexts/auth-context'
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'

const PLAN_HIERARCHY: Record<Plan, number> = {
  FREE: 1,
  PRO: 2,
  ADVANCED: 3,
}

export interface AccessDeniedProps {
  title?: string
  description?: string
  requiredRole?: string
  backHref?: string
  backLabel?: string
}

export function AccessDenied({
  title = 'Access Restricted',
  description,
  requiredRole,
  backHref = '/dashboard',
  backLabel = 'Return to Dashboard',
}: AccessDeniedProps) {
  const { role } = useAuth()

  const message =
    description ||
    (requiredRole
      ? `This resource requires ${requiredRole} privileges. Your current role is ${role}.`
      : `Your current role (${role}) does not have permission to access this section.`)

  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs max-w-lg mx-auto my-8">
      <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4 ring-8 ring-rose-50/50 dark:ring-rose-950/20">
        <ShieldAlert className="w-6 h-6" />
      </div>
      <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1.5">
        {title}
      </h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mb-6 leading-relaxed">
        {message}
      </p>
      <Link href={backHref}>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <ArrowLeft className="w-3.5 h-3.5" />
          {backLabel}
        </Button>
      </Link>
    </div>
  )
}

export interface AuthGuardProps {
  requiredRoles?: Role[]
  requiredPermissions?: AppPermission[]
  requiredPlan?: Plan
  fallback?: React.ReactNode
  children: React.ReactNode
}

/**
 * Declarative component wrapper that conditionally renders children
 * only if the authenticated user meets all role, permission, and plan requirements.
 */
export function AuthGuard({
  requiredRoles,
  requiredPermissions,
  requiredPlan,
  fallback,
  children,
}: AuthGuardProps) {
  const { role, currentPlan, can, hasRole } = useAuth()

  // 1. Role Check
  if (requiredRoles && requiredRoles.length > 0) {
    if (!hasRole(requiredRoles)) {
      return fallback !== undefined ? (
        <>{fallback}</>
      ) : (
        <AccessDenied
          requiredRole={requiredRoles.join(' or ')}
        />
      )
    }
  }

  // 2. Permission Check
  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasAll = requiredPermissions.every((perm) => can(perm))
    if (!hasAll) {
      return fallback !== undefined ? (
        <>{fallback}</>
      ) : (
        <AccessDenied />
      )
    }
  }

  // 3. Plan Check
  if (requiredPlan) {
    const currentTier = PLAN_HIERARCHY[currentPlan] ?? 1
    const requiredTier = PLAN_HIERARCHY[requiredPlan] ?? 1
    if (currentTier < requiredTier) {
      return fallback !== undefined ? (
        <>{fallback}</>
      ) : (
        <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 max-w-lg mx-auto my-8">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center mb-3">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200 mb-1">
            {requiredPlan} Plan Required
          </h3>
          <p className="text-xs text-amber-700 dark:text-amber-300 max-w-sm mb-4">
            This feature requires a {requiredPlan} subscription. You are currently on the {currentPlan} plan.
          </p>
          <Link href="/workspace/billing">
            <Button variant="primary" size="sm" className="text-xs">
              Upgrade Subscription
            </Button>
          </Link>
        </div>
      )
    }
  }

  return <>{children}</>
}

export interface PermissionGateProps {
  permission: AppPermission
  fallback?: React.ReactNode
  children: React.ReactNode
}

/**
 * Lightweight inline wrapper for fine-grained feature or button gating.
 */
export function PermissionGate({
  permission,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { can } = useAuth()
  if (!can(permission)) {
    return <>{fallback}</>
  }
  return <>{children}</>
}

export interface RoleGateProps {
  allowedRoles: Role[]
  fallback?: React.ReactNode
  children: React.ReactNode
}

/**
 * Lightweight inline wrapper for role-based gating.
 */
export function RoleGate({
  allowedRoles,
  fallback = null,
  children,
}: RoleGateProps) {
  const { hasRole } = useAuth()
  if (!hasRole(allowedRoles)) {
    return <>{fallback}</>
  }
  return <>{children}</>
}

export interface PlanGateProps {
  requiredPlan: Plan
  fallback?: React.ReactNode
  children: React.ReactNode
}

/**
 * Lightweight inline wrapper for plan tier gating.
 */
export function PlanGate({
  requiredPlan,
  fallback = null,
  children,
}: PlanGateProps) {
  const { currentPlan } = useAuth()
  const currentTier = PLAN_HIERARCHY[currentPlan] ?? 1
  const requiredTier = PLAN_HIERARCHY[requiredPlan] ?? 1
  if (currentTier < requiredTier) {
    return <>{fallback}</>
  }
  return <>{children}</>
}
