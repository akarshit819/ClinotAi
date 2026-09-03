import { prisma } from "@/lib/db"
import { generateAIResponseWithTools } from "@/lib/ai"
import { detectIntent } from "./intent"
import {
  processTurn,
  readDraftFromMetadata,
  writeDraftToMetadata,
  isAppointmentTrigger,
  isSymptomTrigger,
  isDraftReady,
  isEmergencyOverride,
  type AppointmentDraft,
} from "./appointment-state"
import { logger } from "@/lib/logger"
import type { Intent, IncomingMessage, PipelineContext } from "../types"
import type { ChatMessage } from "@/types"

export async function runAiReceptionist(
  context: Omit<PipelineContext, "aiResponse" | "intent" | "confidence" | "requiresClinic">,
  message: IncomingMessage,
  conversationHistory: ChatMessage[] = [],
): Promise<{ response: string; intent: Intent; confidence: number; requiresClinic: boolean }> {
  const { intent, confidence: intentConfidence } = detectIntent(message.content)

  // ========================================================================
  // 1) EMERGENCY OVERRIDE
  //    The user's message contains emergency keywords — respond with the
  //    emergency message and clear any active appointment state. This
  //    runs BEFORE the appointment state machine so an emergency
  //    keyword in the middle of "akarshit, 4pm, severe pain" still
  //    triggers the safety response.
  // ========================================================================
  if (intent === "emergency" || isEmergencyOverride(message.content)) {
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

  // ========================================================================
  // 2) APPOINTMENT STATE MACHINE
  //    Load any existing draft from Conversation.metadata. If a draft
  //    is already active, the current message is treated as a turn in
  //    the appointment flow even if the user did NOT say "book" again.
  //    The state machine is deterministic — it does not require an LLM
  //    call to advance.
  // ========================================================================
  const existingDraft = readDraftFromMetadata(context.conversation.metadata)
  const turn = processTurn(
    existingDraft,
    message.content,
    { id: message.from.id, phone: message.from.phone, name: message.from.name },
  )

  if (turn.shouldClear) {
    // User explicitly cancelled mid-flow, or emergency override. The
    // pipeline below will persist the cleared draft.
    await prisma.conversation.update({
      where: { id: context.conversation.id },
      data: {
        metadata: writeDraftToMetadata(context.conversation.metadata, turn.draft),
        // If the user is just talking, do not require clinic.
        intent: "general_question",
        isEmergency: false,
      },
    })
    // Fall through to normal intent handling for this turn.
  } else if (turn.draft.active) {
    // The state machine produced a draft. Persist it now so the next
    // turn (or worker restart) sees the same state.
    const nextPrompt = turn.nextPrompt
    const ready = turn.isComplete

    logger.info("[APPOINTMENT-FLOW] Active draft updated", {
      conversationId: context.conversation.id,
      clinicId: context.clinicId,
      ready,
      hasName: Boolean(turn.draft.patientName),
      hasPhone: Boolean(turn.draft.patientPhone),
      hasReason: Boolean(turn.draft.reason),
      hasDate: Boolean(turn.draft.preferredDate),
      hasTime: Boolean(turn.draft.preferredTime),
      historySteps: turn.draft.history.length,
    })

    if (ready && isDraftReady(turn.draft)) {
      // All required fields collected. Hand off to the AI to perform
      // the actual booking via the book_appointment tool. We pass
      // a tightly-scoped prompt that includes the collected fields
      // and the available providers so the AI can pick providerId
      // and startTime / endTime deterministically.
      const aiResult = await bookAppointmentViaAi(context, turn.draft, conversationHistory)
      await prisma.conversation.update({
        where: { id: context.conversation.id },
        data: {
          metadata: writeDraftToMetadata(context.conversation.metadata, turn.draft),
          intent: "appointment",
          isEmergency: false,
          status: aiResult.requiresClinic ? "waiting_clinic" : "active",
          summary: message.content.slice(0, 200),
        },
      })
      return {
        response: aiResult.response,
        intent: "appointment",
        confidence: Math.max(intentConfidence, 0.9),
        requiresClinic: aiResult.requiresClinic,
      }
    }

    // Not yet complete — persist the draft and emit the next prompt.
    await prisma.conversation.update({
      where: { id: context.conversation.id },
      data: {
        metadata: writeDraftToMetadata(context.conversation.metadata, turn.draft),
        intent: "appointment",
        isEmergency: false,
        status: "active",
        summary: message.content.slice(0, 200),
      },
    })

    // We have a deterministic prompt. Use it directly; no LLM call
    // required. This eliminates the "AI doesn't understand
    // 'akarshit'" failure mode entirely.
    if (nextPrompt) {
      return {
        response: nextPrompt,
        intent: "appointment",
        confidence: 0.95,
        requiresClinic: false,
      }
    }
  } else if (isAppointmentTrigger(message.content) || isSymptomTrigger(message.content)) {
    // A new trigger on a conversation that had no draft. The
    // processTurn() above already activated the draft (because the
    // state machine's `active` is set inside the function), but the
    // flow above didn't take the `turn.draft.active` branch. The
    // simplest way to handle this is to re-call processTurn
    // semantics here, but that's wasteful. Instead: explicitly
    // activate below and re-derive the next prompt.
    //
    // The state machine is idempotent: calling processTurn on a
    // message that activates returns draft.active=true. So re-running
    // it is correct.
    const turn2 = processTurn(
      null,
      message.content,
      { id: message.from.id, phone: message.from.phone, name: message.from.name },
    )
    if (turn2.draft.active) {
      await prisma.conversation.update({
        where: { id: context.conversation.id },
        data: {
          metadata: writeDraftToMetadata(context.conversation.metadata, turn2.draft),
          intent: "appointment",
          isEmergency: false,
          status: "active",
          summary: message.content.slice(0, 200),
        },
      })
      if (turn2.nextPrompt) {
        return {
          response: turn2.nextPrompt,
          intent: "appointment",
          confidence: 0.95,
          requiresClinic: false,
        }
      }
    }
  }

  // ========================================================================
  // 3) NORMAL AI FLOW (greetings, FAQs, knowledge-base Q&A, RAG, etc.)
  //    This runs ONLY when the appointment state machine is not active
  //    for this turn. It is the catch-all for everything that is not
  //    a booking.
  // ========================================================================
  logger.info("[AI-RECEPTIONIST] Calling AI with tools (non-appointment flow)", {
    conversationId: context.conversation.id,
    clinicId: context.clinicId,
    userMessage: message.content.slice(0, 120),
  })

  const aiResult = await generateAIResponseWithTools(
    message.content,
    context.clinicId,
    conversationHistory,
  )

  let response = aiResult.response
  const aiConfidence = response && response.trim() ? 0.85 : 0
  const requiresClinic = (aiConfidence < 0.6 && intent !== "appointment") || intent === "lead"

  return {
    response: response || "I'll connect you with our team to help with your question.",
    intent,
    confidence: Math.max(intentConfidence, aiConfidence),
    requiresClinic,
  }
}

/**
 * All required fields are present. Call the AI with a tightly-scoped
 * prompt that drives the book_appointment tool call. The AI picks a
 * providerId via get_next_available_slots, then books. The
 * deterministic part of the booking (patientName, patientPhone,
 * reason, preferredDate, preferredTime) is injected by us so the AI
 * cannot hallucinate any of them.
 */
async function bookAppointmentViaAi(
  context: Omit<PipelineContext, "aiResponse" | "intent" | "confidence" | "requiresClinic">,
  draft: AppointmentDraft,
  conversationHistory: ChatMessage[],
): Promise<{ response: string; requiresClinic: boolean }> {
  const userMessage = [
    `The patient has confirmed the following booking details. Please call book_appointment now with these exact values; do NOT ask any more questions.`,
    ``,
    `Name: ${draft.patientName}`,
    `Phone: ${draft.patientPhone}`,
    `Reason: ${draft.reason}`,
    `Preferred date: ${draft.preferredDate}`,
    `Preferred time: ${draft.preferredTime}`,
    ``,
    `If the requested time is unavailable, use get_next_available_slots to pick the closest alternative, then call book_appointment with that slot. Confirm the appointment details to the patient in your reply.`,
  ].join("\n")

  const aiResult = await generateAIResponseWithTools(
    userMessage,
    context.clinicId,
    conversationHistory,
  )

  if (aiResult.response && aiResult.response.trim()) {
    return { response: aiResult.response, requiresClinic: false }
  }

  // Fallback: the AI didn't reply (e.g., tool call returned but no
  // confirmation text). Provide a clear, factual confirmation.
  return {
    response:
      `Thanks${draft.patientName ? `, ${draft.patientName.split(/\s+/)[0]}` : ""}! ` +
      `I've sent your appointment request to our team. ` +
      `We'll confirm ${draft.preferredDate} at ${draft.preferredTime} for ${draft.reason} shortly.`,
    requiresClinic: true,
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
