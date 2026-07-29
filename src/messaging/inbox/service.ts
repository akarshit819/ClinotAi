import { prisma } from "@/lib/db"
import type { ConversationSummary, Platform, Intent } from "../types"

export interface InboxFilter {
  status?: string
  platform?: Platform
  intent?: Intent
  isEmergency?: boolean
  search?: string
  page?: number
  pageSize?: number
}

export interface InboxResponse {
  conversations: ConversationSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function getConversations(clinicId: string, filter: InboxFilter = {}): Promise<InboxResponse> {
  const page = filter.page || 1
  const pageSize = Math.min(filter.pageSize || 50, 100)
  const skip = (page - 1) * pageSize

  const where: any = { clinicId }
  if (filter.status) where.status = filter.status
  if (filter.platform) where.platform = filter.platform
  if (filter.intent) where.intent = filter.intent
  if (filter.isEmergency !== undefined) where.isEmergency = filter.isEmergency

  if (filter.search) {
    where.OR = [
      { summary: { contains: filter.search } },
      { patient: { name: { contains: filter.search } } },
    ]
  }

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true, phone: true, email: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
      },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      skip,
      take: pageSize,
    }),
    prisma.conversation.count({ where }),
  ])

  return {
    conversations: conversations.map((c) => ({
      id: c.id,
      clinicId: c.clinicId,
      patientId: c.patientId || undefined,
      patientName: c.patient?.name || undefined,
      platform: c.platform as Platform,
      channelId: c.channelId || undefined,
      status: c.status as any,
      intent: (c.intent as Intent) || undefined,
      isEmergency: c.isEmergency,
      isSpam: c.isSpam,
      summary: c.summary || undefined,
      unreadCount: c.unreadCount,
      lastMessageAt: c.lastMessageAt || undefined,
      lastMessage: c.messages[0]?.content?.slice(0, 120) || undefined,
      lastMessageFrom: c.messages[0]?.role as "user" | "assistant" | undefined,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

export async function getConversationDetail(conversationId: string, clinicId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, clinicId },
    include: {
      patient: { select: { id: true, name: true, phone: true, email: true, notes: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  })

  if (!conversation) return null

  return conversation
}

export async function markConversationRead(conversationId: string, clinicId: string): Promise<void> {
  await prisma.conversation.updateMany({
    where: { id: conversationId, clinicId },
    data: { unreadCount: 0 },
  })

  await prisma.conversationMessage.updateMany({
    where: { conversationId, readAt: null, role: "user" },
    data: { readAt: new Date() },
  })
}

export async function updateConversationStatus(
  conversationId: string,
  clinicId: string,
  status: string,
): Promise<void> {
  await prisma.conversation.updateMany({
    where: { id: conversationId, clinicId },
    data: { status },
  })
}

export async function getUnreadCount(clinicId: string): Promise<number> {
  const result = await prisma.conversation.aggregate({
    where: { clinicId, status: { notIn: ["closed", "archived"] } },
    _sum: { unreadCount: true },
  })
  return result._sum.unreadCount || 0
}
