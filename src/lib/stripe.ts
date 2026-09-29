import "server-only";
import Stripe from 'stripe'
import { prisma } from './db'
import { Plan } from '@prisma/client'
import { logAuditEvent } from './audit'

const isConfigured =
  process.env.STRIPE_SECRET_KEY &&
  !process.env.STRIPE_SECRET_KEY.includes('placeholder')

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock_secret', {
  apiVersion: '2026-08-26.dahlia'
})

export const PRICE_IDS: Record<Plan, string | undefined> = {
  FREE: undefined,
  PRO: process.env.STRIPE_PRO_PRICE_ID ,
  ADVANCED: process.env.STRIPE_ADVANCED_PRICE_ID 
}

export async function createCheckoutSession({
  organizationId,
  plan,
  userId,
  userEmail,
  returnUrl,
}: {
  organizationId: string
  plan: Plan
  userId: string
  userEmail: string
  returnUrl: string
}): Promise<{ url: string; simulated?: boolean }> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  })

  if (!org) throw new Error('Organization not found')

  // If using placeholder key in test mode, simulate immediate success
  if (!isConfigured) {
    // Simulate plan upgrade directly in test mode
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        plan,
        subscriptionStatus: 'ACTIVE',
        stripeCustomerId: org.stripeCustomerId || `cus_simulated_${organizationId.slice(0, 8)}`,
        stripeSubscriptionId: `sub_simulated_${Date.now()}`,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
      },
    })

    return {
      url: `${returnUrl}?session_id=simulated_${Date.now()}&status=success`,
      simulated: true,
    }
  }

  // Real Stripe Test-Mode Session
  let customerId = org.stripeCustomerId

  // If customer ID is missing, simulated, or does not exist in your real Stripe account, create a real customer
  let needsNewCustomer = !customerId || customerId.startsWith('cus_simulated')

  if (!needsNewCustomer && customerId) {
    try {
      const existingCustomer = await stripe.customers.retrieve(customerId)
      if (existingCustomer.deleted) {
        needsNewCustomer = true
      }
    } catch {
      needsNewCustomer = true
    }
  }

  if (needsNewCustomer) {
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: {
        organizationId,
        userId,
      },
    })
    customerId = customer.id
    await prisma.organization.update({
      where: { id: organizationId },
      data: { stripeCustomerId: customerId },
    })
  }

  let priceId = PRICE_IDS[plan]
  if (!priceId) throw new Error(`Invalid plan: ${plan}`)

  // If a Product ID (prod_...) was configured instead of a Price ID (price_...), resolve the active price automatically
  if (priceId.startsWith('prod_')) {
    try {
      const prices = await stripe.prices.list({ product: priceId, active: true, limit: 1 })
      if (prices.data.length > 0) {
        priceId = prices.data[0].id
      }
    } catch (e) {
      console.warn('Could not auto-resolve price for product ID:', priceId, e)
    }
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId || undefined,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata: {
      organizationId,
      plan,
    },
    success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}&status=success`,
    cancel_url: `${returnUrl}?status=cancelled`,
  })

  return { url: session.url ?? returnUrl, simulated: false }
}

export async function createBillingPortalSession({
  organizationId,
  returnUrl,
}: {
  organizationId: string
  returnUrl: string
}): Promise<{ url: string; simulated?: boolean }> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  })

  if (!org) throw new Error('Organization not found')

  if (!isConfigured || !org.stripeCustomerId || org.stripeCustomerId.startsWith('cus_simulated')) {
    // Simulated portal redirect
    return {
      url: `${returnUrl}?portal=simulated`,
      simulated: true,
    }
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: returnUrl,
    })

    return { url: session.url, simulated: false }
  } catch (err) {
    console.warn('Stripe billing portal creation failed, falling back:', err)
    return {
      url: `${returnUrl}?portal=simulated`,
      simulated: true,
    }
  }
}

export async function verifyAndSyncCheckoutSession(sessionId: string, organizationId: string) {
  if (!sessionId || sessionId.startsWith('simulated_') || !isConfigured) return null

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.payment_status === 'paid' || session.status === 'complete') {
      const plan = session.metadata?.plan as Plan
      if (plan && session.metadata?.organizationId === organizationId) {
        await prisma.organization.update({
          where: { id: organizationId },
          data: {
            plan,
            subscriptionStatus: 'ACTIVE',
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        })

        await logAuditEvent({
          organizationId,
          action: 'PLAN_UPGRADED',
          entityType: 'Organization',
          entityId: organizationId,
          details: { plan, stripeCustomerId: session.customer, source: 'checkout_redirect_sync' },
        })

        return { success: true, plan }
      }
    }
  } catch (err) {
    console.error('Failed to sync checkout session on redirect return:', err)
  }

  return null
}

