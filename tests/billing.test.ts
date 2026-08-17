import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    plan: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    invoice: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    billingHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    stripeEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    paymentAttempt: {
      create: vi.fn(),
    },
    aiUsage: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    clinic: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { prisma } from "@/lib/db"
import { getAllPlans, getPlanBySlug, isUnlimited, formatPlan } from "@/lib/billing/plans"
import { checkConversationLimit, getCurrentUsage, incrementConversationCount } from "@/lib/billing/usage"
import { getSubscriptionStatus, checkFeatureAccess, checkUsageLimit, requireActiveSubscription } from "@/lib/billing/feature-check"
import { processStripeWebhook } from "@/lib/billing/webhooks"

function createMockPlan(overrides = {}) {
  return {
    id: "plan_1",
    name: "Starter",
    slug: "starter",
    description: "Essential plan",
    price: 4900,
    currency: "usd",
    interval: "month",
    stripePriceId: "price_starter",
    sortOrder: 1,
    isActive: true,
    features: JSON.stringify({ ai: true, messaging: true, whatsapp: false, integrations: false, customBranding: false, multiLanguage: false, analytics: "basic", support: "email", sla: false }),
    limits: JSON.stringify({ conversations: 500, aiRequests: 500, tokens: 500000, channels: 1, teamMembers: 2, storage: 0, attachments: 0 }),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function createMockSubscription(overrides = {}) {
  return {
    id: "sub_1",
    clinicId: "clinic_1",
    plan: "starter",
    status: "active",
    currentPeriodStart: new Date("2026-01-01"),
    currentPeriodEnd: new Date("2027-12-31"),
    cancelAtPeriodEnd: false,
    stripeSubscriptionId: "sub_stripe_1",
    stripeCustomerId: "cus_1",
    stripePriceId: "price_starter",
    ...overrides,
  }
}

describe("Plans Service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("getAllPlans returns active plans sorted by sortOrder", async () => {
    const mockPlans = [
      createMockPlan({ slug: "starter", sortOrder: 1 }),
      createMockPlan({ slug: "professional", name: "Professional", sortOrder: 2 }),
    ]
    ;(prisma.plan.findMany as any).mockResolvedValue(mockPlans)

    const plans = await getAllPlans()
    expect(plans).toHaveLength(2)
    expect(plans[0].slug).toBe("starter")
    expect(plans[1].slug).toBe("professional")
    expect(prisma.plan.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    })
  })

  it("getPlanBySlug returns formatted plan", async () => {
    ;(prisma.plan.findUnique as any).mockResolvedValue(createMockPlan())
    const plan = await getPlanBySlug("starter")
    expect(plan).not.toBeNull()
    expect(plan!.slug).toBe("starter")
    expect(plan!.features.ai).toBe(true)
    expect(plan!.features.whatsapp).toBe(false)
    expect(plan!.limits.conversations).toBe(500)
  })

  it("getPlanBySlug returns null for non-existent plan", async () => {
    ;(prisma.plan.findUnique as any).mockResolvedValue(null)
    const plan = await getPlanBySlug("nonexistent")
    expect(plan).toBeNull()
  })

  it("isUnlimited returns true for -1", () => {
    expect(isUnlimited(-1)).toBe(true)
    expect(isUnlimited(0)).toBe(false)
    expect(isUnlimited(500)).toBe(false)
  })

  it("formatPlan parses JSON features and limits", () => {
    const record = createMockPlan()
    const plan = formatPlan(record)
    expect(plan.features.ai).toBe(true)
    expect(plan.features.messaging).toBe(true)
    expect(plan.limits.conversations).toBe(500)
    expect(plan.limits.channels).toBe(1)
  })

  it("formatPlan handles invalid JSON gracefully", () => {
    const record = createMockPlan({ features: "not-json", limits: "also-not-json" })
    const plan = formatPlan(record)
    expect(plan.features.ai).toBe(false)
    expect(plan.limits.conversations).toBe(0)
  })
})

describe("Subscription Status", () => {
  it("returns active for active subscription within period", () => {
    const status = getSubscriptionStatus(createMockSubscription())
    expect(status.isActive).toBe(true)
    expect(status.isPastDue).toBe(false)
    expect(status.isCancelled).toBe(false)
    expect(status.isExpired).toBe(false)
  })

  it("returns expired when past period end", () => {
    const status = getSubscriptionStatus(createMockSubscription({
      status: "active",
      currentPeriodEnd: new Date("2020-01-01"),
    }))
    expect(status.isActive).toBe(false)
    expect(status.isExpired).toBe(true)
  })

  it("returns past_due for past_due status", () => {
    const status = getSubscriptionStatus(createMockSubscription({ status: "past_due" }))
    expect(status.isPastDue).toBe(true)
    expect(status.isActive).toBe(false)
  })

  it("returns cancelled for cancelled status", () => {
    const status = getSubscriptionStatus(createMockSubscription({ status: "cancelled" }))
    expect(status.isCancelled).toBe(true)
    expect(status.isActive).toBe(false)
  })

  it("returns cancelled when cancelAtPeriodEnd and period expired", () => {
    const status = getSubscriptionStatus(createMockSubscription({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date("2020-01-01"),
    }))
    expect(status.isCancelled).toBe(true)
    expect(status.isActive).toBe(false)
  })
})

