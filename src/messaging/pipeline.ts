import { prisma } from "@/lib/db"
import { getConnector } from "./connectors/registry"
import { getCredentials } from "@/integrations/token-store"
import { resolvePatient } from "./patient/identity"
import { runAiReceptionist } from "./ai/receptionist"
import { shouldNotifyClinic, sendNotification } from "./notifications/service"
import { enqueueMessage } from "@/integrations/whatsapp/delivery"
import { createTextPayload } from "@/integrations/whatsapp/api"
import { logger } from "@/lib/logger"
import type {
  IncomingMessage,
  PipelineContext,
  ProcessedMessage,
  ConversationSummary,
} from "./types"
import type { ChatMessage } from "@/types"
import { AI } from "@/config/constants"

async function getOrCreateConversation(
  clinicId: string,
  message: IncomingMessage,
  patientId?: string,
): Promise<ConversationSummary> {
  const existing = await prisma.conversation.findFirst({
    where: {
      clinicId,
      channelId: message.channelId,
      platform: message.platform,
      status: { notIn: ["closed", "archived"] },
    },
    orderBy: { lastMessageAt: "desc" },
    include: {
      patient: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, role: true, createdAt: true },
      },
    },
  })

  if (existing) {
    return {
      id: existing.id,
      clinicId: existing.clinicId,
      patientId: existing.patientId || undefined,
      patientName: existing.patient?.name || undefined,
      platform: existing.platform as any,
      channelId: existing.channelId || undefined,
      status: existing.status as any,
      intent: (existing.intent as any) || undefined,
      isEmergency: existing.isEmergency,
      isSpam: existing.isSpam,
      summary: existing.summary || undefined,
      unreadCount: existing.unreadCount,
      lastMessageAt: existing.lastMessageAt || undefined,
      lastMessage: existing.messages[0]?.content?.slice(0, 120) || undefined,
      lastMessageFrom: (existing.messages[0]?.role as any) || undefined,
      // The structured appointment draft (if any) is stored as a JSON
      // blob inside Conversation.metadata. The receptionist module
      // reads it directly via readDraftFromMetadata(); we do not parse
      // it here because the receptionist owns the state machine.
      metadata: existing.metadata || undefined,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    }
  }

  const created = await prisma.conversation.create({
    data: {
      clinicId,
      patientId: patientId || null,
      platform: message.platform,
      channelId: message.channelId,
      status: "active",
      isEmergency: false,
      lastMessageAt: new Date(),
      unreadCount: 1,
    },
  })

  return {
    id: created.id,
    clinicId: created.clinicId,
    patientId: created.patientId || undefined,
    platform: created.platform as any,
    channelId: created.channelId || undefined,
    status: created.status as any,
    isEmergency: created.isEmergency,
    isSpam: created.isSpam,
    unreadCount: created.unreadCount,
    lastMessageAt: created.lastMessageAt || undefined,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  }
}

/**
 * Load the last N conversation messages and return them as ChatMessage[]
 * for the AI to use as context (multi-turn conversation history).
 * Uses descending order + take so long conversations keep their MOST RECENT
 * messages (not the oldest), then reverses back to chronological order.
 */
async function loadConversationHistory(
  conversationId: string,
  maxMessages = AI.maxHistoryMessages,
  excludeMessageId?: string,
): Promise<ChatMessage[]> {
  const messages = await prisma.conversationMessage.findMany({
    where: {
      conversationId,
      role: { in: ["user", "assistant"] },
      ...(excludeMessageId ? { id: { not: excludeMessageId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: maxMessages,
    select: { role: true, content: true },
  })

  return messages
    .reverse()
    .filter((m) => m.content && m.content.trim())
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }))
}

async function loadClinicContext(clinicId: string) {
  const [clinic, knowledgeBases, faqs] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: clinicId } }),
    prisma.knowledgeBase.findMany({ where: { clinicId }, take: 50 }),
    prisma.fAQ.findMany({ where: { clinicId }, take: 50 }),
  ])

  return {
    clinic,
    knowledge: knowledgeBases.map((k) => `${k.question}: ${k.answer}`),
    faqs: faqs.map((f) => ({ question: f.question, answer: f.answer })),
  }
}

