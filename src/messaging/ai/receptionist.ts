import { prisma } from "@/lib/db"
import { generateAIResponseWithTools } from "@/lib/ai"
import { detectIntent } from "./intent"
import { logger } from "@/lib/logger"
import type { Intent, IncomingMessage, PipelineContext } from "../types"
import type { ChatMessage } from "@/types"

export async function runAiReceptionist(
  context: Omit<PipelineContext, "aiResponse" | "intent" | "confidence" | "requiresClinic">,
  message: IncomingMessage,
  conversationHistory: ChatMessage[] = [],
): Promise<{ response: string; intent: Intent; confidence: number; requiresClinic: boolean }> {
  const { intent, confidence: intentConfidence } = detectIntent(message.content)

  logger.info("[AI-RECEPTIONIST] Intent detected", {
    conversationId: context.conversation.id,
    clinicId: context.clinicId,
    intent,
    confidence: intentConfidence,
    historyLength: conversationHistory.length,
  })

  if (intent === "emergency") {
    logger.info("[AI-RECEPTIONIST] Emergency intent — returning emergency response", {
      conversationId: context.conversation.id,
      clinicId: context.clinicId,
    })
    return {
      response: buildEmergencyResponse(context.clinic),
      intent: "emergency",
      confidence: 0.95,
      requiresClinic: true,
    }
  }

  logger.info("[AI-RECEPTIONIST] Calling AI with tools", {
    conversationId: context.conversation.id,
    clinicId: context.clinicId,
    userMessage: message.content.slice(0, 120),
  })

  const aiResult = await generateAIResponseWithTools(
    message.content,
    context.clinicId,
    conversationHistory,
  )

  // For appointment intent, ensure we always have a response to avoid silent WhatsApp failures
  let response = aiResult.response
  const aiConfidence = response && response.trim() ? 0.85 : 0

  // For appointment intent, never route to clinic due to empty response - always provide fallback
  if (intent === "appointment" && !response) {
    logger.warn("[AI-RECEPTIONIST] Empty response for appointment intent — using fallback", {
      conversationId: context.conversation.id,
      clinicId: context.clinicId,
    })
    response =
      "I'd be happy to help you book an appointment! Please share your full name, phone number, reason for your visit, and your preferred date and time."
  }

  // For appointment intent, let the AI handle it through tools instead of routing to clinic
  const requiresClinic = (aiConfidence < 0.6 && intent !== "appointment") || intent === "lead"

  logger.info("[AI-RECEPTIONIST] Response ready", {
    conversationId: context.conversation.id,
    clinicId: context.clinicId,
    intent,
    requiresClinic,
    responseLength: response?.length || 0,
    toolCallCount: aiResult.toolCalls?.length || 0,
  })

  return {
    response: response || "I'll connect you with our team to help with your question.",
    intent,
    confidence: Math.max(intentConfidence, aiConfidence),
    requiresClinic,
  }
}

function buildEmergencyResponse(clinic: PipelineContext["clinic"]): string {
  const phone = clinic.emergencyPhone || clinic.phone || "your clinic"
  return [
    "This sounds like an urgent situation.",
    "",
    "Please call your clinic immediately:",
    `**${phone}**`,
    "",
    "If this is a life-threatening emergency, call 911.",
    "",
    "Your safety is the most important thing. Please seek immediate medical attention.",
  ].join("\n")
}