describe("Feature Check", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("allows access to enabled feature with active subscription", async () => {
    ;(prisma.subscription.findFirst as any).mockResolvedValue(createMockSubscription())
    ;(prisma.plan.findUnique as any).mockResolvedValue(createMockPlan())

    const result = await checkFeatureAccess("clinic_1", "ai")
    expect(result.allowed).toBe(true)
  })

  it("blocks feature not available on plan", async () => {
    ;(prisma.subscription.findFirst as any).mockResolvedValue(createMockSubscription())
    ;(prisma.plan.findUnique as any).mockResolvedValue(createMockPlan())

    const result = await checkFeatureAccess("clinic_1", "whatsapp")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("whatsapp")
  })

  it("blocks feature with no active subscription", async () => {
    ;(prisma.subscription.findFirst as any).mockResolvedValue(null)
    const result = await checkFeatureAccess("clinic_1", "ai")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("No active subscription")
  })

  it("blocks feature with expired subscription", async () => {
    ;(prisma.subscription.findFirst as any).mockResolvedValue(createMockSubscription({
      currentPeriodEnd: new Date("2020-01-01"),
    }))
    const result = await checkFeatureAccess("clinic_1", "ai")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("not active")
  })

  it("blocks feature with cancelled subscription", async () => {
    ;(prisma.subscription.findFirst as any).mockResolvedValue(createMockSubscription({
      status: "cancelled",
    }))
    const result = await checkFeatureAccess("clinic_1", "ai")
    expect(result.allowed).toBe(false)
  })
})

describe("Usage Check", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("allows usage within limits", async () => {
    ;(prisma.subscription.findFirst as any).mockResolvedValue(createMockSubscription())
    ;(prisma.plan.findUnique as any).mockResolvedValue(createMockPlan())

    const result = await checkUsageLimit("clinic_1", "conversations", 100)
    expect(result.allowed).toBe(true)
    expect(result.limit).toBe(500)
    expect(result.used).toBe(100)
  })

  it("blocks usage when limit reached", async () => {
    ;(prisma.subscription.findFirst as any).mockResolvedValue(createMockSubscription())
    ;(prisma.plan.findUnique as any).mockResolvedValue(createMockPlan())

    const result = await checkUsageLimit("clinic_1", "conversations", 500)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("limit")
  })

  it("allows unlimited usage when limit is -1", async () => {
    const plan = createMockPlan({
      limits: JSON.stringify({ conversations: -1, aiRequests: -1, tokens: -1, channels: -1, teamMembers: -1, storage: -1, attachments: -1 }),
    })
    ;(prisma.subscription.findFirst as any).mockResolvedValue(createMockSubscription())
    ;(prisma.plan.findUnique as any).mockResolvedValue(plan)

    const result = await checkUsageLimit("clinic_1", "conversations", 99999)
    expect(result.allowed).toBe(true)
    expect(result.limit).toBe(-1)
  })

  it("blocks usage without active subscription", async () => {
    ;(prisma.subscription.findFirst as any).mockResolvedValue(createMockSubscription({
      status: "cancelled",
    }))

    const result = await checkUsageLimit("clinic_1", "conversations", 10)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("not active")
  })
})

describe("requireActiveSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("passes for active subscription", async () => {
    ;(prisma.subscription.findFirst as any).mockResolvedValue(createMockSubscription())
    await expect(requireActiveSubscription("clinic_1")).resolves.toBeUndefined()
  })

  it("throws for no subscription", async () => {
    ;(prisma.subscription.findFirst as any).mockResolvedValue(null)
    await expect(requireActiveSubscription("clinic_1")).rejects.toThrow()
  })

  it("throws for past due", async () => {
    ;(prisma.subscription.findFirst as any).mockResolvedValue(createMockSubscription({ status: "past_due" }))
    await expect(requireActiveSubscription("clinic_1")).rejects.toThrow("Payment is past due")
  })

  it("throws for expired", async () => {
    ;(prisma.subscription.findFirst as any).mockResolvedValue(createMockSubscription({
      currentPeriodEnd: new Date("2020-01-01"),
    }))
    await expect(requireActiveSubscription("clinic_1")).rejects.toThrow("expired")
  })
})