async function storeMessage(
  conversationId: string,
  message: IncomingMessage,
  role: "user" | "assistant" | "system",
  status: string,
  intent?: string,
): Promise<string> {
  const msg = await prisma.conversationMessage.create({
    data: {
      conversationId,
      role,
      content: message.content,
      platform: message.platform,
      direction: role === "user" ? "incoming" : "outgoing",
      status,
      sourceMessageId: message.sourceMessageId,
      intent,
      metadata: message.metadata ? JSON.stringify(message.metadata) : null,
    },
  })
  return msg.id
}

export async function processIncomingMessage(
  clinicId: string,
  message: IncomingMessage,
): Promise<{ conversationId: string; response?: string; requiresClinic: boolean }> {
  logger.info("[WHATSAPP-INBOUND] Processing incoming message", {
    clinicId,
    platform: message.platform,
    channelId: message.channelId,
    sourceMessageId: message.sourceMessageId,
  })

  const identity = await resolvePatient(clinicId, message)

  const conversation = await getOrCreateConversation(clinicId, message, identity.patientId)

  logger.info("[WHATSAPP-INBOUND] Conversation resolved", {
    clinicId,
    conversationId: conversation.id,
    patientId: identity.patientId,
    isNew: !conversation.lastMessage,
  })

  const storedMessageId = await storeMessage(conversation.id, message, "user", "processing")

  await prisma.conversationMessage.update({
    where: { id: storedMessageId },
    data: { status: "received" },
  })

  const context = await loadClinicContext(clinicId)
  if (!context.clinic) throw new Error("Clinic not found: " + clinicId)

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { unreadCount: { increment: 1 }, lastMessageAt: new Date() },
  })

  // Load conversation history for multi-turn AI context.
  // Exclude the message we just stored — the current turn is appended
  // separately by buildConversationContext.
  const historyForAI = await loadConversationHistory(conversation.id, AI.maxHistoryMessages, storedMessageId)

  logger.info("[AI-RECEPTIONIST] Loaded conversation history", {
    conversationId: conversation.id,
    historyMessages: historyForAI.length,
  })

  const pipelineCtx = {
    message,
    clinicId,
    clinic: {
      id: context.clinic.id,
      name: context.clinic.name,
      phone: context.clinic.phone || undefined,
      timezone: context.clinic.timezone || "America/New_York",
      openingHours: context.clinic.openingHours || undefined,
      emergencyPhone: context.clinic.emergencyPhone || undefined,
      primaryColor: context.clinic.primaryColor || undefined,
    },
    conversation,
    patientId: identity.patientId,
    knowledge: context.knowledge,
    faqs: context.faqs,
    isEmergency: false,
  }

  const aiResult = await runAiReceptionist(pipelineCtx, message, historyForAI)

  logger.info("[PIPELINE] Receptionist response ready", {
    conversationId: conversation.id,
    clinicId,
    responseSource: aiResult.responseSource,
    intent: aiResult.intent,
    requiresClinic: aiResult.requiresClinic,
  })

  // Always store the AI response (even if empty — for audit trail)
  const outgoing: IncomingMessage = {
    platform: message.platform,
    channelId: message.channelId,
    sourceMessageId: `resp-${storedMessageId}`,
    from: { id: "clinot-ai", name: "Clinot AI" },
    content: aiResult.response,
    timestamp: new Date(),
  }

  await storeMessage(
    conversation.id,
    outgoing,
    "assistant",
    aiResult.requiresClinic ? "waiting_clinic" : "ai_responded",
    aiResult.intent,
  )

  const newStatus = aiResult.requiresClinic ? "waiting_clinic" : "active"
  // The receptionist module already wrote Conversation.metadata (the
  // appointment draft JSON) and Conversation.intent in its appointment
  // branch. Here we only update fields that the pipeline owns:
  // status, summary, lastMessageAt, confidence, isEmergency, isSpam.
  // Crucially, we do NOT overwrite `metadata` here — the appointment
  // state machine is the only owner of that field, and clobbering it
  // would erase the in-progress booking on every turn.
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      status: newStatus as string,
      intent: aiResult.intent,
      isEmergency: aiResult.intent === "emergency",
      isSpam: aiResult.intent === "spam",
      summary: message.content.slice(0, 200),
      lastMessageAt: new Date(),
      confidence: aiResult.confidence,
      ...(identity.patientId ? { patientId: identity.patientId } : {}),
    },
  })

  const notification = await shouldNotifyClinic(
    clinicId,
    aiResult.intent,
    aiResult.confidence,
    aiResult.intent === "emergency",
  )
  if (notification) {
    notification.conversationId = conversation.id
    notification.platform = message.platform
    notification.patientName = message.from.name
    sendNotification(notification)
  }

  // Send the outbound reply only if AI produced a response and the clinic doesn't need to handle it
  if (!aiResult.requiresClinic && aiResult.response && aiResult.response.trim()) {
    if (message.platform === "whatsapp") {
      // Use durable job queue for WhatsApp — ensures retry on failure, never lost
      const credentials = await getPlatformCredentials(clinicId, message.platform)
      if (credentials) {
        const waPayload = createTextPayload(message.channelId, aiResult.response)
        const outboundJobId = await enqueueMessage(
          clinicId,
          message.channelId,
          waPayload,
          {
            priority: 10,
            retries: 3,
            phoneNumberId: credentials.phoneNumberId,
          },
        )
        logger.info("[OUTBOUND-JOB] WhatsApp message enqueued for delivery", {
          clinicId,
          conversationId: conversation.id,
          outboundJobId,
          to: message.channelId,
          responseLength: aiResult.response.length,
        })
      } else {
        logger.error("[OUTBOUND-JOB] No WhatsApp credentials — outbound message cannot be sent", {
          clinicId,
          conversationId: conversation.id,
        })
      }
    } else {
      // For non-WhatsApp platforms keep the existing inline-send path
      const connector = getConnector(message.platform)
      if (connector) {
        const credentials = await getPlatformCredentials(clinicId, message.platform)
        if (credentials) {
          const processedMsg: ProcessedMessage = {
            id: storedMessageId,
            clinicId,
            conversationId: conversation.id,
            patientId: identity.patientId,
            platform: message.platform,
            direction: "outgoing",
            role: "assistant",
            content: aiResult.response,
            intent: aiResult.intent,
            confidence: aiResult.confidence,
            status: "ai_responded",
            sourceMessageId: outgoing.sourceMessageId,
            metadata: { channelId: message.channelId, from: message.channelId },
            createdAt: new Date(),
          }
          connector.sendMessage(processedMsg, credentials).catch((err) => {
            logger.error("[OUTBOUND] Inline connector send failed", {
              platform: message.platform,
              clinicId,
              conversationId: conversation.id,
              error: err?.message,
            })
          })
        }
      }
    }
  } else if (!aiResult.requiresClinic && (!aiResult.response || !aiResult.response.trim())) {
    logger.error("[OUTBOUND-JOB] AI produced empty response — no message sent to patient", {
      clinicId,
      conversationId: conversation.id,
      intent: aiResult.intent,
    })
  }

  return {
    conversationId: conversation.id,
    response: aiResult.response,
    requiresClinic: aiResult.requiresClinic,
  }
}

async function getPlatformCredentials(
  clinicId: string,
  platform: string,
): Promise<Record<string, string> | null> {
  try {
    const creds = await getCredentials(clinicId, platform)
    if (!creds?.accessToken) return null
    const meta = creds.metadata || {}
    return {
      accessToken: creds.accessToken,
      phoneNumberId: meta.phoneNumberId || "",
      wabaId: meta.wabaId || "",
      businessId: meta.businessId || "",
    }
  } catch {
    return null
  }
}
