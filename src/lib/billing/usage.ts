import { prisma } from "@/lib/db"
import { requireActiveSubscription, checkUsageLimit } from "./feature-check"
import { getPlanBySlug, isUnlimited, type PlanLimits } from "./plans"

export interface UsageData {
  conversations: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  aiRequests: number
}

export interface UsageLimitResult {
  conversations: { allowed: boolean; used: number; limit: number; remaining: number }
  tokens: { allowed: boolean; used: number; limit: number; remaining: number }
  aiRequests: { allowed: boolean; used: number; limit: number; remaining: number }
}

export async function getCurrentUsage(clinicId: string): Promise<UsageData> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfNext = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const usage = await prisma.aiUsage.findFirst({
    where: {
      clinicId,
      month: { gte: startOfMonth, lt: startOfNext },
    },
  })

  return {
    conversations: usage?.conversations || 0,
    promptTokens: usage?.promptTokens || 0,
    completionTokens: usage?.completionTokens || 0,
    totalTokens: usage?.totalTokens || 0,
    aiRequests: usage?.conversations || 0,
  }
}

export async function getUsageWithLimits(clinicId: string): Promise<UsageLimitResult> {
  const usage = await getCurrentUsage(clinicId)
  const sub = await prisma.subscription.findFirst({
    where: { clinicId },
    orderBy: { createdAt: "desc" },
  })
  const planSlug = sub?.plan || "starter"
  const plan = await getPlanBySlug(planSlug)

  const defaultLimit = { allowed: true, used: 0, limit: -1, remaining: -1 }

  const convLimit = plan?.limits?.conversations ?? 500
  const tokLimit = plan?.limits?.tokens ?? 500000
  const reqLimit = plan?.limits?.aiRequests ?? 500

  return {
    conversations: {
      allowed: isUnlimited(convLimit) || usage.conversations < convLimit,
      used: usage.conversations,
      limit: convLimit,
      remaining: isUnlimited(convLimit) ? -1 : Math.max(0, convLimit - usage.conversations),
    },
    tokens: {
      allowed: isUnlimited(tokLimit) || usage.totalTokens < tokLimit,
      used: usage.totalTokens,
      limit: tokLimit,
      remaining: isUnlimited(tokLimit) ? -1 : Math.max(0, tokLimit - usage.totalTokens),
    },
    aiRequests: {
      allowed: isUnlimited(reqLimit) || usage.aiRequests < reqLimit,
      used: usage.aiRequests,
      limit: reqLimit,
      remaining: isUnlimited(reqLimit) ? -1 : Math.max(0, reqLimit - usage.aiRequests),
    },
  }
}

export async function checkConversationLimit(clinicId: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  await requireActiveSubscription(clinicId)
  const usage = await getCurrentUsage(clinicId)
  const result = await checkUsageLimit(clinicId, "conversations", usage.conversations)
  return {
    allowed: result.allowed,
    used: usage.conversations,
    limit: result.limit ?? 0,
  }
}

export async function incrementConversationCount(clinicId: string): Promise<void> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  await prisma.aiUsage.upsert({
    where: {
      clinicId_month_provider: {
        clinicId,
        month: startOfMonth,
        provider: "clinot",
      },
    },
    create: {
      clinicId,
      month: startOfMonth,
      conversations: 1,
      provider: "clinot",
    },
    update: {
      conversations: { increment: 1 },
    },
  })
}

export async function incrementTokenUsage(
  clinicId: string,
  tokens: { prompt: number; completion: number },
): Promise<void> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  await prisma.aiUsage.upsert({
    where: {
      clinicId_month_provider: {
        clinicId,
        month: startOfMonth,
        provider: "clinot",
      },
    },
    create: {
      clinicId,
      month: startOfMonth,
      promptTokens: tokens.prompt,
      completionTokens: tokens.completion,
      totalTokens: tokens.prompt + tokens.completion,
      provider: "clinot",
    },
    update: {
      promptTokens: { increment: tokens.prompt },
      completionTokens: { increment: tokens.completion },
      totalTokens: { increment: tokens.prompt + tokens.completion },
    },
  })
}

export async function getMonthlyUsage(clinicId: string): Promise<{ totalConversations: number; totalTokens: number; byProvider: { provider: string; conversations: number; totalTokens: number }[] }> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const usageRecords = await prisma.aiUsage.findMany({
    where: {
      clinicId,
      month: { gte: startOfMonth },
    },
  })

  const totalConversations = usageRecords.reduce((s, r) => s + r.conversations, 0)
  const totalTokens = usageRecords.reduce((s, r) => s + r.totalTokens, 0)
  const byProvider = usageRecords.map((r) => ({
    provider: r.provider,
    conversations: r.conversations,
    totalTokens: r.totalTokens,
  }))

  return { totalConversations, totalTokens, byProvider }
}