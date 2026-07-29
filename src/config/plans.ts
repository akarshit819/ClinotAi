export const PLAN_LIMITS = {
  starter: {
    name: "Starter",
    price: 4900,
    conversations: 500,
    tokens: 500_000,
  },
  professional: {
    name: "Professional",
    price: 9900,
    conversations: 2000,
    tokens: 2_000_000,
  },
  enterprise: {
    name: "Enterprise",
    price: 0,
    conversations: -1,
    tokens: -1,
  },
} as const

export type PlanTier = keyof typeof PLAN_LIMITS

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan as PlanTier] || PLAN_LIMITS.starter
}

export function isUnlimited(value: number): boolean {
  return value === -1
}
