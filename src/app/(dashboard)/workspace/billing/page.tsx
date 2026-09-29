import React from 'react'
import { requireAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'
import { BillingManagementView } from '@/components/billing/billing-management-view'
import { verifyAndSyncCheckoutSession } from '@/lib/stripe'

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const currentUser = await requireAuthUser()
  const resolvedParams = searchParams ? await searchParams : {}
  const sessionId = typeof resolvedParams.session_id === 'string' ? resolvedParams.session_id : undefined
  const status = typeof resolvedParams.status === 'string' ? resolvedParams.status : undefined

  if (sessionId && status === 'success') {
    await verifyAndSyncCheckoutSession(sessionId, currentUser.activeOrgId)
  }

  const org = await prisma.organization.findUnique({
    where: { id: currentUser.activeOrgId },
  })

  if (!org) redirect('/login')

  const memberCount = await prisma.membership.count({
    where: { organizationId: currentUser.activeOrgId },
  })

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const monthlyUploadCount = await prisma.dataset.count({
    where: {
      organizationId: currentUser.activeOrgId,
      createdAt: { gte: startOfMonth },
    },
  })

  const workspaceCount = await prisma.workspace.count({
    where: { organizationId: currentUser.activeOrgId },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Billing & Subscription
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Manage your organization plan, usage quotas, and Stripe checkout subscriptions
        </p>
      </div>

      <BillingManagementView
        currentPlan={org.plan}
        subscriptionStatus={org.subscriptionStatus}
        currentPeriodEnd={org.currentPeriodEnd?.toISOString() ?? null}
        memberCount={memberCount}
        monthlyUploadCount={monthlyUploadCount}
        workspaceCount={workspaceCount}
        currentUser={currentUser}
      />
    </div>
  )
}
