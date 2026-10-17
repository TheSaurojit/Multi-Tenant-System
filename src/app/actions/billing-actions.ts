'use server'

import { requireAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { assertPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { createCheckoutSession, createBillingPortalSession, stripe } from '@/lib/stripe'
import { PlanSchema } from '@/lib/validations'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Plan } from '../../../generated/prisma'

export async function checkoutPlanAction(plan: Plan) {
  const parsed = PlanSchema.safeParse(plan)
  if (!parsed.success) {
    return { error: 'Invalid plan selected.' }
  }
  const validPlan = parsed.data

  const user = await requireAuthUser()
  assertPermission(user.role, 'billing:manage')

  if (validPlan === 'FREE') {
    return downgradeToFreeAction()
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  // redirect() throws internally — it must never be caught by this try/catch
  let checkoutUrl: string
  try {
    const session = await createCheckoutSession({
      organizationId: user.activeOrgId,
      plan: validPlan,
      userId: user.id,
      userEmail: user.email,
      returnUrl: `${appUrl}/workspace/billing`,
    })
    checkoutUrl = session.url
  } catch (err: any) {
    return { error: err.message || 'Failed to initiate checkout.' }
  }

  redirect(checkoutUrl)
}

export async function openBillingPortalAction() {
  const user = await requireAuthUser()

  assertPermission(user.role, 'billing:manage')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  let portalUrl: string
  try {
    const session = await createBillingPortalSession({
      organizationId: user.activeOrgId,
      returnUrl: `${appUrl}/workspace/billing`,
    })
    portalUrl = session.url
  } catch (err: any) {
    return { error: err.message || 'Failed to open billing portal.' }
  }

  redirect(portalUrl)
}

export async function downgradeToFreeAction() {
  const user = await requireAuthUser()
  assertPermission(user.role, 'billing:manage')

  // 1. Quota check: ensure org fits in Free tier limits before downgrading
  const workspaceCount = await prisma.workspace.count({
    where: { organizationId: user.activeOrgId },
  })
  if (workspaceCount > 1) {
    return {
      error: `Cannot downgrade to Free: Your organization currently has ${workspaceCount} workspaces. The Free plan allows only 1 workspace. Please remove extra workspaces first.`,
    }
  }

  const memberCount = await prisma.membership.count({
    where: { organizationId: user.activeOrgId },
  })
  const pendingInvites = await prisma.invitation.count({
    where: { organizationId: user.activeOrgId, status: 'PENDING' },
  })
  const totalSeats = memberCount + pendingInvites
  if (totalSeats > 3) {
    return {
      error: `Cannot downgrade to Free: Your organization currently has ${totalSeats} team members and pending invitations. The Free plan allows a maximum of 3 members. Please remove team members first.`,
    }
  }

  const org = await prisma.organization.findUnique({
    where: { id: user.activeOrgId },
  })

  // 2. Cancel real Stripe subscription if active so customer stops being billed
  if (org?.stripeSubscriptionId && !org.stripeSubscriptionId.startsWith('sub_simulated')) {
    try {
      await stripe.subscriptions.cancel(org.stripeSubscriptionId)
    } catch (err: any) {
      const isAlreadyCanceled =
        err?.code === 'resource_missing' ||
        err?.message?.toLowerCase().includes('already canceled') ||
        err?.message?.toLowerCase().includes('already been canceled')

      if (!isAlreadyCanceled) {
        console.error('Failed to cancel Stripe subscription during downgrade:', err)
        return {
          error: `Failed to cancel active subscription with Stripe: ${err?.message || 'Payment provider error'}. Your plan was not modified.`,
        }
      }
    }
  }

  // 3. Update DB
  await prisma.organization.update({
    where: { id: user.activeOrgId },
    data: {
      plan: 'FREE',
      subscriptionStatus: 'CANCELED',
      currentPeriodEnd: null,
      stripeSubscriptionId: null,
    },
  })

  // 4. Log audit event as SETTINGS_UPDATED (not PLAN_UPGRADED)
  await logAuditEvent({
    organizationId: user.activeOrgId,
    userId: user.id,
    action: 'SETTINGS_UPDATED',
    entityType: 'Organization',
    entityId: user.activeOrgId,
    details: {
      event: 'PLAN_DOWNGRADED',
      fromPlan: org?.plan || 'PRO',
      toPlan: 'FREE',
    },
  })

  revalidatePath('/workspace/billing')
  revalidatePath('/dashboard')
  revalidatePath('/workspace/team')
  return { success: true, downgraded: true }
}
