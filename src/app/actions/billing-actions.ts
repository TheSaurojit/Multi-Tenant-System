'use server'

import { requireAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { assertPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { createCheckoutSession, createBillingPortalSession } from '@/lib/stripe'
import { Plan } from '@prisma/client'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function checkoutPlanAction(plan: Plan) {
  const user = await requireAuthUser()

  assertPermission(user.role, 'billing:manage')

  if (plan === 'FREE') {
    return simulatePlanChangeAction('FREE')
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const session = await createCheckoutSession({
    organizationId: user.activeOrgId,
    plan,
    userId: user.id,
    userEmail: user.email,
    returnUrl: `${appUrl}/workspace/billing`,
  })

  if (session.simulated) {
    await logAuditEvent({
      organizationId: user.activeOrgId,
      userId: user.id,
      action: 'PLAN_UPGRADED',
      entityType: 'Organization',
      entityId: user.activeOrgId,
      details: { newPlan: plan, mode: 'test_mode_simulation' },
    })

    revalidatePath('/workspace/billing')
    revalidatePath('/dashboard')
    return { success: true, simulated: true }
  }

  redirect(session.url)
}

export async function openBillingPortalAction() {
  const user = await requireAuthUser()

  assertPermission(user.role, 'billing:manage')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const session = await createBillingPortalSession({
    organizationId: user.activeOrgId,
    returnUrl: `${appUrl}/workspace/billing`,
  })

  if (session.simulated) {
    return { success: true, message: 'Simulated billing portal: In live mode, this opens the Stripe Customer Portal.' }
  }

  redirect(session.url)
}

export async function simulatePlanChangeAction(newPlan: Plan) {
  const user = await requireAuthUser()

  assertPermission(user.role, 'billing:manage')

  const org = await prisma.organization.update({
    where: { id: user.activeOrgId },
    data: {
      plan: newPlan,
      subscriptionStatus: newPlan === 'FREE' ? 'INACTIVE' : 'ACTIVE',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  })

  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'PLAN_UPGRADED',
    entityType: 'Organization',
    entityId: user.activeOrgId,
    details: { plan: newPlan, event: 'Simulated Stripe Test-Mode Switch' },
  })

  revalidatePath('/workspace/billing')
  revalidatePath('/dashboard')
  revalidatePath('/workspace/team')
  return { success: true, simulated: true }
}
