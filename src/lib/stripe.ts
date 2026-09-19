import Stripe from 'stripe'
import { prisma } from './db'
import { Plan } from '@prisma/client'

const isConfigured =
  process.env.STRIPE_SECRET_KEY &&
  !process.env.STRIPE_SECRET_KEY.includes('placeholder')

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock_secret', {
  apiVersion: '2025-02-24.acacia' as any,
})

export const PRICE_IDS: Record<Plan, string | undefined> = {
  FREE: undefined,
  PRO: process.env.STRIPE_PRO_PRICE_ID || 'price_mock_pro_inr_monthly',
  ADVANCED: process.env.STRIPE_ADVANCED_PRICE_ID || 'price_mock_advanced_inr_monthly',
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
  if (!customerId) {
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

  const priceId = PRICE_IDS[plan]
  if (!priceId) throw new Error(`Invalid plan: ${plan}`)

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
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

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: returnUrl,
  })

  return { url: session.url, simulated: false }
}
