/**
 * Short-term AI context builder.
 *
 * Clinot does NOT behave like a long-term-memory chatbot. We build a
 * SMALL AI context per call:
 *
 *   - System prompt (built by the AI provider, not by this module)
 *   - A small rolling window of recent messages (default 4 turns)
 *   - A one-line [context: ...] line carrying the current topic,
 *     the last user intent, and (if active) a one-line appointment
 *     draft summary
 *   - The current user message
 *
 * We deliberately do NOT reconstruct the entire history. The
 * receptionist passes the recent slice (which the pipeline already
 * loads via loadConversationHistory) and we trim it here to the
 * configured CONTEXT_WINDOW_SIZE.
 *
 * Topic tracking is the receptionist's responsibility. The route
 * classifier classifies the CURRENT message; the receptionist writes
 * the result to Conversation.metadata.contextState (a separate
 * sibling field from appointmentDraft, which is business state).
 * This module READS that field and includes it as a one-line context
 * note; the receptionist writes the field AFTER each turn.
 *
 * Appointment state is BUSINESS state, not chat memory. It is
 * included as a single structured line via summarizeAppointmentDraft,
 * not as raw conversation.
 */

import type { ChatMessage } from "@/types"
import { AI } from "@/config/constants"
import { isClinotAllowedText } from "@/lib/ai/clinot-domain"

// Default: 4 recent turns. This is enough for a natural follow-up
// ("How much?" after "I want whitening.") while keeping token usage
// low and not dominating the prompt with stale topics.
export const CONTEXT_WINDOW_SIZE = 4

// Maximum characters of the currentTopic / lastUserIntent line. Kept
// tight so the context line does not become a re-summarized transcript.
export const CURRENT_TOPIC_MAX_LEN = 160

// Maximum characters of the appointment-draft summary line. One
// short sentence per active draft.
export const APPOINTMENT_DRAFT_MAX_LEN = 200

// === Topic category ========================================================
// A bounded enum of conversational topics. The route classifier maps
// its route to one of these, and the value is persisted as
// Conversation.metadata.contextState.currentTopic. We do NOT store
// free-form summaries here on every turn — that would just be a
// slower re-summary. We store the CATEGORY; the AI uses it as a
// hint.

export type TopicCategory =
  | "teeth_whitening"
  | "cleaning"
  | "checkup"
  | "braces"
  | "implants"
  | "extraction"
  | "root_canal"
  | "filling"
  | "general_dental"
  | "clinic_location"
  | "clinic_hours"
  | "clinic_contact"
  | "insurance"
  | "pricing"
  | "services"
  | "symptom"
  | "appointment"
  | "cancellation"
  | "reschedule"
  | "general"
  | "greeting"

export interface ConversationContextState {
  currentTopic?: TopicCategory
  /**
   * Short user-intent hint. Example: "asking_about_price",
   * "asking_hours". This is a HINT, not a transcript.
   */
  lastUserIntent?: string
  /**
   * Last update timestamp. For tests and observability.
   */
  updatedAt?: string
}

// === Topic-from-route mapping ============================================
//
// During APPOINTMENT_SLOT_ANSWER and APPOINTMENT_INTERRUPTION we KEEP
// the prior topic. The active appointment draft is the "real" context
// for those turns; the topic category is just an ambient hint that
// the AI may use to interpret follow-ups inside the appointment flow
// (e.g. "I have a headache" while expectedField=reason).

const TOPIC_BY_ROUTE: Record<string, TopicCategory> = {
  EMERGENCY: "symptom",
  APPOINTMENT_START: "appointment",
  CANCEL_INTENT: "cancellation",
  RESCHEDULE_INTENT: "reschedule",
  CLINIC_INFORMATION: "clinic_location",
  INSURANCE: "insurance",
  MEDICAL_SYMPTOM: "symptom",
  GENERAL: "general",
}

export function topicForRoute(
  route: string,
  priorTopic: TopicCategory | undefined,
): TopicCategory {
  if (
    route === "APPOINTMENT_INTERRUPTION" ||
    route === "APPOINTMENT_SLOT_ANSWER"
  ) {
    // Inside the active appointment flow, the appointment draft
    // is the real context. Keep the prior category so the AI
    // doesn't see a category-jump during a follow-up.
    return priorTopic ?? "appointment"
  }
  return TOPIC_BY_ROUTE[route] ?? priorTopic ?? "general"
}

// === Metadata persistence (safe merge) ===================================
//
// The receptionist is the ONLY writer of metadata.contextState. This
// function preserves appointmentDraft and any other unrelated fields
// (e.g. custom clinic metadata) across updates.

export function readContextState(
  metadata: string | null | undefined,
): ConversationContextState | null {
  if (!metadata) return null
  try {
    const parsed = JSON.parse(metadata)
    if (parsed && typeof parsed === "object" && "contextState" in parsed) {
      const cs = (parsed as { contextState?: ConversationContextState }).contextState
      if (cs && typeof cs === "object") return cs
    }
  } catch {
    // Malformed JSON. Do not crash the receptionist. The caller
    // falls back to "no prior context".
  }
  return null
}

export function updateContextState(
  metadata: string | null | undefined,
  next: ConversationContextState,
): string {
  let base: Record<string, unknown> = {}
  if (metadata) {
    try {
      const parsed = JSON.parse(metadata)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>
      }
    } catch {
      // Malformed metadata — overwrite rather than crash.
    }
  }
  base.contextState = {
    currentTopic: next.currentTopic,
    lastUserIntent: next.lastUserIntent,
    updatedAt: next.updatedAt ?? new Date().toISOString(),
  }
  return JSON.stringify(base)
}

