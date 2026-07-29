export interface BillingHistoryEntry {
  id: string
  subscriptionId: string | null
  action: string
  fromPlan: string | null
  toPlan: string | null
  amount: number | null
  currency: string | null
  status: string | null
  details: Record<string, unknown> | null
  createdAt: Date
}

import { prisma } from "@/lib/db"

export async function recordBillingHistory(data: {
  clinicId: string
  subscriptionId?: string
  action: string
  fromPlan?: string
  toPlan?: string
  amount?: number
  currency?: string
  status?: string
  details?: Record<string, unknown>
}): Promise<void> {
  await prisma.billingHistory.create({
    data: {
      clinicId: data.clinicId,
      subscriptionId: data.subscriptionId,
      action: data.action,
      fromPlan: data.fromPlan,
      toPlan: data.toPlan,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
      details: data.details ? JSON.stringify(data.details) : null,
    },
  })
}

export async function getBillingHistory(
  clinicId: string,
  limit = 50,
): Promise<BillingHistoryEntry[]> {
  const records = await prisma.billingHistory.findMany({
    where: { clinicId },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
  return records.map((r) => ({
    id: r.id,
    subscriptionId: r.subscriptionId,
    action: r.action,
    fromPlan: r.fromPlan,
    toPlan: r.toPlan,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    details: r.details ? parseDetails(r.details) : null,
    createdAt: r.createdAt,
  }))
}

function parseDetails(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}