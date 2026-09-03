/**
 * Receptionist — the SINGLE authoritative router for incoming
 * WhatsApp messages.
 *
 * Routing priority (highest first):
 *
 *   1. EMERGENCY                       — life-safety override
 *   2. APPOINTMENT_START               — explicit booking intent
 *   3. APPOINTMENT_SLOT_ANSWER         — active draft + slot answer
 *   4. APPOINTMENT_INTERRUPTION        — active draft + non-slot
 *                                         question; preserve draft
 *   5. CANCEL_INTENT                    — go to normal flow
 *   6. RESCHEDULE_INTENT                — go to normal flow
 *   7. CLINIC_INFORMATION              — location, hours, services
 *   8. INSURANCE                        — insurance questions
 *   9. MEDICAL_SYMPTOM                  — symptom, no booking
 *  10. GENERAL                          — greetings, FAQ, fallback
 *
 * The receptionist is the ONLY writer of
 * `Conversation.metadata.appointmentDraft`. The pipeline's
 * `prisma.conversation.update` no longer touches `metadata`.
 */

import { prisma } from "@/lib/db"
import { generateAIResponseWithTools, generateAIResponse } from "@/lib/ai"
import { detectIntent } from "./intent"
import {
  processSlotAnswer,
  readDraftFromMetadata,
  writeDraftToMetadata,
  createFreshDraft,
  clearDraft,
  isDraftReady,
  isEmergencyOverride,
  type AppointmentDraft,
} from "./appointment-state"
import { classifyRoute, logRouteDecision, type Route } from "./route-classifier"
import { logger } from "@/lib/logger"
import type { Intent, IncomingMessage, PipelineContext } from "../types"
import type { ChatMessage } from "@/types"

