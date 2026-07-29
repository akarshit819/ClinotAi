import { prisma } from "@/lib/db"
import { stripeProvider } from "./stripe-provider"
import { recordBillingHistory } from "./history"
import { sendBillingEmail, subscriptionStartedEmail, paymentSucceededEmail, paymentFailedEmail, subscriptionCancelledEmail, subscriptionReactivatedEmail, planChangedEmail, invoiceAvailableEmail } from "./emails"

function getPlanFromPriceId(priceId: string): string {
  if (!priceId) return "starter"
  const map: Record<string, string> = {}
  const starterId = process.env.STRIPE_STARTER_PRICE_ID
  const proId = process.env.STRIPE_PROFESSIONAL_PRICE_ID
  if (starterId) map[starterId] = "starter"
  if (proId) map[proId] = "professional"
  return map[priceId] || "starter"
}

async function getClinicEmail(clinicId: string): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { clinicId, role: { name: "admin" } },
    orderBy: { createdAt: "asc" },
  })
  return user?.email || null
}

async function markEventProcessed(stripeEventId: string, eventType: string): Promise<boolean> {
  const existing = await prisma.stripeEvent.findUnique({ where: { stripeEventId } })
  if (existing) return false
  await prisma.stripeEvent.create({
    data: { stripeEventId, type: eventType, status: "processed" },
  })
  return true
}

async function getClinicIdFromEvent(event: Record<string, any>): Promise<string | null> {
  const data = event.data?.object || {}
  const metadata = data.metadata || {}
  if (metadata.clinicId) return metadata.clinicId
  if (data.subscription) {
    const sub = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: data.subscription },
    })
    return sub?.clinicId || null
  }
  if (data.customer) {
    const sub = await prisma.subscription.findFirst({
      where: { stripeCustomerId: data.customer },
      orderBy: { createdAt: "desc" },
    })
    return sub?.clinicId || null
  }
  return null
}

async function handleCheckoutCompleted(event: Record<string, any>): Promise<void> {
  const session = event.data?.object || {}
  const clinicId = session.metadata?.clinicId
  const plan = session.metadata?.plan || getPlanFromPriceId(session.metadata?.priceId || "")
  if (!clinicId) return

  const customerId = session.customer as string
  const subscriptionId = session.subscription as string

  const existingSub = await prisma.subscription.findFirst({
    where: { clinicId },
    orderBy: { createdAt: "desc" },
  })

  if (existingSub) {
    await prisma.subscription.update({
      where: { id: existingSub.id },
      data: {
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId,
        status: "active",
        plan,
        currentPeriodStart: session.currentPeriodStart ? new Date(session.currentPeriodStart * 1000) : undefined,
        currentPeriodEnd: session.currentPeriodEnd ? new Date(session.currentPeriodEnd * 1000) : undefined,
      },
    })
  } else {
    await prisma.subscription.create({
      data: {
        clinicId,
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId,
        status: "active",
        plan,
        currentPeriodStart: session.currentPeriodStart ? new Date(session.currentPeriodStart * 1000) : undefined,
        currentPeriodEnd: session.currentPeriodEnd ? new Date(session.currentPeriodEnd * 1000) : undefined,
      },
    })
  }

  await prisma.clinic.update({
    where: { id: clinicId },
    data: { stripeCustomerId: customerId },
  })

  const email = await getClinicEmail(clinicId)
  if (email) {
    sendBillingEmail(email, subscriptionStartedEmail(plan, ""))
  }

  await recordBillingHistory({
    clinicId,
    action: "subscription_created",
    toPlan: plan,
    status: "active",
    details: { sessionId: session.id, stripeSubscriptionId: subscriptionId },
  })
}