describe("Webhook Processing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("skips duplicate webhook events", async () => {
    ;(prisma.stripeEvent.findUnique as any).mockResolvedValue({ id: "evt_1", stripeEventId: "evt_dup" })

    const result = await processStripeWebhook({ id: "evt_dup", type: "invoice.paid" })
    expect(result.skipped).toBe(true)
    expect(result.handled).toBe(true)
  })

  it("handles checkout.session.completed", async () => {
    ;(prisma.stripeEvent.findUnique as any).mockResolvedValue(null)
    ;(prisma.stripeEvent.create as any).mockResolvedValue({})
    ;(prisma.subscription.upsert as any).mockResolvedValue({ id: "sub_new" })
    ;(prisma.clinic.update as any).mockResolvedValue({})
    ;(prisma.user.findFirst as any).mockResolvedValue(null)

    const event = {
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          customer: "cus_1",
          subscription: "sub_stripe_1",
          metadata: { clinicId: "clinic_1", plan: "starter" },
          currentPeriodStart: 1700000000,
          currentPeriodEnd: 1730000000,
        },
      },
    }

    const result = await processStripeWebhook(event)
    expect(result.handled).toBe(true)
    expect(result.skipped).toBe(false)
    expect(prisma.subscription.upsert).toHaveBeenCalled()
    expect(prisma.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clinicId: "clinic_1" },
        create: expect.objectContaining({ status: "active", plan: "starter", clinicId: "clinic_1" }),
      }),
    )
  })

  it("handles customer.subscription.updated with plan change", async () => {
    ;(prisma.stripeEvent.findUnique as any).mockResolvedValue(null)
    ;(prisma.stripeEvent.create as any).mockResolvedValue({})
    ;(prisma.subscription.findFirst as any)
      .mockResolvedValueOnce(createMockSubscription()) // getClinicIdFromEvent
      .mockResolvedValueOnce(createMockSubscription({ plan: "starter" })) // existing sub
    ;(prisma.subscription.update as any).mockResolvedValue({})
    ;(prisma.billingHistory.create as any).mockResolvedValue({})
    ;(prisma.user.findFirst as any).mockResolvedValue(null)

    const event = {
      id: "evt_sub_updated",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_stripe_1",
          customer: "cus_1",
          status: "active",
          items: { data: [{ price: { id: "price_pro" } }] },
          cancel_at_period_end: false,
        },
        previous_attributes: { plan: "starter" },
      },
    }

    const result = await processStripeWebhook(event)
    expect(result.handled).toBe(true)
  })

  it("handles customer.subscription.deleted", async () => {
    ;(prisma.stripeEvent.findUnique as any).mockResolvedValue(null)
    ;(prisma.stripeEvent.create as any).mockResolvedValue({})
    ;(prisma.subscription.findFirst as any)
      .mockResolvedValueOnce(createMockSubscription())
      .mockResolvedValueOnce(createMockSubscription())
    ;(prisma.subscription.update as any).mockResolvedValue({})
    ;(prisma.billingHistory.create as any).mockResolvedValue({})
    ;(prisma.user.findFirst as any).mockResolvedValue(null)

    const event = {
      id: "evt_sub_deleted",
      type: "customer.subscription.deleted",
      data: {
        object: { id: "sub_stripe_1", customer: "cus_1", canceledAt: 1700000000, endedAt: 1700000000 },
      },
    }

    const result = await processStripeWebhook(event)
    expect(result.handled).toBe(true)
  })

  it("handles invoice.paid", async () => {
    ;(prisma.stripeEvent.findUnique as any).mockResolvedValue(null)
    ;(prisma.stripeEvent.create as any).mockResolvedValue({})
    ;(prisma.subscription.findFirst as any)
      .mockResolvedValueOnce(createMockSubscription({ stripeCustomerId: "cus_1" })) // getClinicIdFromEvent
    ;(prisma.invoice.findUnique as any).mockResolvedValue(null)
    ;(prisma.invoice.create as any).mockResolvedValue({})
    ;(prisma.subscription.updateMany as any).mockResolvedValue({})
    ;(prisma.billingHistory.create as any).mockResolvedValue({})
    ;(prisma.user.findFirst as any).mockResolvedValue(null)

    const event = {
      id: "evt_inv_paid",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_1",
          customer: "cus_1",
          subscription: "sub_stripe_1",
          total: 4900,
          currency: "usd",
          invoice_pdf: "https://invoice.stripe.com/pdf",
          hosted_invoice_url: "https://invoice.stripe.com",
          number: "INV-001",
          payment_intent: "pi_1",
        },
      },
    }

    const result = await processStripeWebhook(event)
    expect(result.handled).toBe(true)
    expect(prisma.invoice.create).toHaveBeenCalled()
  })

  it("handles invoice.payment_failed", async () => {
    ;(prisma.stripeEvent.findUnique as any).mockResolvedValue(null)
    ;(prisma.stripeEvent.create as any).mockResolvedValue({})
    ;(prisma.subscription.findFirst as any)
      .mockResolvedValueOnce(createMockSubscription({ stripeCustomerId: "cus_1" }))
    ;(prisma.invoice.findUnique as any).mockResolvedValue(null)
    ;(prisma.invoice.create as any).mockResolvedValue({})
    ;(prisma.subscription.updateMany as any).mockResolvedValue({})
    ;(prisma.paymentAttempt.create as any).mockResolvedValue({})
    ;(prisma.billingHistory.create as any).mockResolvedValue({})
    ;(prisma.user.findFirst as any).mockResolvedValue(null)

    const event = {
      id: "evt_inv_failed",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_1",
          customer: "cus_1",
          subscription: "sub_stripe_1",
          total: 4900,
          currency: "usd",
          attempted: { failure_code: "card_declined", failure_message: "Card was declined" },
          payment_intent: "pi_1",
        },
      },
    }

    const result = await processStripeWebhook(event)
    expect(result.handled).toBe(true)
    expect(prisma.subscription.updateMany).toHaveBeenCalled()
    expect(prisma.paymentAttempt.create).toHaveBeenCalled()
  })

  it("handles invoice.finalized", async () => {
    ;(prisma.stripeEvent.findUnique as any).mockResolvedValue(null)
    ;(prisma.stripeEvent.create as any).mockResolvedValue({})
    ;(prisma.subscription.findFirst as any)
      .mockResolvedValueOnce(createMockSubscription({ stripeCustomerId: "cus_1" }))
    ;(prisma.invoice.findUnique as any).mockResolvedValue(null)
    ;(prisma.invoice.create as any).mockResolvedValue({})

    const event = {
      id: "evt_inv_finalized",
      type: "invoice.finalized",
      data: {
        object: {
          id: "in_1",
          customer: "cus_1",
          total: 4900,
          currency: "usd",
        },
      },
    }

    const result = await processStripeWebhook(event)
    expect(result.handled).toBe(true)
  })

  it("ignores unknown event types", async () => {
    ;(prisma.stripeEvent.findUnique as any).mockResolvedValue(null)
    ;(prisma.stripeEvent.create as any).mockResolvedValue({})

    const event = { id: "evt_unknown", type: "unknown.event" }
    const result = await processStripeWebhook(event)
    expect(result.handled).toBe(false)
    expect(result.skipped).toBe(false)
  })

  it("requires event id and type", async () => {
    const result = await processStripeWebhook({})
    expect(result.handled).toBe(false)
  })
})

