import Stripe from "stripe"
import type { BillingProvider, BillingSubscription } from "./provider"

let stripeInstance: Stripe | null = null

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured")
  if (!stripeInstance) {
    stripeInstance = new Stripe(key, { typescript: true })
  }
  return stripeInstance
}

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured")
  return secret
}

function getStatus(status: string): string {
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

function rawVal(obj: any, keys: string[]): any {
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k]
  }
  return undefined
}

function subToBilling(sub: any, plan: string): BillingSubscription {
  const pm = rawVal(sub, ["default_payment_method", "defaultPaymentMethod"])
  let paymentMethod: string | null = null
  let paymentMethodBrand: string | null = null
  let paymentMethodLast4: string | null = null

  if (pm && typeof pm !== "string") {
    paymentMethod = pm.id || null
    if (pm.card) {
      paymentMethodBrand = pm.card.brand || null
      paymentMethodLast4 = pm.card.last4 || null
    }
  }

  const periodStart = rawVal(sub, ["current_period_start", "currentPeriodStart"])
  const periodEnd = rawVal(sub, ["current_period_end", "currentPeriodEnd"])

  return {
    id: sub.id,
    status: getStatus(sub.status),
    plan,
    priceId: sub.items?.data?.[0]?.price?.id ?? "",
    currentPeriodStart: periodStart ? new Date(periodStart * 1000) : new Date(),
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : new Date(),
    cancelAtPeriodEnd: rawVal(sub, ["cancel_at_period_end", "cancelAtPeriodEnd"]) ?? false,
    lastPaymentDate: null,
    nextBillingDate: periodEnd ? new Date(periodEnd * 1000) : new Date(),
    paymentMethod,
    paymentMethodBrand,
    paymentMethodLast4,
    pausedAt: null,
    resumedAt: null,
  }
}

export const stripeProvider: BillingProvider = {
  async createCustomer({ email, name, metadata }) {
    const stripe = getStripe()
    const customer = await stripe.customers.create({ email, name, metadata })
    return { id: customer.id, email: customer.email || email, name: customer.name || name }
  },

  async getCustomer(customerId) {
    const stripe = getStripe()
    try {
      const customer = await stripe.customers.retrieve(customerId)
      if (customer.deleted) return null
      return { id: customer.id, email: customer.email || "", name: customer.name || "" }
    } catch {
      return null
    }
  },

  async createCheckoutSession({ customerId, priceId, successUrl, cancelUrl, metadata }) {
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      subscription_data: { metadata },
      allow_promotion_codes: false,
      billing_address_collection: "required",
    })
    if (!session.url) throw new Error("Failed to create checkout session")
    return { url: session.url, sessionId: session.id }
  },

  async createPortalSession({ customerId, returnUrl }) {
    const stripe = getStripe()
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })
    return { url: session.url }
  },

  async getSubscription(subscriptionId) {
    const stripe = getStripe()
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["default_payment_method"],
      })
      const price = sub.items.data[0]?.price
      const lookupKey = typeof price?.lookup_key === "string" ? price.lookup_key : ""
      const map: Record<string, string> = {}
      const proPriceId = process.env.STRIPE_PROFESSIONAL_PRICE_ID
      const starterPriceId = process.env.STRIPE_STARTER_PRICE_ID
      if (proPriceId) map[proPriceId] = "professional"
      if (starterPriceId) map[starterPriceId] = "starter"
      const planFromKey = lookupKey === "professional" ? "professional" : null
      const planFromPrice = price?.id ? map[price.id] : null
      const plan = planFromKey || planFromPrice || "starter"
      return subToBilling(sub, plan)
    } catch {
      return null
    }
  },

  async cancelSubscription(subscriptionId, cancelAtPeriodEnd) {
    const stripe = getStripe()
    if (cancelAtPeriodEnd) {
      await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true })
    } else {
      await stripe.subscriptions.cancel(subscriptionId, { invoice_now: true, prorate: true })
    }
  },

  async reactivateSubscription(subscriptionId) {
    const stripe = getStripe()
    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false })
  },

  async updateSubscriptionPlan({ subscriptionId, newPriceId, prorationBehavior }) {
    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(subscriptionId)
    const itemId = sub.items.data[0]?.id
    if (!itemId) throw new Error("No subscription item found")

    await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: prorationBehavior || "create_prorations",
      billing_cycle_anchor: "now",
    })
  },

  async getInvoices(customerId, limit = 12) {
    const stripe = getStripe()
    const invoices = await stripe.invoices.list({ customer: customerId, limit })
    return invoices.data.map((inv: any) => ({
      id: inv.id,
      amount: inv.total,
      currency: inv.currency,
      status: inv.status || "unknown",
      paidAt: inv.status === "paid" && inv.status_transitions
        ? (inv.status_transitions.paid_at ? new Date(inv.status_transitions.paid_at * 1000) : null)
        : null,
      invoiceUrl: inv.invoice_pdf || null,
      periodStart: inv.period_start ? new Date(inv.period_start * 1000) : null,
      periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : null,
      number: inv.number || null,
    }))
  },

  async getUpcomingInvoice(customerId) {
    const stripe = getStripe()
    try {
      const inv = await (stripe.invoices as any).retrieveUpcoming({ customer: customerId })
      return {
        id: inv.id,
        amount: inv.total,
        currency: inv.currency,
        status: "upcoming",
        paidAt: null,
        invoiceUrl: null,
        periodStart: inv.period_start ? new Date(inv.period_start * 1000) : null,
        periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : null,
        number: null,
      }
    } catch {
      return null
    }
  },

  async constructWebhookEvent(payload: string, signature: string): Promise<Record<string, any>> {
    const stripe = getStripe()
    const secret = getWebhookSecret()
    const event = stripe.webhooks.constructEvent(payload, signature, secret)
    return event as unknown as Record<string, any>
  },
}