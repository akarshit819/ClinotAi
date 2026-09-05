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
 * `Conversation.metadata.appointmentDraft` and the ONLY updater of
 * `Conversation.metadata.contextState` (current topic + last user
 * intent). The pipeline's `prisma.conversation.update` no longer
 * touches `metadata`.
 *
 * Short-term context: every AI call receives a SMALL rolling window
 * of recent messages plus a one-line `[context: ...]` header carrying
 * the current topic and (if active) a one-line appointment draft
 * summary. We deliberately do NOT send the entire conversation
 * history — see `context.ts`.
 */

import { prisma } from "@/lib/db"
import { generateAIResponseWithTools } from "@/lib/ai"
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
import {
  buildShortTermContext,
  readContextState,
  topicForRoute,
  updateContextState,
  summarizeAppointmentDraft,
  type TopicCategory,
} from "./context"
import { logger } from "@/lib/logger"
import type { Intent, IncomingMessage, PipelineContext } from "../types"
import type { ChatMessage } from "@/types"

/**
 * Map a route to a short intent hint stored as
 * `metadata.contextState.lastUserIntent`. Hints (not transcripts)
 * keep the next turn's context small while letting the AI resolve
 * follow-ups like "How much?".
 */
function intentHintForRoute(route: Route): string {
  switch (route) {
    case "CLINIC_INFORMATION":
      return "asking_about_clinic"
    case "INSURANCE":
      return "asking_about_insurance"
    case "MEDICAL_SYMPTOM":
      return "describing_symptom"
    case "APPOINTMENT_START":
      return "starting_appointment"
    case "APPOINTMENT_SLOT_ANSWER":
      return "answering_slot"
    case "APPOINTMENT_INTERRUPTION":
      return "side_question_during_booking"
    case "CANCEL_INTENT":
      return "asking_to_cancel"
    case "RESCHEDULE_INTENT":
      return "asking_to_reschedule"
    case "EMERGENCY":
      return "emergency"
    default:
      return "general_question"
  }
}

/**
 * Build the small AI context for this turn and the updated metadata
 * blob that persists the new currentTopic / lastUserIntent. The
 * caller writes `nextMetadata` back to Conversation.metadata.
 */
function buildSmallContext(params: {
  messageContent: string
  history: ChatMessage[]
  currentMetadata: string | null | undefined
  route: Route
  draft: AppointmentDraft | null
}): { messages: ChatMessage[]; nextMetadata: string } {
  const priorTopic = readContextState(params.currentMetadata)?.currentTopic
  const newTopic: TopicCategory = topicForRoute(params.route, priorTopic)
  const hint = intentHintForRoute(params.route)

  const draftActive = Boolean(params.draft?.active)
  const draftSummary = draftActive
    ? summarizeAppointmentDraft({
        patientName: params.draft?.patientName,
        patientPhone: params.draft?.patientPhone,
        reason: params.draft?.reason,
        preferredDate: params.draft?.preferredDate,
        preferredTime: params.draft?.preferredTime,
        expectedField: params.draft?.expectedField,
      })
    : null

  const messages = buildShortTermContext({
    userMessage: params.messageContent,
    history: params.history,
    contextState: { currentTopic: newTopic, lastUserIntent: hint },
    appointmentDraftActive: draftActive,
    appointmentDraftSummary: draftSummary,
  })

  const nextMetadata = updateContextState(params.currentMetadata, {
    currentTopic: newTopic,
    lastUserIntent: hint,
  })

  return { messages, nextMetadata }
}

