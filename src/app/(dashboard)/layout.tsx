import React from 'react'
import { requireAuthUser } from '@/lib/auth'
import { AuthProvider } from '@/contexts/auth-context'
import { DashboardShell } from '@/components/layout/dashboard-shell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const currentUser = await requireAuthUser()

  const activeMembership = currentUser.memberships.find(
    (m) => m.orgId === currentUser.activeOrgId
  )
  const currentPlan = activeMembership?.plan || 'FREE'

  return (
    <AuthProvider currentUser={currentUser}>
      <DashboardShell currentUser={currentUser} currentPlan={currentPlan}>
        {children}
      </DashboardShell>
    </AuthProvider>
  )
}