describe("Conversation Limit Check", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns allowed when under limit", async () => {
    ;(prisma.subscription.findFirst as any).mockResolvedValue(createMockSubscription())
    ;(prisma.aiUsage.findFirst as any).mockResolvedValue({ conversations: 50 })
    ;(prisma.plan.findUnique as any).mockResolvedValue(createMockPlan())

    const result = await checkConversationLimit("clinic_1")
    expect(result.allowed).toBe(true)
    expect(result.used).toBe(50)
    expect(result.limit).toBe(500)
  })

  it("returns blocked when over limit", async () => {
    ;(prisma.subscription.findFirst as any).mockResolvedValue(createMockSubscription())
    ;(prisma.aiUsage.findFirst as any).mockResolvedValue({ conversations: 500 })
    ;(prisma.plan.findUnique as any).mockResolvedValue(createMockPlan())

    const result = await checkConversationLimit("clinic_1")
    expect(result.allowed).toBe(false)
    expect(result.used).toBe(500)
  })
})

describe("Usage Tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("getCurrentUsage returns zeroed data when no records exist", async () => {
    ;(prisma.aiUsage.findFirst as any).mockResolvedValue(null)
    const usage = await getCurrentUsage("clinic_1")
    expect(usage.conversations).toBe(0)
    expect(usage.totalTokens).toBe(0)
  })

  it("getCurrentUsage returns usage data", async () => {
    ;(prisma.aiUsage.findFirst as any).mockResolvedValue({
      conversations: 100,
      promptTokens: 1000,
      completionTokens: 2000,
      totalTokens: 3000,
    })
    const usage = await getCurrentUsage("clinic_1")
    expect(usage.conversations).toBe(100)
    expect(usage.totalTokens).toBe(3000)
  })

  it("incrementConversationCount upserts usage record", async () => {
    ;(prisma.aiUsage.upsert as any).mockResolvedValue({})
    await incrementConversationCount("clinic_1")
    expect(prisma.aiUsage.upsert).toHaveBeenCalled()
  })
})