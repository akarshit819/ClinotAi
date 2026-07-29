export interface BillingPlan {
  id: string
  name: string
  amount: number
  currency: string
  interval: "month" | "year"
  priceId: string
  features: string[]
}

export interface BillingCustomer {
  id: string
  email: string
  name: string
}

export interface BillingSubscription {
  id: string
  status: string
  plan: string
  priceId: string
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
  lastPaymentDate: Date | null
  nextBillingDate: Date | null
  paymentMethod: string | null
  paymentMethodBrand: string | null
  paymentMethodLast4: string | null
  pausedAt: Date | null
  resumedAt: Date | null
}

export interface CheckoutSession {
  url: string
  sessionId: string
}

export interface BillingPortalSession {
  url: string
}

export interface InvoiceData {
  id: string
  amount: number
  currency: string
  status: string
  paidAt: Date | null
  invoiceUrl: string | null
  periodStart: Date | null
  periodEnd: Date | null
  number: string | null
}

export interface UsageRecord {
  conversations: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface PlanLimits {
  maxConversations: number
}

export interface BillingProvider {
  createCustomer(data: { email: string; name: string; metadata?: Record<string, string> }): Promise<BillingCustomer>
  getCustomer(customerId: string): Promise<BillingCustomer | null>
  createCheckoutSession(data: {
    customerId: string
    priceId: string
    successUrl: string
    cancelUrl: string
    metadata?: Record<string, string>
  }): Promise<CheckoutSession>
  createPortalSession(data: {
    customerId: string
    returnUrl: string
  }): Promise<BillingPortalSession>
  getSubscription(subscriptionId: string): Promise<BillingSubscription | null>
  cancelSubscription(subscriptionId: string, cancelAtPeriodEnd: boolean): Promise<void>
  reactivateSubscription(subscriptionId: string): Promise<void>
  updateSubscriptionPlan(data: {
    subscriptionId: string
    newPriceId: string
    prorationBehavior?: "create_prorations" | "none"
  }): Promise<void>
  getInvoices(customerId: string, limit?: number): Promise<InvoiceData[]>
  getUpcomingInvoice(customerId: string): Promise<InvoiceData | null>
  constructWebhookEvent(payload: string, signature: string): Promise<Record<string, any>>
}