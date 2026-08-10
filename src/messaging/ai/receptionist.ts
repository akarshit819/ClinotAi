import { prisma } from "@/lib/db"
import { generateAIResponse } from "@/lib/ai"
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

  const aiResponse = await generateAIResponse(message.content, context.clinicId, [])

  const aiConfidence = aiResponse ? 0.85 : 0

  // Send the AI reply whenever it produced a confident response. A low
  // keyword-match confidence on a short greeting ("Hi", "Hello") must not
  // suppress the reply - the receptionist should always acknowledge the
  // patient. Only route to the clinic when the AI has no confident response,
  // or when the intent explicitly needs human handling.
  const requiresClinic = aiConfidence < 0.6 || intent === "appointment" || intent === "lead"

  return {
    response: aiResponse || "I'll connect you with our team to help with your question.",
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
