import { prisma } from "@/lib/db"
import { generateAIResponseWithTools } from "@/lib/ai"
import { detectIntent } from "./intent"
import type { Intent, IncomingMessage, PipelineContext } from "../types"

export async function runAiReceptionist(
  context: Omit<PipelineContext, "aiResponse" | "intent" | "confidence" | "requiresClinic">,
  message: IncomingMessage,
): Promise<{ response: string; intent: Intent; confidence: number; requiresClinic: boolean }> {
  const { intent, confidence: intentConfidence } = detectIntent(message.content)

  if (intent === "emergency") {
    return {
      response: buildEmergencyResponse(context.clinic),
      intent: "emergency",
      confidence: 0.95,
      requiresClinic: true,
    }
  }

  const aiResult = await generateAIResponseWithTools(message.content, context.clinicId, [])

  // For appointment intent, ensure we always have a response to avoid silent WhatsApp failures
  let response = aiResult.response
  const aiConfidence = (response && response.trim()) ? 0.85 : 0

  // For appointment intent, never route to clinic due to empty response - always provide fallback
  if (intent === "appointment" && !response) {
    response = "I'd be happy to help you book an appointment! Please share your full name, phone number, reason for your visit, and your preferred date and time."
  }

  // For appointment intent, let the AI handle it through tools instead of routing to clinic
  // Don't route to clinic just because AI confidence is low - the appointment flow should continue
  const requiresClinic = (aiConfidence < 0.6 && intent !== "appointment") || intent === "lead"

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