async function handleSubscriptionCreated(event: Record<string, any>): Promise<void> {
  const sub = event.data?.object || {}
  const metadata = sub.metadata || {}
  const clinicId = metadata.clinicId || await getClinicIdFromEvent(event)
  if (!clinicId) return

  const priceId = sub.items?.data?.[0]?.price?.id || sub.plan?.id || ""
  const plan = getPlanFromPriceId(priceId)

  const existing = await prisma.subscription.findFirst({ where: { clinicId }, orderBy: { createdAt: "desc" } })

  if (existing) {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        stripeSubscriptionId: sub.id,
        stripeCustomerId: sub.customer,
        stripePriceId: priceId,
        status: mapStatus(sub.status),
        plan,
        currentPeriodStart: sub.currentPeriodStart ? new Date(sub.currentPeriodStart * 1000) : undefined,
        currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd * 1000) : undefined,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
        trialStart: sub.trialStart ? new Date(sub.trialStart * 1000) : undefined,
        trialEnd: sub.trialEnd ? new Date(sub.trialEnd * 1000) : undefined,
      },
    })
  } else {
    await prisma.subscription.create({
      data: {
        clinicId,
        stripeSubscriptionId: sub.id,
        stripeCustomerId: sub.customer,
        stripePriceId: priceId,
        status: mapStatus(sub.status),
        plan,
        currentPeriodStart: sub.currentPeriodStart ? new Date(sub.currentPeriodStart * 1000) : undefined,
        currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd * 1000) : undefined,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
        trialStart: sub.trialStart ? new Date(sub.trialStart * 1000) : undefined,
        trialEnd: sub.trialEnd ? new Date(sub.trialEnd * 1000) : undefined,
      },
    })
  }
}

async function handleSubscriptionUpdated(event: Record<string, any>): Promise<void> {
  const sub = event.data?.object || {}
  const clinicId = await getClinicIdFromEvent(event)
  if (!clinicId) return

  const previous = event.data?.previous_attributes || {}
  const priceId = sub.items?.data?.[0]?.price?.id || sub.plan?.id || ""
  const plan = getPlanFromPriceId(priceId)
  const newStatus = mapStatus(sub.status)

  const existing = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: sub.id },
  })
  if (!existing) return

  const oldPlan = existing.plan
  const oldStatus = existing.status

  await prisma.subscription.update({
    where: { id: existing.id },
    data: {
      stripePriceId: priceId,
      status: newStatus,
      plan,
      currentPeriodStart: sub.currentPeriodStart ? new Date(sub.currentPeriodStart * 1000) : undefined,
      currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd * 1000) : undefined,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
      canceledAt: sub.canceledAt ? new Date(sub.canceledAt * 1000) : undefined,
      endedAt: sub.endedAt ? new Date(sub.endedAt * 1000) : undefined,
      trialStart: sub.trialStart ? new Date(sub.trialStart * 1000) : undefined,
      trialEnd: sub.trialEnd ? new Date(sub.trialEnd * 1000) : undefined,
    },
  })

  if (previous.plan || previous.items) {
    await recordBillingHistory({
      clinicId,
      subscriptionId: existing.id,
      action: oldPlan && plan !== oldPlan ? (oldPlan === "starter" ? "upgraded" : "downgraded") : "plan_changed",
      fromPlan: oldPlan,
      toPlan: plan,
      status: newStatus,
      details: { previous: previous.plan || previous.items },
    })
    const email = await getClinicEmail(clinicId)
    if (email && plan !== oldPlan) {
      const oldName = oldPlan.charAt(0).toUpperCase() + oldPlan.slice(1)
      const newName = plan.charAt(0).toUpperCase() + plan.slice(1)
      sendBillingEmail(email, planChangedEmail(oldName, newName))
    }
  }

  if (previous.status && newStatus === "active" && oldStatus === "past_due") {
    const email = await getClinicEmail(clinicId)
    if (email) sendBillingEmail(email, subscriptionReactivatedEmail(plan))
  }
}

async function handleSubscriptionDeleted(event: Record<string, any>): Promise<void> {
  const sub = event.data?.object || {}
  const clinicId = await getClinicIdFromEvent(event)
  if (!clinicId) return

  const existing = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: sub.id },
  })
  if (!existing) return

  await prisma.subscription.update({
    where: { id: existing.id },
    data: { status: "cancelled", canceledAt: sub.canceledAt ? new Date(sub.canceledAt * 1000) : new Date(), endedAt: sub.endedAt ? new Date(sub.endedAt * 1000) : new Date() },
  })

  const email = await getClinicEmail(clinicId)
  if (email) {
    const endDate = existing.currentPeriodEnd?.toLocaleDateString() || "immediately"
    sendBillingEmail(email, subscriptionCancelledEmail(existing.plan, endDate))
  }

  await recordBillingHistory({
    clinicId,
    subscriptionId: existing.id,
    action: "cancelled",
    fromPlan: existing.plan,
    status: "cancelled",
    details: { stripeSubscriptionId: sub.id },
  })
}