// === Build the small AI context =========================================
//
// The output is a list of ChatMessage entries:
//   - (optional) one synthetic "user" message with [context: ...] tag
//   - up to CONTEXT_WINDOW_SIZE most recent messages
//   - the current user message last
//
// The synthetic [context] line is a single brief string; it is NOT a
// transcript or a vector embedding. It exists so the AI knows the
// current topic without re-deriving it from the (small) history.

export interface BuildContextInput {
  userMessage: string
  history: ChatMessage[]
  contextState: ConversationContextState | null
  appointmentDraftActive: boolean
  appointmentDraftSummary: string | null
}

export function buildShortTermContext(input: BuildContextInput): ChatMessage[] {
  // 0) Strip any PREVIOUS synthetic [context: ...] headers from the
  //    incoming history. Production history comes from the database
  //    (which never stores headers), but if a caller ever passes a
  //    previously-built context back in, the stale headers must not
  //    accumulate — the fresh header below replaces them.
  const realHistory = input.history.filter(
    (m) => !(typeof m.content === "string" && m.content.startsWith("[context:")),
  )

  // ANTI-POISONING: long outside-domain user messages (e.g., coding
  // requests, essays, injected instructions) must not become AI
  // context for future allowed turns. Short slot answers and light
  // acknowledgements are kept — the length gate (>40 chars) protects
  // names, dates, and other short appointment values.
  const unpoisonedHistory = realHistory.filter((m) => {
    if (m.role !== "user") return true
    if (typeof m.content !== "string") return true
    if (m.content.trim().length <= 40) return true
    return isClinotAllowedText(m.content)
  })

  // 1) Trim to the small window. We take the LAST CONTEXT_WINDOW_SIZE
  //    entries of the recent slice the pipeline already loaded.
  const trimmedHistory = unpoisonedHistory.slice(-CONTEXT_WINDOW_SIZE)

  // 2) Deduplicate consecutive same-role messages. Consecutive turns
  //    from the same role are often short acknowledgements ("ok",
  //    "thanks"); merging them keeps the AI's view tight.
  const grouped: ChatMessage[] = []
  for (const msg of trimmedHistory) {
    const last = grouped[grouped.length - 1]
    if (last && last.role === msg.role && last.content && msg.content) {
      last.content = (last.content as string) + "\n" + msg.content
    } else {
      grouped.push({ role: msg.role, content: msg.content })
    }
  }

  // 3) Compose the single-line context header. Empty if no fields.
  const contextBits: string[] = []
  if (input.contextState?.currentTopic) {
    contextBits.push(`current topic: ${input.contextState.currentTopic}`)
  }
  if (input.contextState?.lastUserIntent) {
    contextBits.push(`last user intent: ${input.contextState.lastUserIntent}`)
  }
  if (input.appointmentDraftActive && input.appointmentDraftSummary) {
    contextBits.push(`active appointment draft: ${input.appointmentDraftSummary}`)
  }

  if (contextBits.length > 0) {
    const contextLine = `[context: ${contextBits.join(" | ")}]`
    // We use "user" role here so the line is compatible with
    // providers that treat "system" specially. The [context] prefix
    // makes it clear to the model that this is structural metadata,
    // not a real prior turn.
    grouped.unshift({ role: "user", content: contextLine })
  }

  // 4) Append the current user message last (most recent).
  const userMsg: ChatMessage = {
    role: "user",
    content: input.userMessage.slice(0, AI.maxUserMessageLength),
  }
  grouped.push(userMsg)

  return grouped
}

// === Appointment draft summary ==========================================
//
// One short sentence with REAL values only, e.g.:
//   "name=Akarshit, phone=8700879404, reason="leg pain",
//    date=12 September 2026, time=4:00 PM, awaiting=confirmation".
//
// NEVER emit placeholder tokens like "phone set" / "reason set": the
// model copies them verbatim into user-facing JSON (production
// incident). Unset fields are simply omitted. This line is INTERNAL
// context — the model must still reply in plain human language.

export function summarizeAppointmentDraft(draft: {
  patientName?: string
  patientPhone?: string
  reason?: string
  preferredDate?: string
  preferredTime?: string
  expectedField?: string | null
  status?: string
}): string | null {
  if (
    !draft.patientName &&
    !draft.reason &&
    !draft.preferredDate
  ) {
    return "active (collecting details)"
  }
  const parts: string[] = []
  if (draft.patientName) parts.push(`name=${draft.patientName}`)
  if (draft.patientPhone) parts.push(`phone=${draft.patientPhone}`)
  if (draft.reason) parts.push(`reason="${draft.reason.slice(0, 60)}"`)
  if (draft.preferredDate) parts.push(`date=${draft.preferredDate}`)
  if (draft.preferredTime) parts.push(`time=${draft.preferredTime}`)
  if (draft.status === "ready" || !draft.expectedField) {
    parts.push(`awaiting=confirmation`)
  } else if (draft.expectedField) {
    parts.push(`awaiting=${draft.expectedField}`)
  }
  const s = parts.join(", ")
  if (s.length > APPOINTMENT_DRAFT_MAX_LEN) {
    return s.slice(0, APPOINTMENT_DRAFT_MAX_LEN - 1) + "…"
  }
  return s
}