export async function runAiReceptionist(
  context: Omit<PipelineContext, "aiResponse" | "intent" | "confidence" | "requiresClinic">,
  message: IncomingMessage,
  conversationHistory: ChatMessage[] = [],
): Promise<{ response: string; intent: Intent; confidence: number; requiresClinic: boolean }> {
  const existingDraft = readDraftFromMetadata(context.conversation.metadata)
  const decision = classifyRoute(message.content, existingDraft)
  logRouteDecision(decision, context.conversation.id, context.clinicId)

  // ========================================================================
  // LEVEL 1: EMERGENCY
  // ========================================================================
  if (decision.route === "EMERGENCY") {
    // Preserve the draft (we do not destroy it) but route to the
    // emergency response.
    logger.info("[RECEPTIONIST] Emergency — returning emergency response", {
      conversationId: context.conversation.id,
      clinicId: context.clinicId,
      hadActiveDraft: Boolean(existingDraft?.active),
    })
    return {
      response: buildEmergencyResponse(context.clinic),
      intent: "emergency",
      confidence: 0.95,
      requiresClinic: true,
    }
  }

  // ========================================================================
  // LEVEL 2: APPOINTMENT_START
  //   The user has EXPLICITLY asked to book. Activate a fresh draft.
  // ========================================================================
  if (decision.route === "APPOINTMENT_START") {
    const draft = createFreshDraft()
    await prisma.conversation.update({
      where: { id: context.conversation.id },
      data: {
        metadata: writeDraftToMetadata(context.conversation.metadata, draft),
        intent: "appointment",
        isEmergency: false,
        status: "active",
        summary: message.content.slice(0, 200),
      },
    })
    // Auto-fill phone from the WhatsApp sender if available.
    const autoPhone = message.from.phone
    if (autoPhone && !draft.patientPhone) {
      draft.patientPhone = autoPhone
      draft.history.push({ field: "patientPhone", value: autoPhone, source: "whatsapp" })
    }
    // The first prompt is always the name.
    return {
      response: "Sure, I can help you book an appointment. What's your full name?",
      intent: "appointment",
      confidence: 0.95,
      requiresClinic: false,
    }
  }

  // ========================================================================
  // LEVEL 3: APPOINTMENT_SLOT_ANSWER
  //   Active draft + message plausibly answers the expected slot.
  //   Feed the message to the state machine.
  // ========================================================================
  if (decision.route === "APPOINTMENT_SLOT_ANSWER" && existingDraft && existingDraft.active) {
    const turn = processSlotAnswer(
      existingDraft,
      message.content,
      { id: message.from.id, phone: message.from.phone, name: message.from.name },
    )

    logger.info("[APPOINTMENT-FLOW] Slot answer processed", {
      conversationId: context.conversation.id,
      clinicId: context.clinicId,
      filledField: decision.expectedField,
      ready: turn.isComplete,
      hasName: Boolean(turn.draft.patientName),
      hasPhone: Boolean(turn.draft.patientPhone),
      hasReason: Boolean(turn.draft.reason),
      hasDate: Boolean(turn.draft.preferredDate),
      hasTime: Boolean(turn.draft.preferredTime),
      expectedField: turn.draft.expectedField,
    })

    if (turn.isComplete && isDraftReady(turn.draft)) {
      // All required fields collected. Hand off to the AI to do
      // the actual booking.
      const aiResult = await bookAppointmentViaAi(context, turn.draft, conversationHistory)
      // Persist the (now-collected) draft until booking actually
      // succeeds; we clear it only after a successful tool result.
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
        confidence: 0.95,
        requiresClinic: aiResult.requiresClinic,
      }
    }

    // Not yet complete — persist the updated draft and emit the
    // next prompt. The next prompt is deterministic; no LLM call.
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
    return {
      response: turn.nextPrompt || "Could you provide a bit more detail?",
      intent: "appointment",
      confidence: 0.95,
      requiresClinic: false,
    }
  }

  // ========================================================================
  // LEVEL 4: INTERRUPTION (active draft + non-slot question)
  //   Active draft + non-slot question of any kind (clinic
  //   information, insurance, symptom question). Preserve the
  //   draft, answer the interruption normally. The receptionist
  //   is the SOLE writer of `Conversation.metadata.appointmentDraft`,
  //   so we do NOT touch metadata on the interruption path.
  //   After the AI replies, the next user message is re-evaluated
  //   and resumes from the correct missing field.
  // ========================================================================
  const isInterruption =
    existingDraft && existingDraft.active &&
    (decision.route === "APPOINTMENT_INTERRUPTION" ||
     decision.route === "CLINIC_INFORMATION" ||
     decision.route === "INSURANCE" ||
     decision.route === "MEDICAL_SYMPTOM")
  if (isInterruption) {
    logger.info("[APPOINTMENT-FLOW] Interruption — answering normally, draft preserved", {
      conversationId: context.conversation.id,
      clinicId: context.clinicId,
      interruptionRoute: decision.route,
      expectedField: existingDraft.expectedField,
    })
    const aiResult = await generateAIResponseWithTools(
      message.content,
      context.clinicId,
      conversationHistory,
    )
    return {
      response: aiResult.response || "I'm here to help with appointments and clinic questions. Could you please provide more details?",
      intent: "general_question",
      confidence: 0.7,
      requiresClinic: false,
    }
  }

  // ========================================================================
  // LEVEL 5-10: CANCEL / RESCHEDULE / CLINIC / INSURANCE / SYMPTOM / GENERAL
  //   No active draft, or non-slot message. Route to the normal AI
  //   flow. The AI handles medical guidance, FAQ, location, etc.
  // ========================================================================
  // For MEDICAL_SYMPTOM, prepend a "would you like to book?" offer
  // to the response. This is the correct product behavior: a
  // symptom question gets a medical guidance reply AND an
  // invitation to book, but NEVER an automatic booking.
  const intentForLogging: Intent =
    decision.route === "CANCEL_INTENT" ? "general_question" :
    decision.route === "RESCHEDULE_INTENT" ? "general_question" :
    decision.route === "CLINIC_INFORMATION" ? "general_question" :
    decision.route === "INSURANCE" ? "general_question" :
    decision.route === "MEDICAL_SYMPTOM" ? "general_question" :
    "general_question"

  logger.info("[RECEPTIONIST] Normal flow", {
    conversationId: context.conversation.id,
    clinicId: context.clinicId,
    route: decision.route,
    userMessage: message.content.slice(0, 120),
  })

  const aiResult = await generateAIResponseWithTools(
    message.content,
    context.clinicId,
    conversationHistory,
  )

  let response = aiResult.response
  if (!response || !response.trim()) {
    // Empty AI response. Do NOT pretend an appointment is being
    // started. Fall back to a generic clarification.
    response = "I'm here to help with appointments and clinic questions. Could you please provide more details?"
  }

  return {
    response,
    intent: intentForLogging,
    confidence: 0.7,
    requiresClinic: false,
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