async function handleInvoicePaid(event: Record<string, any>): Promise<void> {
  const inv = event.data?.object || {}
  const clinicId = await getClinicIdFromEvent(event)
  if (!clinicId) return

  const existingInv = await prisma.invoice.findUnique({
    where: { stripeInvoiceId: inv.id },
  })

  if (existingInv) {
    await prisma.invoice.update({
      where: { id: existingInv.id },
      data: {
        status: "paid",
        paidAt: new Date(),
        invoiceUrl: inv.invoice_pdf || undefined,
        hostedInvoiceUrl: inv.hosted_invoice_url || undefined,
        stripePaymentIntentId: inv.payment_intent as string || undefined,
      },
    })
  } else {
    await prisma.invoice.create({
      data: {
        clinicId,
        stripeInvoiceId: inv.id,
        stripePaymentIntentId: inv.payment_intent as string,
        amount: inv.total || inv.amount_paid || 0,
        currency: inv.currency || "usd",
        status: "paid",
        paidAt: new Date(),
        invoiceUrl: inv.invoice_pdf,
        hostedInvoiceUrl: inv.hosted_invoice_url,
        invoiceNumber: inv.number,
        lines: inv.lines?.data ? JSON.stringify(inv.lines.data) : undefined,
        periodStart: inv.period_start ? new Date(inv.period_start * 1000) : undefined,
        periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : undefined,
      },
    })
  }

  await prisma.subscription.updateMany({
    where: { clinicId, stripeSubscriptionId: inv.subscription as string },
    data: { lastPaymentDate: new Date(), nextBillingDate: inv.period_end ? new Date(inv.period_end * 1000) : undefined },
  })

  const email = await getClinicEmail(clinicId)
  if (email) {
    sendBillingEmail(email, paymentSucceededEmail(inv.total || inv.amount_paid || 0, inv.currency || "usd", new Date().toLocaleDateString()))
    if (inv.hosted_invoice_url) {
      sendBillingEmail(email, invoiceAvailableEmail(inv.total || inv.amount_paid || 0, inv.currency || "usd", inv.hosted_invoice_url))
    }
  }

  await recordBillingHistory({
    clinicId,
    action: "payment_succeeded",
    amount: inv.total || inv.amount_paid || 0,
    currency: inv.currency || "usd",
    status: "paid",
    details: { stripeInvoiceId: inv.id, stripePaymentIntentId: inv.payment_intent },
  })
}

async function handleInvoicePaymentFailed(event: Record<string, any>): Promise<void> {
  const inv = event.data?.object || {}
  const clinicId = await getClinicIdFromEvent(event)
  if (!clinicId) return

  const existingInv = await prisma.invoice.findUnique({
    where: { stripeInvoiceId: inv.id },
  })

  if (existingInv) {
    await prisma.invoice.update({
      where: { id: existingInv.id },
      data: { status: "failed" },
    })
  } else {
    await prisma.invoice.create({
      data: {
        clinicId,
        stripeInvoiceId: inv.id,
        stripePaymentIntentId: inv.payment_intent as string,
        amount: inv.total || inv.amount_due || 0,
        currency: inv.currency || "usd",
        status: "failed",
        invoiceUrl: inv.invoice_pdf,
        hostedInvoiceUrl: inv.hosted_invoice_url,
        invoiceNumber: inv.number,
        periodStart: inv.period_start ? new Date(inv.period_start * 1000) : undefined,
        periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : undefined,
      },
    })
  }

  await prisma.subscription.updateMany({
    where: { clinicId, stripeSubscriptionId: inv.subscription as string },
    data: { status: "past_due" },
  })

  await prisma.paymentAttempt.create({
    data: {
      clinicId,
      subscriptionId: inv.subscription as string,
      invoiceId: existingInv?.id,
      amount: inv.total || inv.amount_due || 0,
      currency: inv.currency || "usd",
      status: "failed",
      failureCode: inv.attempted?.failure_code || null,
      failureMessage: inv.attempted?.failure_message || null,
      stripePaymentIntentId: inv.payment_intent as string,
    },
  })

  const email = await getClinicEmail(clinicId)
  if (email) {
    sendBillingEmail(email, paymentFailedEmail(inv.total || inv.amount_due || 0, inv.currency || "usd"))
  }

  await recordBillingHistory({
    clinicId,
    action: "payment_failed",
    amount: inv.total || inv.amount_due || 0,
    currency: inv.currency || "usd",
    status: "past_due",
    details: { stripeInvoiceId: inv.id, failureCode: inv.attempted?.failure_code },
  })
}

