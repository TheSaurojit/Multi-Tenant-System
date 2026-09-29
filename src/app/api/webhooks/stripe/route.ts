import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import { logAuditEvent } from '@/lib/audit'
import Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let event: Stripe.Event

  try {
    if (!webhookSecret || webhookSecret.includes('placeholder')) {
      console.error('Webhook Error: STRIPE_WEBHOOK_SECRET is not configured or still has a placeholder value in .env')
      return NextResponse.json(
        { error: 'STRIPE_WEBHOOK_SECRET is not configured. Please add the secret from `stripe listen` to your .env file.' },
        { status: 500 }
      )
    }

    if (!sig) {
      console.error('Webhook Error: Missing stripe-signature header')
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
    }

    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`)
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const organizationId = session.metadata?.organizationId
        const plan = session.metadata?.plan as any

        if (organizationId && plan) {
          let periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          if (session.subscription) {
            try {
              const sub = await stripe.subscriptions.retrieve(session.subscription as string)
              if ((sub as any)?.current_period_end) {
                periodEnd = new Date((sub as any).current_period_end * 1000)
              }
            } catch (e) {
              console.warn('Could not fetch subscription period end:', e)
            }
          }

          await prisma.organization.update({
            where: { id: organizationId },
            data: {
              plan,
              subscriptionStatus: 'ACTIVE',
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              currentPeriodEnd: periodEnd,
            },
          })

          await logAuditEvent({
            organizationId,
            action: 'PLAN_UPGRADED',
            entityType: 'Organization',
            entityId: organizationId,
            details: {
              plan,
              stripeCustomerId: session.customer,
              stripeSubscriptionId: session.subscription,
              event: 'checkout.session.completed (webhook)',
            },
          })

          console.log(`[Stripe Webhook] ✅ checkout.session.completed: Organization ${organizationId} upgraded to ${plan}`)
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const org = await prisma.organization.findFirst({
          where: { stripeSubscriptionId: sub.id },
        })

        if (org) {
          const status = sub.status === 'active' ? 'ACTIVE' : sub.status === 'past_due' ? 'PAST_DUE' : 'CANCELED'
          await prisma.organization.update({
            where: { id: org.id },
            data: {
              subscriptionStatus: status,
              currentPeriodEnd: (sub as any).current_period_end
                ? new Date((sub as any).current_period_end * 1000)
                : undefined,
            },
          })
          console.log(`[Stripe Webhook] ✅ customer.subscription.updated: Org ${org.id} status is now ${status}`)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const org = await prisma.organization.findFirst({
          where: { stripeSubscriptionId: sub.id },
        })

        if (org) {
          await prisma.organization.update({
            where: { id: org.id },
            data: {
              plan: 'FREE',
              subscriptionStatus: 'CANCELED',
            },
          })

          await logAuditEvent({
            organizationId: org.id,
            action: 'PLAN_UPGRADED',
            entityType: 'Organization',
            entityId: org.id,
            details: { newPlan: 'FREE', reason: 'Subscription cancelled in Stripe (webhook)' },
          })
          console.log(`[Stripe Webhook] ✅ customer.subscription.deleted: Org ${org.id} downgraded to FREE`)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = (invoice as any).subscription as string
        if (subscriptionId) {
          const org = await prisma.organization.findFirst({
            where: { stripeSubscriptionId: subscriptionId },
          })
          if (org) {
            await prisma.organization.update({
              where: { id: org.id },
              data: {
                subscriptionStatus: 'ACTIVE',
                currentPeriodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : undefined,
              },
            })
            console.log(`[Stripe Webhook] ✅ invoice.payment_succeeded: Renewed subscription for Org ${org.id}`)
          }
        }
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Webhook handler failed:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
