import { prisma } from "@/lib/db"

function getMonthStart(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export async function trackAiUsage(
  clinicId: string,
  tokens: { promptTokens: number; completionTokens: number; totalTokens: number },
  provider: string,
) {
  const month = getMonthStart()

  await prisma.aiUsage.upsert({
    where: {
      clinicId_month_provider: { clinicId, month, provider },
    },
    update: {
      conversations: { increment: 1 },
      promptTokens: { increment: tokens.promptTokens },
      completionTokens: { increment: tokens.completionTokens },
      totalTokens: { increment: tokens.totalTokens },
    },
    create: {
      clinicId,
      month,
      provider,
      conversations: 1,
      promptTokens: tokens.promptTokens,
      completionTokens: tokens.completionTokens,
      totalTokens: tokens.totalTokens,
    },
  })
}

export async function getMonthlyUsage(clinicId: string) {
  const month = getMonthStart()

  const usage = await prisma.aiUsage.findMany({
    where: { clinicId, month },
  })

  const totalConversations = usage.reduce((sum, u) => sum + u.conversations, 0)
  const totalTokens = usage.reduce((sum, u) => sum + u.totalTokens, 0)

  return {
    totalConversations,
    totalTokens,
    byProvider: usage.map((u) => ({
      provider: u.provider,
      conversations: u.conversations,
      promptTokens: u.promptTokens,
      completionTokens: u.completionTokens,
      totalTokens: u.totalTokens,
    })),
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