async function handleInvoiceFinalized(event: Record<string, any>): Promise<void> {
  const inv = event.data?.object || {}
  const clinicId = await getClinicIdFromEvent(event)
  if (!clinicId) return

  const existingInv = await prisma.invoice.findUnique({
    where: { stripeInvoiceId: inv.id },
  })
  if (existingInv) return

  await prisma.invoice.create({
    data: {
      clinicId,
      stripeInvoiceId: inv.id,
      stripePaymentIntentId: inv.payment_intent as string,
      amount: inv.total || inv.amount_due || 0,
      currency: inv.currency || "usd",
      status: "open",
      invoiceUrl: inv.invoice_pdf,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      invoiceNumber: inv.number,
      lines: inv.lines?.data ? JSON.stringify(inv.lines.data) : undefined,
      periodStart: inv.period_start ? new Date(inv.period_start * 1000) : undefined,
      periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : undefined,
    },
  })
}

async function handlePaymentIntentSucceeded(event: Record<string, any>): Promise<void> {
  const pi = event.data?.object || {}
  if (!pi.invoice) return
  const clinicId = await getClinicIdFromEvent(event)
  if (!clinicId) return

  await prisma.invoice.updateMany({
    where: { stripePaymentIntentId: pi.id },
    data: { status: "paid", paidAt: new Date() },
  })
}

async function handlePaymentIntentFailed(event: Record<string, any>): Promise<void> {
  const pi = event.data?.object || {}
  const clinicId = await getClinicIdFromEvent(event)
  if (!clinicId) return

  if (pi.invoice) {
    await prisma.invoice.updateMany({
      where: { stripePaymentIntentId: pi.id },
      data: { status: "failed" },
    })
  }

  await prisma.paymentAttempt.create({
    data: {
      clinicId,
      amount: pi.amount || 0,
      currency: pi.currency || "usd",
      status: "failed",
      failureCode: pi.last_payment_error?.code || null,
      failureMessage: pi.last_payment_error?.message || null,
      stripePaymentIntentId: pi.id,
    },
  })

  await recordBillingHistory({
    clinicId,
    action: "payment_intent_failed",
    amount: pi.amount || 0,
    currency: pi.currency || "usd",
    status: "failed",
    details: { paymentIntentId: pi.id, error: pi.last_payment_error?.message },
  })
}

function mapStatus(status: string): string {
  switch (status) {
    case "active": return "active"
    case "past_due": return "past_due"
    case "canceled": return "cancelled"
    case "incomplete": return "incomplete"
    case "incomplete_expired": return "expired"
    case "trialing": return "trialing"
    case "unpaid": return "unpaid"
    case "paused": return "paused"
    default: return status
  }
}

const HANDLERS: Record<string, (event: Record<string, any>) => Promise<void>> = {
  "checkout.session.completed": handleCheckoutCompleted,
  "customer.subscription.created": handleSubscriptionCreated,
  "customer.subscription.updated": handleSubscriptionUpdated,
  "customer.subscription.deleted": handleSubscriptionDeleted,
  "invoice.paid": handleInvoicePaid,
  "invoice.payment_failed": handleInvoicePaymentFailed,
  "invoice.finalized": handleInvoiceFinalized,
  "payment_intent.succeeded": handlePaymentIntentSucceeded,
  "payment_intent.payment_failed": handlePaymentIntentFailed,
}

export async function processStripeWebhook(event: Record<string, any>): Promise<{ handled: boolean; skipped: boolean }> {
  const eventId = event.id
  const eventType = event.type

  if (!eventId || !eventType) {
    return { handled: false, skipped: false }
  }

  const isNew = await markEventProcessed(eventId, eventType)
  if (!isNew) {
    return { handled: true, skipped: true }
  }

  const handler = HANDLERS[eventType]
  if (!handler) {
    return { handled: false, skipped: false }
  }

  try {
    await handler(event)
    return { handled: true, skipped: false }
  } catch (error) {
    console.error(`Webhook handler failed for ${eventType}:`, error)
    await prisma.stripeEvent.update({
      where: { stripeEventId: eventId },
      data: { status: "failed" },
    })
    return { handled: false, skipped: false }
  }
}