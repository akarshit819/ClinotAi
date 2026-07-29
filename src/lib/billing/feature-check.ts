import { prisma } from "@/lib/db"
import { getPlanBySlug, isUnlimited, type PlanFeatures, type PlanLimits } from "./plans"

export interface FeatureCheckResult {
  allowed: boolean
  reason?: string
  limit?: number
  used?: number
}

export interface SubscriptionStatus {
  isActive: boolean
  isPastDue: boolean
  isCancelled: boolean
  isExpired: boolean
  plan: string
  status: string
}

export function getSubscriptionStatus(sub: {
  status: string
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
}): SubscriptionStatus {
  const now = new Date()
  const expired = !!(sub.currentPeriodEnd && sub.currentPeriodEnd < now)
  return {
    isActive: sub.status === "active" && !expired,
    isPastDue: sub.status === "past_due",
    isCancelled: sub.status === "cancelled" || (sub.cancelAtPeriodEnd && expired),
    isExpired: expired || sub.status === "expired",
    plan: "",
    status: sub.status,
  }
}

export async function getClinicSubscriptionStatus(clinicId: string): Promise<SubscriptionStatus> {
  const sub = await prisma.subscription.findFirst({
    where: { clinicId },
    orderBy: { createdAt: "desc" },
  })
  if (!sub) {
    return { isActive: false, isPastDue: false, isCancelled: false, isExpired: true, plan: "none", status: "none" }
  }
  const status = getSubscriptionStatus(sub)
  return { ...status, plan: sub.plan }
}

export async function checkFeatureAccess(
  clinicId: string,
  feature: keyof PlanFeatures,
): Promise<FeatureCheckResult> {
  const sub = await prisma.subscription.findFirst({
    where: { clinicId },
    orderBy: { createdAt: "desc" },
  })
  if (!sub) {
    return { allowed: false, reason: "No active subscription" }
  }

  const { isActive, isPastDue } = getSubscriptionStatus(sub)
  if (!isActive && !isPastDue) {
    return { allowed: false, reason: "Subscription is not active" }
  }

  const plan = await getPlanBySlug(sub.plan)
  if (!plan) {
    return { allowed: false, reason: "Plan not found" }
  }

  const featureEnabled = plan.features[feature]
  if (!featureEnabled) {
    return { allowed: false, reason: `Feature "${feature}" not available on ${plan.name} plan` }
  }

  return { allowed: true }
}

export async function checkUsageLimit(
  clinicId: string,
  metric: keyof PlanLimits,
  current: number,
): Promise<FeatureCheckResult> {
  const sub = await prisma.subscription.findFirst({
    where: { clinicId },
    orderBy: { createdAt: "desc" },
  })
  if (!sub) {
    return { allowed: false, reason: "No active subscription" }
  }

  const { isActive } = getSubscriptionStatus(sub)
  if (!isActive) {
    return { allowed: false, reason: "Subscription is not active" }
  }

  const plan = await getPlanBySlug(sub.plan)
  if (!plan) {
    return { allowed: false, reason: "Plan not found" }
  }

  const limit = plan.limits[metric]
  if (isUnlimited(limit)) {
    return { allowed: true, limit: -1, used: current }
  }

  if (current >= limit) {
    return { allowed: false, reason: `${metric} limit of ${limit} reached`, limit, used: current }
  }

  return { allowed: true, limit, used: current }
}

export async function requireActiveSubscription(clinicId: string): Promise<void> {
  const status = await getClinicSubscriptionStatus(clinicId)
  if (!status.isActive) {
    if (status.isPastDue) {
      throw new Error("Payment is past due. Please update your payment method.")
    }
    if (status.isExpired || status.isCancelled) {
      throw new Error("Subscription has expired. Please renew to continue.")
    }
    throw new Error("No active subscription")
  }
}

export async function requireFeatureAccess(clinicId: string, feature: keyof PlanFeatures): Promise<void> {
  const result = await checkFeatureAccess(clinicId, feature)
  if (!result.allowed) {
    throw new Error(result.reason || "Feature not available")
  }
}

export async function requireUsageLimit(clinicId: string, metric: keyof PlanLimits, current: number): Promise<void> {
  const result = await checkUsageLimit(clinicId, metric, current)
  if (!result.allowed) {
    throw new Error(result.reason || "Usage limit reached")
  }
}