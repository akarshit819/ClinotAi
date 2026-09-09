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
  isConfirmationMessage,
  isDenialMessage,
  isChooseForMeMessage,
  isListTimesMessage,
  isBookingStatusQuestion,
  extractAllFields,
  extractDate,
  extractTime,
  extractYearCorrection,
  applyYearToDate,
  formatDateHuman,
  formatDateHumanLong,
  formatTimeHuman,
  buildPrompt,
  buildConfirmationSummary,
  buildBookingConfirmation,
  nextMissingField,
  type AppointmentDraft,
} from "./appointment-state"
import { bookAppointmentFromDraft, findNearestAvailableSlot } from "@/lib/appointment/booking"
import {
  findAvailableSlotsByRange,
  getNextAvailableSlots,
  getClinicTimezone,
  formatSlotInTimezone,
} from "@/lib/appointment/availability"
import { classifyRoute, logRouteDecision, isSlotAnswerFor, type Route } from "./route-classifier"
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
  // LEVEL 1.7: YEAR CORRECTION (deterministic — never generic fallback)
  //   Active draft holds a date, the message carries an explicit year
  //   ("not 2027, 2026", "it's 2026", bare "2026") but no parseable
  //   full date. Rewrite the draft year in place and preserve everything
  //   else.
  // ========================================================================
  if (existingDraft?.active && existingDraft.preferredDate) {
    const messageDate = extractDate(message.content, new Date())
    if (!messageDate) {
      const correctedYear = extractYearCorrection(message.content)
      if (correctedYear) {
        const fixed = applyYearToDate(existingDraft.preferredDate, correctedYear)
        if (fixed && fixed !== existingDraft.preferredDate) {
          const updated: AppointmentDraft = {
            ...existingDraft,
            preferredDate: fixed,
            updatedAt: new Date().toISOString(),
            history: [
              ...existingDraft.history,
              { field: "preferredDate", value: fixed, source: "user_correction" },
            ],
          }
          updated.expectedField = nextMissingField(updated)
          updated.status = updated.expectedField ? "collecting" : "ready"
          await prisma.conversation.update({
            where: { id: context.conversation.id },
            data: {
              metadata: updateContextState(
                writeDraftToMetadata(context.conversation.metadata, updated),
                { currentTopic: "appointment", lastUserIntent: "correcting_date" },
              ),
              intent: "appointment",
              status: "active",
              summary: message.content.slice(0, 200),
            },
          })
          logger.info("[APPOINTMENT] APPOINTMENT_DATE_PARSED (year correction)", {
            conversationId: context.conversation.id,
            clinicId: context.clinicId,
            correctedYear,
            preferredDate: fixed,
          })
          const followUp = updated.expectedField
            ? buildPrompt(updated, updated.expectedField)
            : buildConfirmationSummary(updated)
          return {
            response: `Got it — updated to ${formatDateHuman(fixed)}. ${followUp}`,
            intent: "appointment",
            confidence: 0.95,
            requiresClinic: false,
            responseSource: "APPOINTMENT",
          }
        }
      }
    }
  }

  // ========================================================================
  // LEVEL 1.75: DELEGATED TIME CHOICE ("take according to yourself")
  //   Deterministic: search REAL availability, prefer the SAME date and a
  //   time close to the requested one. NEVER the generic fallback, NEVER
  //   an LLM-invented time.
  // ========================================================================
  if (existingDraft?.active && isChooseForMeMessage(message.content)) {
    if (!existingDraft.preferredDate) {
      return {
        response:
          "I'd be happy to pick a time for you. Which date should I look at? " +
          "You can say 'tomorrow' or a date like 'October 5'.",
        intent: "appointment",
        confidence: 0.9,
        requiresClinic: false,
        responseSource: "APPOINTMENT",
      }
    }
    const previousTime = existingDraft.preferredTime
    const nearest = await findNearestAvailableSlot({
      clinicId: context.clinicId,
      date: existingDraft.preferredDate,
      preferredTime: previousTime || undefined,
      excludeTime: previousTime || undefined,
    })
    if (!nearest) {
      logger.info("[APPOINTMENT] Delegated choice found nothing available", {
        conversationId: context.conversation.id,
        clinicId: context.clinicId,
        preferredDate: existingDraft.preferredDate,
      })
      return {
        response:
          `I couldn't find any availability on ${formatDateHuman(existingDraft.preferredDate)}. ` +
          "What other date works for you?",
        intent: "appointment",
        confidence: 0.85,
        requiresClinic: false,
        responseSource: "APPOINTMENT",
      }
    }
    const updated: AppointmentDraft = {
      ...existingDraft,
      preferredDate: nearest.date,
      preferredTime: nearest.time,
      providerId: nearest.providerId,
      providerName: nearest.providerName,
      expectedField: null,
      status: "ready",
      updatedAt: new Date().toISOString(),
      history: [
        ...existingDraft.history,
        { field: "preferredTime", value: `${nearest.date} ${nearest.time}`, source: "auto" },
      ],
    }
    await prisma.conversation.update({
      where: { id: context.conversation.id },
      data: {
        metadata: updateContextState(
          writeDraftToMetadata(context.conversation.metadata, updated),
          { currentTopic: "appointment", lastUserIntent: "delegated_time_choice" },
        ),
        intent: "appointment",
        status: "active",
        summary: message.content.slice(0, 200),
      },
    })
    logger.info("[APPOINTMENT] APPOINTMENT_DRAFT_UPDATED (delegated choice)", {
      conversationId: context.conversation.id,
      clinicId: context.clinicId,
      previousTime,
      pickedDate: nearest.date,
      pickedTime: nearest.time,
      providerName: nearest.providerName,
    })
    const pickedHuman = `${formatTimeHuman(nearest.time)} on ${formatDateHuman(nearest.date)}`
    return {
      response: previousTime
        ? `${formatTimeHuman(previousTime)} is unavailable. The nearest available time I found is ${pickedHuman}.\n\nShall I confirm this appointment?`
        : `The nearest available time I found is ${pickedHuman}.\n\nShall I confirm this appointment?`,
      intent: "appointment",
      confidence: 0.9,
      requiresClinic: false,
      responseSource: "APPOINTMENT",
    }
  }

  // ========================================================================
  // LEVEL 1.76: DETERMINISTIC AVAILABILITY LISTING ("what times are available")
  //   Real computed slots only — the LLM must never invent availability.
  // ========================================================================
  if (existingDraft?.active && isListTimesMessage(message.content)) {
    const listLines = await buildAvailableTimesMessage(
      context.clinicId,
      existingDraft.preferredDate || undefined,
    )
    return {
      response: listLines,
      intent: "appointment",
      confidence: 0.9,
      requiresClinic: false,
      responseSource: "APPOINTMENT",
    }
  }

  // ========================================================================
  // LEVEL 1.8: READY-DRAFT CONFIRMATION (deterministic booking)
  //   All slots collected. The user must explicitly confirm before ANY
  //   database write happens. Booking itself runs with NO LLM involved.
  //
  //   State machine: COLLECTING_DETAILS → READY_FOR_CONFIRMATION →
  //   BOOKING (synchronous, in-turn) → CONFIRMED | SLOT_UNAVAILABLE |
  //   FAILED | CANCELLED. The draft is cleared ONLY on CONFIRMED.
  // ========================================================================
  if (existingDraft?.active && isDraftReady(existingDraft)) {
    logger.info("[APPOINTMENT] APPOINTMENT_READY_FOR_CONFIRMATION", {
      conversationId: context.conversation.id,
      clinicId: context.clinicId,
      preferredDate: existingDraft.preferredDate,
      preferredTime: existingDraft.preferredTime,
    })

    // Status questions ("confirm or not?", "is it confirmed?") ask ABOUT
    // state — they must NEVER trigger booking. The draft is ready but
    // nothing is booked yet, so answer that truthfully and deterministically.
    if (isBookingStatusQuestion(message.content)) {
      return {
        response:
          "Not yet. Your appointment is ready, but I still need your " +
          "confirmation to book it. Would you like me to confirm it?",
        intent: "appointment",
        confidence: 0.95,
        requiresClinic: false,
        responseSource: "APPOINTMENT",
      }
    }

    if (isConfirmationMessage(message.content)) {
      logger.info("[APPOINTMENT] APPOINTMENT_CONFIRMATION_REQUESTED", {
        conversationId: context.conversation.id,
        clinicId: context.clinicId,
      })
      const result = await bookAppointmentFromDraft({
        clinicId: context.clinicId,
        draft: existingDraft,
        whatsappPhone: message.from.phone,
        whatsappName: message.from.name,
      })
      if (result.ok) {
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
            status: "active",
            summary: message.content.slice(0, 200),
          },
        })
        const confirmationText = result.duplicate
          ? [
              "Your appointment is already confirmed — no duplicate was created.",
              "",
              `Date: ${formatDateHuman(existingDraft.preferredDate!)}`,
              `Time: ${formatTimeHuman(existingDraft.preferredTime!)}`,
              `Patient: ${existingDraft.patientName || "—"}`,
              "",
              "We look forward to seeing you.",
            ].join("\n")
          : buildBookingConfirmation(existingDraft)
        return {
          response: confirmationText,
          intent: "appointment",
          confidence: 0.95,
          requiresClinic: false,
          responseSource: "APPOINTMENT",
        }
      }
      if (result.reason === "slot_taken") {
        // Reopen time collection; everything else is preserved.
        const reopened: AppointmentDraft = {
          ...existingDraft,
          preferredTime: undefined,
          expectedField: "time",
          status: "collecting",
          updatedAt: new Date().toISOString(),
        }
        await prisma.conversation.update({
          where: { id: context.conversation.id },
          data: {
            metadata: updateContextState(
              writeDraftToMetadata(context.conversation.metadata, reopened),
              { currentTopic: "appointment", lastUserIntent: "slot_taken" },
            ),
            intent: "appointment",
            status: "active",
            summary: message.content.slice(0, 200),
          },
        })
        return {
          response:
            "That time was just taken. What other time works for you? For example, '5 PM' or 'tomorrow morning'.",
          intent: "appointment",
          confidence: 0.9,
          requiresClinic: false,
          responseSource: "APPOINTMENT",
        }
      }
      // no_provider / missing_fields / error: keep the draft, be honest,
      // never pretend success.
      logger.error("[APPOINTMENT] Booking failed at confirmation", {
        conversationId: context.conversation.id,
        clinicId: context.clinicId,
        reason: result.reason,
      })
      return {
        response:
          "I couldn't complete the booking just now. Our team has your request " +
          `for ${formatDateHuman(existingDraft.preferredDate!)} and will confirm shortly. ` +
          "Is there anything else I can help with?",
        intent: "appointment",
        confidence: 0.8,
        requiresClinic: true,
        responseSource: "APPOINTMENT",
      }
    }

    if (isDenialMessage(message.content)) {
      const cleared = clearDraft("user_declined")
      await prisma.conversation.update({
        where: { id: context.conversation.id },
        data: {
          metadata: updateContextState(
            writeDraftToMetadata(context.conversation.metadata, cleared),
            { currentTopic: "general", lastUserIntent: "booking_declined" },
          ),
        },
      })
      logger.info("[APPOINTMENT] Booking declined — draft cleared", {
        conversationId: context.conversation.id,
        clinicId: context.clinicId,
      })
      return {
        response: "No problem, I won't book it. How else can I help you today?",
        intent: "general_question",
        confidence: 0.9,
        requiresClinic: false,
        responseSource: "APPOINTMENT",
      }
    }

    // Field correction while ready ("actually 4pm", "make it 13 September"):
    // apply differing extracted values, then re-summarize or ask next.
    // Each field is gated on isSlotAnswerFor so side questions ("where
    // are you located?") can NEVER corrupt the draft — extractReason is
    // intentionally permissive and would otherwise claim any sentence.
    const correction = extractAllFields(message.content, new Date())
    const corrected: AppointmentDraft = {
      ...existingDraft,
      history: [...existingDraft.history],
    }
    let changed = false
    if (
      correction.name &&
      correction.name !== existingDraft.patientName &&
      isSlotAnswerFor(message.content, "name", existingDraft)
    ) {
      corrected.patientName = correction.name
      corrected.history.push({ field: "patientName", value: correction.name, source: "user_correction" })
      changed = true
    }
    if (
      correction.phone &&
      correction.phone !== existingDraft.patientPhone &&
      isSlotAnswerFor(message.content, "phone", existingDraft)
    ) {
      corrected.patientPhone = correction.phone
      corrected.history.push({ field: "patientPhone", value: correction.phone, source: "user_correction" })
      changed = true
    }
    if (
      correction.reason &&
      correction.reason !== existingDraft.reason &&
      isSlotAnswerFor(message.content, "reason", existingDraft)
    ) {
      corrected.reason = correction.reason
      corrected.history.push({ field: "reason", value: correction.reason, source: "user_correction" })
      changed = true
    }
    if (
      correction.preferredDate &&
      correction.preferredDate !== existingDraft.preferredDate &&
      isSlotAnswerFor(message.content, "date", existingDraft)
    ) {
      corrected.preferredDate = correction.preferredDate
      corrected.history.push({ field: "preferredDate", value: correction.preferredDate, source: "user_correction" })
      changed = true
    }
    if (
      correction.preferredTime &&
      correction.preferredTime !== existingDraft.preferredTime &&
      isSlotAnswerFor(message.content, "time", existingDraft)
    ) {
      corrected.preferredTime = correction.preferredTime
      corrected.history.push({ field: "preferredTime", value: correction.preferredTime, source: "user_correction" })
      changed = true
    }
    if (changed) {
      corrected.expectedField = nextMissingField(corrected)
      corrected.status = corrected.expectedField ? "collecting" : "ready"
      corrected.updatedAt = new Date().toISOString()
      await prisma.conversation.update({
        where: { id: context.conversation.id },
        data: {
          metadata: updateContextState(
            writeDraftToMetadata(context.conversation.metadata, corrected),
            { currentTopic: "appointment", lastUserIntent: "correcting_booking" },
          ),
          intent: "appointment",
          status: "active",
          summary: message.content.slice(0, 200),
        },
      })
      logger.info("[APPOINTMENT] APPOINTMENT_DRAFT_UPDATED (correction while ready)", {
        conversationId: context.conversation.id,
        clinicId: context.clinicId,
      })
      const followUp = corrected.expectedField
        ? buildPrompt(corrected, corrected.expectedField)
        : buildConfirmationSummary(corrected)
      return {
        response: `Updated. ${followUp}`,
        intent: "appointment",
        confidence: 0.9,
        requiresClinic: false,
        responseSource: "APPOINTMENT",
      }
    }

    // Genuine side question while awaiting confirmation → fall through to
    // the normal flow (draft preserved as an interruption). Anything else
    // gets the confirmation summary again — deterministically, no LLM.
    if (/[?]/.test(message.content) || /^(what|where|when|how|do|does|is|are|can|could|tell)\b/i.test(message.content.trim())) {
      // Fall through to classifyRoute below.
    } else {
      return {
        response: buildConfirmationSummary(existingDraft),
        intent: "appointment",
        confidence: 0.9,
        requiresClinic: false,
        responseSource: "APPOINTMENT",
      }
    }
  }

  // ========================================================================
  // LEVEL 1.9: BOOKING-STATUS QUESTION WITHOUT AN ACTIVE DRAFT
  //   "is it confirmed?" after a completed booking (draft already
  //   cleared) or out of the blue. Answer truthfully from the DATABASE
  //   — never from the model — by looking up the most recent active
  //   appointment for this verified phone number.
  // ========================================================================
  if (!existingDraft?.active && isBookingStatusQuestion(message.content)) {
    const phone = message.from.phone || ""
    let latest: {
      preferredDate: string | null
      preferredTime: string | null
      patientName: string
      status: string
    } | null = null
    if (phone) {
      try {
        latest = await prisma.appointment.findFirst({
          where: {
            clinicId: context.clinicId,
            phone,
            status: { in: ["pending", "confirmed", "in_progress"] },
          },
          orderBy: { createdAt: "desc" },
          select: { preferredDate: true, preferredTime: true, patientName: true, status: true },
        })
      } catch (e) {
        logger.error("[APPOINTMENT] Status lookup failed", {
          conversationId: context.conversation.id,
          clinicId: context.clinicId,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
    if (latest?.preferredDate && latest?.preferredTime) {
      return {
        response:
          `Yes. Your appointment has been successfully confirmed for ` +
          `${formatDateHumanLong(latest.preferredDate)} at ${formatTimeHuman(latest.preferredTime)}.`,
        intent: "appointment",
        confidence: 0.9,
        requiresClinic: false,
        responseSource: "APPOINTMENT",
      }
    }
    return {
      response:
        "You don't have a confirmed appointment yet. Would you like to book one?",
      intent: "appointment",
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
    // Auto-fill phone from the WhatsApp sender BEFORE persisting so the
    // stored draft already carries it (previously it was only set on the
    // in-memory copy and lost on the next turn).
    const autoPhone = message.from.phone
    if (autoPhone && !draft.patientPhone) {
      draft.patientPhone = autoPhone
      draft.history.push({ field: "patientPhone", value: autoPhone, source: "whatsapp" })
    }
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
    logger.info("[APPOINTMENT] APPOINTMENT_DRAFT_UPDATED (activated)", {
      conversationId: context.conversation.id,
      clinicId: context.clinicId,
      phoneAutoFilled: Boolean(autoPhone),
    })
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
      // All required fields collected. Do NOT book yet — persist the
      // READY draft and ask for explicit confirmation. Booking happens
      // deterministically (no LLM) in the LEVEL 1.8 confirmation branch.
      // Previously this handed off to the AI, which emitted raw JSON and
      // fake confirmations without ever creating a database record.
      logger.info("[APPOINTMENT] APPOINTMENT_READY_FOR_CONFIRMATION", {
        conversationId: context.conversation.id,
        clinicId: context.clinicId,
        preferredDate: turn.draft.preferredDate,
        preferredTime: turn.draft.preferredTime,
      })
      await prisma.conversation.update({
        where: { id: context.conversation.id },
        data: {
          metadata: updateContextState(
            writeDraftToMetadata(context.conversation.metadata, turn.draft),
            { currentTopic: "appointment", lastUserIntent: "awaiting_confirmation" },
          ),
          intent: "appointment",
          isEmergency: false,
          status: "active",
          summary: message.content.slice(0, 200),
        },
      })
      return {
        response: buildConfirmationSummary(turn.draft),
        intent: "appointment",
        confidence: 0.95,
        requiresClinic: false,
        responseSource: "APPOINTMENT",
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
    // Bug 8: an interruption route must NEVER block explicit date/time
    // updates. "12 september 2026 at 4pm" replaces stale values even
    // when the classifier did not see a slot answer. ONLY date/time are
    // touched here — name/reason/phone stay exactly as collected.
    const explicitDate = extractDate(message.content, new Date())
    const explicitTime = extractTime(message.content)
    let draftForContext = existingDraft
    if (
      (explicitDate && explicitDate !== existingDraft.preferredDate) ||
      (explicitTime && explicitTime !== existingDraft.preferredTime)
    ) {
      const refreshed: AppointmentDraft = {
        ...existingDraft,
        history: [...existingDraft.history],
        updatedAt: new Date().toISOString(),
      }
      if (explicitDate && explicitDate !== existingDraft.preferredDate) {
        refreshed.preferredDate = explicitDate
        refreshed.history.push({ field: "preferredDate", value: explicitDate, source: "user" })
      }
      if (explicitTime && explicitTime !== existingDraft.preferredTime) {
        refreshed.preferredTime = explicitTime
        refreshed.history.push({ field: "preferredTime", value: explicitTime, source: "user" })
      }
      refreshed.expectedField = nextMissingField(refreshed)
      refreshed.status = refreshed.expectedField ? "collecting" : "ready"
      await prisma.conversation.update({
        where: { id: context.conversation.id },
        data: {
          metadata: writeDraftToMetadata(context.conversation.metadata, refreshed),
        },
      })
      logger.info("[APPOINTMENT] APPOINTMENT_DRAFT_UPDATED (explicit date/time during interruption)", {
        conversationId: context.conversation.id,
        clinicId: context.clinicId,
        preferredDate: refreshed.preferredDate,
        preferredTime: refreshed.preferredTime,
      })
      // Refresh the in-memory copy so the context header and everything
      // downstream see the NEW values (never stale ones).
      context.conversation.metadata = writeDraftToMetadata(context.conversation.metadata, refreshed)
      draftForContext = refreshed
    }
    // Small context: recent window + topic header + one-line draft
    // summary so the AI knows a booking is mid-flight and must not
    // re-ask collected fields.
    const { messages, nextMetadata } = buildSmallContext({
      messageContent: message.content,
      history: conversationHistory,
      currentMetadata: context.conversation.metadata,
      route: decision.route,
      draft: draftForContext,
    })
    const aiResult = await generateAIResponseWithTools(
      message.content,
      context.clinicId,
      // History param unused when prebuiltMessages is provided.
      [],
      undefined,
      // Pre-built short-term context: [context header, ...recent
      // turns, current user message]. Used verbatim by the AI layer.
      { prebuiltMessages: messages, includeTools: false },
    )
    await prisma.conversation.update({
      where: { id: context.conversation.id },
      data: { metadata: nextMetadata },
    })
    // Truthful source semantics: if the AI layer reports ANY
    // fallbackReason, the reply did NOT come from a provider — even
    // though a non-empty fallback TEXT exists. "AI" is reserved for
    // genuine provider-generated responses.
    const interruptionSource = aiResult.fallbackReason ? "FALLBACK" : "AI"
    return {
      response: aiResult.response || "I'm here to help with appointments and clinic questions. Could you please provide more details?",
      intent: "general_question",
      confidence: 0.7,
      requiresClinic: false,
      responseSource: interruptionSource,
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
    { prebuiltMessages: messages, includeTools: false },
  )

  // Truthful source semantics: a non-empty fallback TEXT is NOT an AI
  // response. "AI" is reported ONLY when the provider generated the
  // reply (no fallbackReason); any fallbackReason — including
  // AI_INTERNAL_ERROR from a module failure — means the final text
  // came from the fallback path.
  const hadAiResponse = Boolean(aiResult.response && aiResult.response.trim()) && !aiResult.fallbackReason
  let response = aiResult.response
  if (!aiResult.response || !aiResult.response.trim()) {
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
    fallbackReason: (aiResult as { fallbackReason?: string }).fallbackReason,
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
 * Deterministic availability listing from REAL computed slots.
 * With a draft date: up to 5 open times that day. Without: the next few
 * open slots across days. Never LLM-invented.
 */
async function buildAvailableTimesMessage(clinicId: string, dateIso?: string): Promise<string> {
  const timezone = await getClinicTimezone(clinicId)
  try {
    if (dateIso) {
      const m = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!m) return "Which date should I check availability for?"
      const day = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
      const start = new Date(day)
      start.setHours(0, 0, 0, 0)
      const end = new Date(day)
      end.setHours(23, 59, 59, 999)
      const slots = await findAvailableSlotsByRange({ clinicId, startDate: start, endDate: end })
      const open = slots.filter((s) => {
        if (!s.available) return false
        return formatSlotInTimezone(s.startTime, timezone).date === dateIso
      }).slice(0, 5)
      if (open.length === 0) {
        return (
          `I don't see any availability on ${formatDateHuman(dateIso)}. ` +
          "What other date works for you?"
        )
      }
      const times = open.map((s) => formatTimeHuman(formatSlotInTimezone(s.startTime, timezone).time))
      return (
        `Here is what I have open on ${formatDateHuman(dateIso)}:\n` +
        times.map((t) => `• ${t}`).join("\n") +
        `\n\nWhich time works for you?`
      )
    }
    const next = await getNextAvailableSlots(clinicId, 5)
    if (next.length === 0) {
      return "I couldn't find any open slots right now. Our team will follow up with options shortly."
    }
    const lines = next.map((s) => {
      const wall = formatSlotInTimezone(s.startTime, timezone)
      return `• ${formatDateHuman(wall.date)} at ${formatTimeHuman(wall.time)}`
    })
    return `Here are the next available slots:\n${lines.join("\n")}\n\nWhich one works for you?`
  } catch (e) {
    logger.error("[APPOINTMENT] Availability listing failed", {
      clinicId,
      error: e instanceof Error ? e.message : String(e),
    })
    return "I couldn't check availability just now. Please try again in a moment."
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
