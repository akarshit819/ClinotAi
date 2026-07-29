import { prisma } from "@/lib/db"

export interface PlanFeatures {
  ai: boolean
  messaging: boolean
  whatsapp: boolean
  integrations: boolean
  customBranding: boolean
  multiLanguage: boolean
  analytics: "basic" | "advanced" | "enterprise"
  support: "email" | "priority" | "dedicated"
  sla: boolean
}

export interface PlanLimits {
  conversations: number
  aiRequests: number
  tokens: number
  channels: number
  teamMembers: number
  storage: number
  attachments: number
}

export interface PlanData {
  id: string
  name: string
  slug: string
  description: string | null
  price: number
  currency: string
  interval: string
  stripePriceId: string | null
  features: PlanFeatures
  limits: PlanLimits
  sortOrder: number
  isActive: boolean
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const DEFAULT_FEATURES: PlanFeatures = {
  ai: false, messaging: false, whatsapp: false, integrations: false,
  customBranding: false, multiLanguage: false, analytics: "basic",
  support: "email", sla: false,
}

const DEFAULT_LIMITS: PlanLimits = {
  conversations: 0, aiRequests: 0, tokens: 0,
  channels: 0, teamMembers: 0, storage: 0, attachments: 0,
}

export function isUnlimited(value: number): boolean {
  return value === -1
}

export function formatPlan(record: any): PlanData {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    description: record.description,
    price: record.price,
    currency: record.currency,
    interval: record.interval,
    stripePriceId: record.stripePriceId,
    features: { ...DEFAULT_FEATURES, ...parseJson(record.features, {}) },
    limits: { ...DEFAULT_LIMITS, ...parseJson(record.limits, {}) },
    sortOrder: record.sortOrder,
    isActive: record.isActive,
  }
}

export async function getAllPlans(): Promise<PlanData[]> {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  })
  return plans.map(formatPlan)
}

export async function getPlanBySlug(slug: string): Promise<PlanData | null> {
  const plan = await prisma.plan.findUnique({ where: { slug } })
  return plan ? formatPlan(plan) : null
}

export async function getPlanById(id: string): Promise<PlanData | null> {
  const plan = await prisma.plan.findUnique({ where: { id } })
  return plan ? formatPlan(plan) : null
}

export async function getDefaultPlan(): Promise<PlanData | null> {
  const plan = await prisma.plan.findFirst({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  })
  return plan ? formatPlan(plan) : null
}

export async function getPlanPrice(planSlug: string): Promise<number> {
  const plan = await getPlanBySlug(planSlug)
  return plan?.price || 0
}

export async function getPlanName(planSlug: string): Promise<string> {
  const plan = await getPlanBySlug(planSlug)
  return plan?.name || planSlug.charAt(0).toUpperCase() + planSlug.slice(1)
}

export async function getStripePriceId(planSlug: string): Promise<string | null> {
  const plan = await getPlanBySlug(planSlug)
  return plan?.stripePriceId || null
}