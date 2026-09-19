'use client'

import React, { createContext, useContext, useTransition } from 'react'
import { CurrentUser } from '@/lib/auth'
import { Role, Plan } from '@prisma/client'
import { AppPermission, hasPermission } from '@/lib/permissions'
import { switchWorkspaceAction, switchOrganizationAction, logoutAction } from '@/app/actions/auth-actions'

export interface AuthContextType {
  currentUser: CurrentUser
  role: Role
  activeOrgId: string
  activeOrgName: string
  activeOrgSlug: string
  activeWorkspaceId: string
  activeWorkspaceName: string
  activeWorkspaceSlug: string
  workspaces: CurrentUser['workspaces']
  currentPlan: Plan
  memberships: CurrentUser['memberships']
  isOwner: boolean
  isAdmin: boolean
  isMember: boolean
  isViewer: boolean
  hasRole: (roles: Role[]) => boolean
  switchOrganization: (orgId: string) => Promise<void>
  switchWorkspace: (workspaceId: string) => Promise<void>
  logout: () => Promise<void>
  can: (permission: AppPermission) => boolean
  isPending: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({
  currentUser,
  children,
}: {
  currentUser: CurrentUser
  children: React.ReactNode
}) {
  const [isPending, startTransition] = useTransition()

  const activeMembership = currentUser.memberships.find(
    (m) => m.orgId === currentUser.activeOrgId
  )
  const currentPlan = (activeMembership?.plan as Plan) || 'FREE'

  const switchOrganization = async (orgId: string) => {
    startTransition(async () => {
      await switchOrganizationAction(orgId)
    })
  }

  const switchWorkspace = async (workspaceId: string) => {
    startTransition(async () => {
      await switchWorkspaceAction(workspaceId)
    })
  }

  const logout = async () => {
    startTransition(async () => {
      await logoutAction()
    })
  }

  const can = (permission: AppPermission) => {
    return hasPermission(currentUser.role, permission)
  }

  const hasRole = (roles: Role[]) => {
    return roles.includes(currentUser.role)
  }

  const isOwner = currentUser.role === 'OWNER'
  const isAdmin = currentUser.role === 'ADMIN'
  const isMember = currentUser.role === 'MEMBER'
  const isViewer = currentUser.role === 'VIEWER'

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role: currentUser.role,
        activeOrgId: currentUser.activeOrgId,
        activeOrgName: currentUser.activeOrgName,
        activeOrgSlug: currentUser.activeOrgSlug,
        activeWorkspaceId: currentUser.activeWorkspaceId,
        activeWorkspaceName: currentUser.activeWorkspaceName,
        activeWorkspaceSlug: currentUser.activeWorkspaceSlug,
        workspaces: currentUser.workspaces,
        currentPlan,
        memberships: currentUser.memberships,
        isOwner,
        isAdmin,
        isMember,
        isViewer,
        hasRole,
        switchOrganization,
        switchWorkspace,
        logout,
        can,
        isPending,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function usePermission(permission: AppPermission): boolean {
  const { can } = useAuth()
  return can(permission)
}

export function useRole(): Role {
  const { role } = useAuth()
  return role
}

export function usePlan(): Plan {
  const { currentPlan } = useAuth()
  return currentPlan
}
