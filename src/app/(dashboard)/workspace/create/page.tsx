import React from 'react'
import { requireAuthUser } from '@/lib/auth'
import { PLAN_CONFIGS } from '@/lib/plans'
import { CreateWorkspaceForm } from '@/components/workspace/create-workspace-form'

export const metadata = {
  title: 'Create Workspace',
}

export default async function CreateWorkspacePage() {
  const currentUser = await requireAuthUser()

  const activeMembership = currentUser.memberships.find(
    (m) => m.orgId === currentUser.activeOrgId
  )
  const currentPlan = (activeMembership?.plan as keyof typeof PLAN_CONFIGS) || 'FREE'
  const planLimits = PLAN_CONFIGS[currentPlan]
  const workspacesCount = currentUser.workspaces?.length || 1
  const isAtWorkspaceLimit = workspacesCount >= planLimits.maxWorkspaces

  return (
    <div className="py-4 sm:py-8">
      <CreateWorkspaceForm
        activeOrgName={currentUser.activeOrgName}
        workspacesCount={workspacesCount}
        maxWorkspaces={planLimits.maxWorkspaces}
        isAtWorkspaceLimit={isAtWorkspaceLimit}
        currentPlan={currentPlan}
      />
    </div>
  )
}
