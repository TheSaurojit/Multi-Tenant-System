import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import { logAuditEvent } from '@/lib/audit'
import { Plan } from '../../../../../generated/prisma'
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

  // Event-ID Idempotency: verify event was not already processed
  const existingAudit = await prisma.auditLog.findFirst({
    where: {
      entityType: 'StripeWebhook',
      entityId: event.id,
    },
  })

  if (existingAudit) {
    console.log(`[Stripe Webhook] Duplicate event already handled: ${event.id}`)
    return NextResponse.json({ received: true, deduplicated: true })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const organizationId = session.metadata?.organizationId
        const plan = session.metadata?.plan as Plan | undefined

        if (organizationId && plan) {
          const org = await prisma.organization.findUnique({
            where: { id: organizationId },
          })

          if (org) {
            const subId = typeof session.subscription === 'string'
              ? session.subscription
              : (session.subscription as any)?.id

            let periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            let priceId: string | undefined

            if (subId) {
              try {
                const sub = await stripe.subscriptions.retrieve(subId)
                const rawEnd = sub.items?.data?.[0]?.current_period_end ?? (sub as any).current_period_end ?? (sub as any).billing_cycle_anchor
                if (rawEnd) {
                  periodEnd = new Date(rawEnd * 1000)
                }
                priceId = sub.items?.data?.[0]?.price?.id
              } catch (e) {
                console.warn('Could not fetch subscription details:', e)
              }
            }

            const customerId = typeof session.customer === 'string'
              ? session.customer
              : (session.customer as any)?.id

            await prisma.organization.update({
              where: { id: organizationId },
              data: {
                plan,
                subscriptionStatus: 'ACTIVE',
                stripeCustomerId: customerId || org.stripeCustomerId,
                stripeSubscriptionId: subId || org.stripeSubscriptionId,
                stripePriceId: priceId || org.stripePriceId,
                currentPeriodEnd: periodEnd,
              },
            })

            await logAuditEvent({
              organizationId,
              action: 'PLAN_UPGRADED',
              entityType: 'StripeWebhook',
              entityId: event.id,
              details: {
                plan,
                stripeCustomerId: customerId,
                stripeSubscriptionId: subId,
                eventId: event.id,
                eventType: event.type,
              },
            })

            console.log(`[Stripe Webhook] checkout.session.completed: Organization ${organizationId} upgraded to ${plan}`)
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const org = await prisma.organization.findFirst({
          where: { stripeSubscriptionId: sub.id },
        })

        if (org) {
          // Accurate subscription status mapping
          let mappedStatus: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'INACTIVE' = 'INACTIVE'
          switch (sub.status) {
            case 'active':
              mappedStatus = 'ACTIVE'
              break
            case 'trialing':
              mappedStatus = 'TRIALING'
              break
            case 'past_due':
            case 'unpaid':
            case 'incomplete':
              mappedStatus = 'PAST_DUE'
              break
            case 'canceled':
            case 'incomplete_expired':
              mappedStatus = 'CANCELED'
              break
            default:
              mappedStatus = 'INACTIVE'
          }

          // In 2026-08-26.dahlia, current_period_end is on sub.items.data[0].current_period_end
          const rawPeriodEnd = sub.items?.data?.[0]?.current_period_end ?? (sub as any).current_period_end ?? (sub as any).billing_cycle_anchor
          const currentPeriodEnd = rawPeriodEnd ? new Date(rawPeriodEnd * 1000) : undefined

          // Sync plan if price changed in Stripe
          const activePriceId = sub.items?.data?.[0]?.price?.id
          let newPlan: Plan = org.plan
          if (activePriceId) {
            if (activePriceId === process.env.STRIPE_ADVANCED_PRICE_ID) {
              newPlan = 'ADVANCED'
            } else if (activePriceId === process.env.STRIPE_PRO_PRICE_ID) {
              newPlan = 'PRO'
            }
          }
          if (sub.metadata?.plan && ['FREE', 'PRO', 'ADVANCED'].includes(sub.metadata.plan)) {
            newPlan = sub.metadata.plan as Plan
          }
          if (mappedStatus === 'CANCELED') {
            newPlan = 'FREE'
          }

          await prisma.organization.update({
            where: { id: org.id },
            data: {
              plan: newPlan,
              subscriptionStatus: mappedStatus,
              stripePriceId: activePriceId || org.stripePriceId,
              ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
            },
          })

          await logAuditEvent({
            organizationId: org.id,
            action: newPlan !== org.plan ? 'PLAN_UPGRADED' : 'SETTINGS_UPDATED',
            entityType: 'StripeWebhook',
            entityId: event.id,
            details: {
              subscriptionStatus: mappedStatus,
              plan: newPlan,
              oldPlan: org.plan,
              stripePriceId: activePriceId,
              eventId: event.id,
              eventType: event.type,
            },
          })

          console.log(`[Stripe Webhook] customer.subscription.updated: Org ${org.id} plan=${newPlan}, status=${mappedStatus}`)
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
              currentPeriodEnd: null,
            },
          })

          await logAuditEvent({
            organizationId: org.id,
            action: 'SETTINGS_UPDATED',
            entityType: 'StripeWebhook',
            entityId: event.id,
            details: {
              event: 'SUBSCRIPTION_DELETED',
              newPlan: 'FREE',
              previousPlan: org.plan,
              eventId: event.id,
              eventType: event.type,
            },
          })

          console.log(`[Stripe Webhook] customer.subscription.deleted: Org ${org.id} downgraded to FREE`)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId =
          (invoice as any).parent?.subscription_details?.subscription ??
          (invoice as any).subscription as string | undefined

        if (subscriptionId) {
          const org = await prisma.organization.findFirst({
            where: { stripeSubscriptionId: subscriptionId },
          })

          if (org) {
            const rawPeriodEnd = invoice.period_end ?? (invoice.lines?.data?.[0]?.period?.end)
            const currentPeriodEnd = rawPeriodEnd ? new Date(rawPeriodEnd * 1000) : undefined

            await prisma.organization.update({
              where: { id: org.id },
              data: {
                subscriptionStatus: 'ACTIVE',
                ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
              },
            })

            await logAuditEvent({
              organizationId: org.id,
              action: 'SETTINGS_UPDATED',
              entityType: 'StripeWebhook',
              entityId: event.id,
              details: {
                event: 'INVOICE_PAYMENT_SUCCEEDED',
                amountPaid: invoice.amount_paid,
                eventId: event.id,
                eventType: event.type,
              },
            })

            console.log(`[Stripe Webhook] invoice.payment_succeeded: Renewed subscription for Org ${org.id}`)
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