export async function runAiReceptionist(
  context: Omit<PipelineContext, "aiResponse" | "intent" | "confidence" | "requiresClinic">,
  message: IncomingMessage,
  conversationHistory: ChatMessage[] = [],
): Promise<{ response: string; intent: Intent; confidence: number; requiresClinic: boolean; responseSource: "AI" | "APPOINTMENT" | "EMERGENCY" | "FALLBACK" | "SYSTEM" }> {
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
      responseSource: "EMERGENCY",
    }
  }

  // ========================================================================
  // LEVEL 1.5: FLOW_CANCEL (Active draft cancelled by user)
  // ========================================================================
  if (decision.reason === "flow_cancel" && existingDraft && existingDraft.active) {
    logger.info("[RECEPTIONIST] Flow cancel — clearing active appointment draft", {
      conversationId: context.conversation.id,
      clinicId: context.clinicId,
    })
    const cleared = clearDraft("user_cancelled")
    await prisma.conversation.update({
      where: { id: context.conversation.id },
      data: {
        metadata: updateContextState(
          writeDraftToMetadata(context.conversation.metadata, cleared),
          { currentTopic: "general", lastUserIntent: "flow_cancel" },
        ),
      },
    })
    return {
      response: "No problem, I've cancelled that booking request. How else can I help you today?",
      intent: "general_question",
      confidence: 0.9,
      requiresClinic: false,
      responseSource: "APPOINTMENT",
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
        metadata: updateContextState(
          writeDraftToMetadata(context.conversation.metadata, draft),
          { currentTopic: "appointment", lastUserIntent: intentHintForRoute(decision.route) },
        ),
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
      responseSource: "APPOINTMENT",
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
      // Booking attempted — clear the draft so the next message
      // is treated as a fresh conversation, not a continuation of
      // the appointment flow.
      const clearedDraft = clearDraft("completed")
      await prisma.conversation.update({
        where: { id: context.conversation.id },
        data: {
          metadata: updateContextState(
            writeDraftToMetadata(context.conversation.metadata, clearedDraft),
            { currentTopic: "appointment", lastUserIntent: "booking_confirmed" },
          ),
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
        responseSource: "AI",
      }
    }

    // Not yet complete — persist the updated draft and emit the
    // next prompt. The next prompt is deterministic; no LLM call.
    // contextState.lastUserIntent records that we are mid-slot.
    await prisma.conversation.update({
      where: { id: context.conversation.id },
      data: {
        metadata: updateContextState(
          writeDraftToMetadata(context.conversation.metadata, turn.draft),
          { currentTopic: "appointment", lastUserIntent: intentHintForRoute(decision.route) },
        ),
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
      responseSource: "APPOINTMENT",
    }
  }

  // ========================================================================
  // LEVEL 4: INTERRUPTION (active draft + non-slot question)
  //   Active draft + non-slot question of any kind (clinic
  //   information, insurance, symptom question). Preserve the
  //   draft, answer the interruption normally. We DO update
  //   `metadata.contextState` (the current topic moved to the
  //   interruption subject) but NEVER touch `appointmentDraft` —
  //   business state survives the side question untouched.
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
    // Small context: recent window + topic header + one-line draft
    // summary so the AI knows a booking is mid-flight and must not
    // re-ask collected fields. The draft itself is NOT modified.
    const { messages, nextMetadata } = buildSmallContext({
      messageContent: message.content,
      history: conversationHistory,
      currentMetadata: context.conversation.metadata,
      route: decision.route,
      draft: existingDraft,
    })
    const aiResult = await generateAIResponseWithTools(
      message.content,
      context.clinicId,
      // History param unused when prebuiltMessages is provided.
      [],
      undefined,
      // Pre-built short-term context: [context header, ...recent
      // turns, current user message]. Used verbatim by the AI layer.
      { prebuiltMessages: messages },
    )
    await prisma.conversation.update({
      where: { id: context.conversation.id },
      data: { metadata: nextMetadata },
    })
    return {
      response: aiResult.response || "I'm here to help with appointments and clinic questions. Could you please provide more details?",
      intent: "general_question",
      confidence: 0.7,
      requiresClinic: false,
      responseSource: aiResult.response ? "AI" : "FALLBACK",
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

  // Small context: recent window + topic header (no active draft —
  // draft is null here). The AI sees the CURRENT topic, so a
  // follow-up like "How much?" resolves against the right subject,
  // and a topic switch replaces the header on the next turn.
  const { messages, nextMetadata } = buildSmallContext({
    messageContent: message.content,
    history: conversationHistory,
    currentMetadata: context.conversation.metadata,
    route: decision.route,
    draft: null,
  })
  const aiResult = await generateAIResponseWithTools(
    message.content,
    context.clinicId,
    [],
    undefined,
    { prebuiltMessages: messages },
  )

  const hadAiResponse = Boolean(aiResult.response && aiResult.response.trim())
  let response = aiResult.response
  if (!hadAiResponse) {
    // Empty AI response. Do NOT pretend an appointment is being
    // started. Fall back to a generic clarification.
    response = "I'm here to help with appointments and clinic questions. Could you please provide more details?"
  }

  // Persist the new currentTopic / lastUserIntent for the next turn.
  await prisma.conversation.update({
    where: { id: context.conversation.id },
    data: { metadata: nextMetadata },
  })

  logger.info("[RECEPTIONIST] Response dispatched", {
    conversationId: context.conversation.id,
    clinicId: context.clinicId,
    route: decision.route,
    responseSource: hadAiResponse ? "AI" : "FALLBACK",
  })

  return {
    response,
    intent: intentForLogging,
    confidence: 0.7,
    requiresClinic: false,
    responseSource: hadAiResponse ? "AI" : "FALLBACK",
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
