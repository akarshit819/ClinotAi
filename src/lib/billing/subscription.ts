import { prisma } from "@/lib/db"
import { stripeProvider } from "./stripe-provider"
import { getPlanBySlug, getStripePriceId, getDefaultPlan } from "./plans"
import { recordBillingHistory } from "./history"
import { getEnv } from "@/lib/env"

export async function getOrCreateStripeCustomer(clinicId: string): Promise<string> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    include: { users: { take: 1, orderBy: { createdAt: "asc" } } },
  })
  if (!clinic) throw new Error("Clinic not found")

  if (clinic.stripeCustomerId) return clinic.stripeCustomerId

  const adminEmail = clinic.users[0]?.email || clinic.email || `clinic-${clinicId}@clinot.ai`
  const adminName = clinic.users[0]?.name || clinic.name

  const customer = await stripeProvider.createCustomer({
    email: adminEmail,
    name: adminName,
    metadata: { clinicId },
  })

  await prisma.clinic.update({
    where: { id: clinicId },
    data: { stripeCustomerId: customer.id },
  })

  return customer.id
}

export async function createCheckoutSession(clinicId: string, planSlug: string) {
  const customerId = await getOrCreateStripeCustomer(clinicId)
  const priceId = await getStripePriceId(planSlug)
  if (!priceId) throw new Error(`No Stripe price configured for plan: ${planSlug}`)

  const appUrl = getEnv("NEXT_PUBLIC_APP_URL")

  const session = await stripeProvider.createCheckoutSession({
    customerId,
    priceId,
    successUrl: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/billing/cancel`,
    metadata: { clinicId, plan: planSlug },
  })

  await prisma.subscription.upsert({
    where: { clinicId },
    update: { plan: planSlug, status: "incomplete", stripeCustomerId: customerId },
    create: { clinicId, stripeCustomerId: customerId, plan: planSlug, status: "incomplete" },
  })

  return session
}

export async function getSubscription(clinicId: string) {
  return prisma.subscription.findFirst({
    where: { clinicId },
    orderBy: { createdAt: "desc" },
  })
}

export async function syncSubscriptionFromStripe(subscriptionId: string): Promise<void> {
  const remote = await stripeProvider.getSubscription(subscriptionId)
  if (!remote) throw new Error("Failed to fetch subscription from Stripe")

  await prisma.subscription.update({
    where: { stripeSubscriptionId: subscriptionId },
    data: {
      status: remote.status,
      plan: remote.plan,
      currentPeriodStart: remote.currentPeriodStart,
      currentPeriodEnd: remote.currentPeriodEnd,
      cancelAtPeriodEnd: remote.cancelAtPeriodEnd,
      paymentMethod: remote.paymentMethod,
      paymentMethodBrand: remote.paymentMethodBrand,
      paymentMethodLast4: remote.paymentMethodLast4,
    },
  })
}

export async function getBillingData(clinicId: string) {
  const [subscription, invoices, history] = await Promise.all([
    getSubscription(clinicId),
    prisma.invoice.findMany({
      where: { clinicId },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.billingHistory.findMany({
      where: { clinicId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ])

  const planData = subscription ? await getPlanBySlug(subscription.plan) : await getDefaultPlan()

  const stripeCustomerId = subscription?.stripeCustomerId
  let upcomingInvoice = null

  if (stripeCustomerId) {
    upcomingInvoice = await stripeProvider.getUpcomingInvoice(stripeCustomerId).catch(() => null)
  }

  return {
    plan: subscription?.plan || "starter",
    planData: planData ? {
      name: planData.name,
      description: planData.description,
      price: planData.price,
      currency: planData.currency,
      interval: planData.interval,
      features: planData.features,
      limits: planData.limits,
    } : null,
    status: subscription?.status || "inactive",
    stripeCustomerId: subscription?.stripeCustomerId || null,
    stripeSubscriptionId: subscription?.stripeSubscriptionId || null,
    currentPeriodStart: subscription?.currentPeriodStart?.toISOString() || null,
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() || null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd || false,
    canceledAt: subscription?.canceledAt?.toISOString() || null,
    endedAt: subscription?.endedAt?.toISOString() || null,
    trialStart: subscription?.trialStart?.toISOString() || null,
    trialEnd: subscription?.trialEnd?.toISOString() || null,
    lastPaymentDate: subscription?.lastPaymentDate?.toISOString() || null,
    nextBillingDate: subscription?.nextBillingDate?.toISOString() || null,
    paymentMethod: subscription?.paymentMethod || null,
    paymentMethodBrand: subscription?.paymentMethodBrand || null,
    paymentMethodLast4: subscription?.paymentMethodLast4 || null,
    upcomingInvoice: upcomingInvoice
      ? {
          amount: upcomingInvoice.amount,
          currency: upcomingInvoice.currency,
          periodEnd: upcomingInvoice.periodEnd?.toISOString() || null,
        }
      : null,
    invoices: invoices.map((inv) => ({
      id: inv.id,
      amount: inv.amount,
      currency: inv.currency,
      status: inv.status,
      paidAt: inv.paidAt?.toISOString() || null,
      invoiceUrl: inv.invoiceUrl,
      hostedInvoiceUrl: inv.hostedInvoiceUrl,
      invoiceNumber: inv.invoiceNumber,
      periodEnd: inv.periodEnd?.toISOString() || null,
    })),
    history: history.map((h) => ({
      id: h.id,
      action: h.action,
      fromPlan: h.fromPlan,
      toPlan: h.toPlan,
      amount: h.amount,
      currency: h.currency,
      status: h.status,
      createdAt: h.createdAt.toISOString(),
    })),
  }
}

export async function cancelSubscription(clinicId: string, immediately = false) {
  const sub = await getSubscription(clinicId)
  if (!sub?.stripeSubscriptionId) throw new Error("No active subscription")
  if (!["active", "past_due"].includes(sub.status)) throw new Error("Subscription cannot be cancelled")

  const planData = await getPlanBySlug(sub.plan)

  await stripeProvider.cancelSubscription(sub.stripeSubscriptionId, !immediately)

  const updateData: any = {
    cancelAtPeriodEnd: !immediately,
    status: immediately ? "cancelled" : sub.status,
  }
  if (immediately) {
    updateData.endedAt = new Date()
    updateData.canceledAt = new Date()
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: updateData,
  })

  await recordBillingHistory({
    clinicId,
    subscriptionId: sub.id,
    action: immediately ? "cancelled_immediate" : "cancelled",
    fromPlan: sub.plan,
    toPlan: sub.plan,
    status: immediately ? "cancelled" : sub.status,
    details: { immediately, stripeSubscriptionId: sub.stripeSubscriptionId },
  })
}

export async function reactivateSubscription(clinicId: string) {
  const sub = await getSubscription(clinicId)
  if (!sub?.stripeSubscriptionId) throw new Error("No subscription found")
  if (!sub.cancelAtPeriodEnd) throw new Error("Subscription is not scheduled for cancellation")

  await stripeProvider.reactivateSubscription(sub.stripeSubscriptionId)

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { cancelAtPeriodEnd: false },
  })

  await recordBillingHistory({
    clinicId,
    subscriptionId: sub.id,
    action: "reactivated",
    fromPlan: sub.plan,
    toPlan: sub.plan,
    status: "active",
    details: { stripeSubscriptionId: sub.stripeSubscriptionId },
  })
}

export async function changePlan(clinicId: string, newPlanSlug: string) {
  const sub = await getSubscription(clinicId)
  if (!sub?.stripeSubscriptionId) throw new Error("No active subscription")
  if (sub.plan === newPlanSlug) throw new Error("Already on this plan")

  const newPriceId = await getStripePriceId(newPlanSlug)
  if (!newPriceId) throw new Error(`No Stripe price configured for plan: ${newPlanSlug}`)

  const oldPlan = sub.plan

  await stripeProvider.updateSubscriptionPlan({
    subscriptionId: sub.stripeSubscriptionId,
    newPriceId,
    prorationBehavior: "create_prorations",
  })

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { plan: newPlanSlug, stripePriceId: newPriceId },
  })

  const isUpgrade = oldPlan === "starter" && newPlanSlug === "professional"
  await recordBillingHistory({
    clinicId,
    subscriptionId: sub.id,
    action: isUpgrade ? "upgraded" : "downgraded",
    fromPlan: oldPlan,
    toPlan: newPlanSlug,
    status: "active",
    details: { stripeSubscriptionId: sub.stripeSubscriptionId },
  })
}

export async function createPortalSession(clinicId: string) {
  const sub = await getSubscription(clinicId)
  const customerId = sub?.stripeCustomerId || await getOrCreateStripeCustomer(clinicId)

  const appUrl = getEnv("NEXT_PUBLIC_APP_URL")

  const session = await stripeProvider.createPortalSession({
    customerId,
    returnUrl: `${appUrl}/dashboard/billing`,
  })

  return session
}

export async function getPlanPrice(planSlug: string): Promise<number> {
  const plan = await getPlanBySlug(planSlug)
  return plan?.price || 0
}

export async function getPlanName(planSlug: string): Promise<string> {
  const plan = await getPlanBySlug(planSlug)
  return plan?.name || planSlug.charAt(0).toUpperCase() + planSlug.slice(1)
}