/**
 * Route classifier for the receptionist.
 *
 * Decides, for a given incoming message + the current appointment
 * draft (if any), which of these routes to take:
 *
 *   - EMERGENCY              (life-safety override)
 *   - APPOINTMENT_START      (explicit booking intent; activates draft)
 *   - APPOINTMENT_SLOT_ANSWER (active draft + message plausibly
 *                              answers the expected slot)
 *   - APPOINTMENT_INTERRUPTION (active draft + message is a
 *                              non-slot question; preserve draft)
 *   - CANCEL_INTENT          ("I want to cancel my appointment")
 *   - RESCHEDULE_INTENT      ("I need to reschedule")
 *   - CLINIC_INFORMATION     (location, hours, services, contact)
 *   - INSURANCE              (insurance / coverage questions)
 *   - MEDICAL_SYMPTOM        (symptom question — no booking)
 *   - GENERAL                (greetings, FAQ, small talk, fallback)
 *
 * The classifier is deterministic. It is the SINGLE authoritative
 * router. The receptionist, the appointment state machine, and the
 * normal AI flow all defer to it.
 *
 * Symptoms never start an appointment (per the production bug fix).
 * A symptom is a medical concern the patient wants to discuss. It
 * is answered with normal medical-guidance + an offer to book
 * (which the user may accept or decline).
 */

import {
  isAppointmentStart,
  isCancelIntent,
  isRescheduleIntent,
  isEmergencyOverride,
  isFlowCancel,
  nextMissingField,
  type AppointmentDraft,
  type ExpectedField,
} from "./appointment-state"
import { logger } from "@/lib/logger"

export type Route =
  | "EMERGENCY"
  | "APPOINTMENT_START"
  | "APPOINTMENT_SLOT_ANSWER"
  | "APPOINTMENT_INTERRUPTION"
  | "CANCEL_INTENT"
  | "RESCHEDULE_INTENT"
  | "CLINIC_INFORMATION"
  | "INSURANCE"
  | "MEDICAL_SYMPTOM"
  | "OFF_TOPIC"
  | "GENERAL"

export interface RouteDecision {
  route: Route
  /** The slot the active draft is currently asking for, if any. */
  expectedField: ExpectedField
  /**
   * True if the message plausibly answers the expected slot.
   * When true AND the route is APPOINTMENT_SLOT_ANSWER, the
   * receptionist feeds the message to the state machine.
   */
  slotAnswerCandidate: boolean
  /** Human-readable reason for the routing decision. */
  reason: string
}

// === Location / hours / contact patterns ================================
//
// Patterns are built with `new RegExp(...)` rather than regex literals
// to avoid JavaScript's regex-literal lexer mis-parsing nested groups
// that contain forward slashes (which would otherwise terminate the
// literal early).

const LOCATION_PATTERNS: RegExp[] = [
  new RegExp("\\b(where\\s+(is|are)\\s+(you|the\\s+clinic|your\\s+clinic|the\\s+office|your\\s+office))\\b", "i"),
  new RegExp("\\b(what\\s+is\\s+(your|the)\\s+address)\\b", "i"),
  new RegExp("\\b(how\\s+(do\\s+i|can\\s+i|to)\\s+(get|reach|find))\\b.*\\b(there|clinic|office|you)\\b", "i"),
  new RegExp("\\b(your\\s+location|clinic\\s+location|address|located\\s+in|where\\s+to\\s+come|where\\s+are\\s+you\\s+located|where\\s+is\\s+the\\s+clinic\\s+located|find\\s+you|located\\s+at)\\b", "i"),
  new RegExp("\\b(where\\s+are\\s+you|where\\s+is\\s+the\\s+clinic|where\\s+is\\s+your\\s+clinic)\\b", "i"),
  new RegExp("\\b(directions|find\\s+you|nearest\\s+clinic)\\b", "i"),
  new RegExp("\\b(where\\s+(is|are)\\s+.*\\s+located)\\b", "i"),
  new RegExp("\\b(where\\s+are\\s+you|your\\s+address|clinic\\s+address|how\\s+to\\s+reach|how\\s+to\\s+get\\s+there)\\b", "i"),
  new RegExp("\\b(where\\s+are\\s+you\\s+located)\\b", "i"),
]

const HOURS_PATTERNS: RegExp[] = [
  new RegExp("\\b(what\\s+time|what\\s+are\\s+(your|the)\\s+(hours|timings|opening\\s+hours|business\\s+hours)|when\\s+(do\\s+you|are\\s+you)\\s+open|when\\s+do\\s+you\\s+close|are\\s+you\\s+open|opening\\s+times|business\\s+hours)\\b", "i"),
  new RegExp("\\b(do\\s+you\\s+work|are\\s+you\\s+working|open\\s+(today|tomorrow|sunday|monday|on\\s+(sunday|monday)))\\b", "i"),
  new RegExp("\\b(clinic\\s+hours|office\\s+hours|working\\s+hours|when\\s+are\\s+you\\s+open)\\b", "i"),
]

const CONTACT_PATTERNS: RegExp[] = [
  new RegExp("\\b(how\\s+(do\\s+i|can\\s+i|to)\\s+(contact|reach|call|email))\\b", "i"),
  new RegExp("\\b(your\\s+phone|phone\\s+number|contact\\s+(you|the\\s+clinic)|contact\\s+number|email\\s+address|how\\s+to\\s+reach\\s+you)\\b", "i"),
]

const SERVICES_PATTERNS: RegExp[] = [
  new RegExp("\\b(what\\s+services|what\\s+do\\s+you\\s+(do|offer|provide)|services\\s+(you\\s+)?(offer|provide)|list\\s+of\\s+services|do\\s+you\\s+(do|offer|provide))\\b", "i"),
  new RegExp("\\b(do\\s+you\\s+(have|offer|provide)\\s+(cleaning|whitening|fillings|extraction|root\\s+canal|implant|braces|check-?up|checkup))\\b", "i"),
  new RegExp("\\b(what\\s+kinds?\\s+of\\s+(treatment|services|procedures)|available\\s+(treatments|services|procedures))\\b", "i"),
]

const INSURANCE_PATTERNS: RegExp[] = [
  new RegExp("\\b(insurance|insured|coverage|covered|copay|co-?pay|deductible)\\b", "i"),
  new RegExp("\\b(do\\s+you\\s+(accept|take)\\s+(insurance|my\\s+insurance|insurance\\s+plan))\\b", "i"),
  new RegExp("\\b(what\\s+insurance|which\\s+insurance\\s+(do\\s+you|plans))\\b", "i"),
  new RegExp("\\b(in-?network|out-?of-?network)\\b", "i"),
  new RegExp("\\b(delta\\s+dental|cigna|aetna|metlife|united\\s+healthcare|blue\\s*cross|blue\\s*shield)\\b", "i"),
]

// === Symptom patterns ====================================================
//
// Symptoms NEVER start a booking. A symptom is a medical concern.
// We answer it normally and offer to book if appropriate.

const SYMPTOM_PATTERNS: RegExp[] = [
  new RegExp("\\b(i\\s+have|i've\\s+got|i\\s+am\\s+having|i\\s+am\\s+feeling|i'm\\s+having|i'm\\s+feeling)\\s+(a\\s+)?(headache|toothache|tooth\\s+pain|head\\s+ache|migraine|backache|stomachache|back\\s+pain|neck\\s+pain|jaw\\s+pain|ear\\s+pain)\\b", "i"),
  new RegExp("\\b(my\\s+(head|tooth|teeth|gum|gums|jaw|back|ear|throat|stomach|neck)\\s+(hurts?|ache|aches|pain))\\b", "i"),
  new RegExp("\\b(i\\s+have\\s+(a\\s+)?([a-z]+\\s+)?(pain|ache|sore|swelling|fever|cough|cold|flu|nausea))\\b", "i"),
  new RegExp("\\b(pain\\s+in\\s+(my\\s+)?(back|head|tooth|teeth|gum|gums|jaw|ear|throat|neck|stomach))\\b", "i"),
  new RegExp("\\b(i\\s+am\\s+feeling\\s+(sick|unwell|ill|nauseous|dizzy))\\b", "i"),
  new RegExp("\\b(my\\s+(gums|tooth|teeth)\\s+(are|is)\\s+(bleeding|swollen|hurting))\\b", "i"),
  new RegExp("\\b(what\\s+(should\\s+i\\s+do|can\\s+i\\s+do|to\\s+do)\\s+(for|about)\\s+(a|my)\\s+(headache|toothache|pain|ache|fever|cold|back\\s+pain))\\b", "i"),
  new RegExp("\\b(i\\s+have\\s+swelling|i\\s+have\\s+bleeding|i\\s+have\\s+a\\s+problem\\s+with\\s+my\\s+teeth)\\b", "i"),
  new RegExp("\\b(do\\s+you\\s+treat|can\\s+you\\s+treat)\\b", "i"),
  new RegExp("\\b(i\\s+have\\s+(a\\s+)?problem\\s+with\\s+my\\s+teeth)\\b", "i"),
  new RegExp("\\b(my\\s+teeth\\s+(are|is)\\s+hurting|my\\s+tooth\\s+is\\s+hurting\\s+badly)\\b", "i"),
]

// === Greeting / general small talk =======================================

const GREETING_PATTERNS: RegExp[] = [
  /^(hi|hello|hey|hola|namaste|good\s+(morning|afternoon|evening)|greetings|howdy|yo)\b/i,
  /^(thanks|thank\s+you|appreciate|grateful|ty|thx)\b/i,
  /^(bye|goodbye|see\s+you|good\s+night|talk\s+to\s+you\s+later|have\s+a\s+great\s+day|talk\s+later|cya)\b/i,
  /^(ok|okay|sure|alright|fine|cool|great|awesome|got\s+it)\b/i,
]

// OFF_TOPIC patterns — must be checked AFTER appointment/emergency
// routes but BEFORE GENERAL fallback. These mirror the guardrails
// OFF_TOPIC_PATTERNS but can be more context-aware since we have
// the full classifier here.
const OFF_TOPIC_PATTERNS: RegExp[] = [
  // Coding / programming
  /\b(write|create|generate|code|program|script|function|algorithm)\s+(code|program|script|function|algorithm|a\s+\w+\s+(in|for|using)\s+\w+)/i,
  /\b(teach|show|explain)\s+me\s+(how\s+to\s+)?(code|program|script|javascript|python|java|c\+\+|c#|ruby|go|rust|php|sql|html|css|react|vue|angular|node|express|django|flask|spring)/i,
  /\b(how\s+do\s+I|how\s+to)\s+(write|code|create|build|make)\s+(a\s+)?(program|script|function|app|website|api|component)/i,
  /\b(python|javascript|java|c\+\+|c#|ruby|go|rust|php|sql|html|css|react|vue|angular|node|express|django|flask|spring)\s+(code|program|script|tutorial|example)/i,
  /\b(for\s+loop|while\s+loop|if\s+statement|async|await|promise|callback|regex|api|endpoint|database|query|sql)\b/i,

  // Prompt injection / role override
  /\b(ignore|forget|disregard|override)\s+(previous|all|your)\s+(instructions|prompts|rules|directives)/i,
  /\b(you\s+are\s+now|act\s+as|pretend\s+to\s+be|roleplay\s+as|simulate\s+being)\s+(a\s+)?(programmer|coder|developer|software\s+engineer|assistant|ai|bot)/i,
  /\b(new\s+(instructions|rules|role|prompt):|system\s+prompt:)/i,
  /\b(stop\s+being|forget\s+you\s+are|no\s+longer\s+a)\s+(receptionist|clinot)/i,

  // System prompt / architecture extraction
  /\b(what\s+(is|are)\s+your\s+(system\s+)?(prompt|instructions|initial\s+instructions))\b/i,
  /\b(show|print|display|output|reveal|tell\s+me)\s+(your\s+)?(system\s+)?(prompt|instructions|message)\b/i,
  /\b(what\s+(model|llm|architecture)\s+(are\s+you|powers\s+you|do\s+you\s+use))\b/i,
  /\b(are\s+you\s+(gpt|claude|gemini|llama|mistral))\b/i,
  /\b(who\s+(created|made|trained)\s+you)\b/i,
  /\b(what\s+is\s+your\s+(training\s+data|knowledge\s+cutoff))\b/i,

  // Essay / general writing
  /\b(write|compose|create|generate)\s+(an?\s+)?(essay|story|article|email|letter|cover\s+letter|summary|poem|blog\s+post)/i,
  /\b(summarize|explain)\s+(the\s+)?(book|movie|article|paper|concept|theory)\b/i,
  /\b(quantum\s+physics|climate\s+change|relativity|evolution)\b/i,

  // Paraphrased coding requests
  /\b(can\s+you\s+help\s+me\s+with\s+(some\s+)?code)\b/i,
  /\b(i\s+need\s+help\s+(writing|with)\s+(a\s+)?(script|program|code))\b/i,
  /\b(give\s+me\s+(some\s+)?code\s+(for|to))\b/i,
]

const THANKS_PATTERNS: RegExp[] = [
  /\b(thanks|thank\s+you|appreciate|grateful)\b/i,
]

const BYE_PATTERNS: RegExp[] = [
  /^(bye|goodbye|see\s+you|talk\s+later|good\s+night)\b/i,
]

// === Public API ==========================================================

export function classifyRoute(
  message: string,
  draft: AppointmentDraft | null,
): RouteDecision {
  const text = message.trim()

  // LEVEL 1: Emergency always wins.
  if (isEmergencyOverride(text)) {
    return {
      route: "EMERGENCY",
      expectedField: draft?.expectedField ?? null,
      slotAnswerCandidate: false,
      reason: "emergency_keyword_match",
    }
  }

  // LEVEL 2: Explicit flow cancellation ("never mind", etc.). If
  // there is an active draft, the receptionist will clear it and
  // route the message to normal handling.
  if (isFlowCancel(text)) {
    return {
      route: "GENERAL",
      expectedField: draft?.expectedField ?? null,
      slotAnswerCandidate: false,
      reason: "flow_cancel",
    }
  }

  // LEVEL 3: Cancellation / rescheduling of an existing appointment.
  // These do NOT start a new draft.
  if (isCancelIntent(text) && !isAppointmentStart(text)) {
    return {
      route: "CANCEL_INTENT",
      expectedField: draft?.expectedField ?? null,
      slotAnswerCandidate: false,
      reason: "cancel_intent_keyword",
    }
  }
  if (isRescheduleIntent(text) && !isAppointmentStart(text)) {
    return {
      route: "RESCHEDULE_INTENT",
      expectedField: draft?.expectedField ?? null,
      slotAnswerCandidate: false,
      reason: "reschedule_intent_keyword",
    }
  }

  // LEVEL 4: If a draft is active, decide whether the current
  // message is a slot answer or an interruption. This is the
  // critical branch the production bug violated: previously,
  // EVERY message was treated as a slot answer.
  if (draft && draft.active) {
    const expected = draft.expectedField ?? nextMissingField(draft)
    const looksLikeSlotAnswer = isSlotAnswerFor(text, expected, draft)

    if (looksLikeSlotAnswer) {
      return {
        route: "APPOINTMENT_SLOT_ANSWER",
        expectedField: expected,
        slotAnswerCandidate: true,
        reason: `matches_expected_field_${expected ?? "unknown"}`,
      }
    }

    // Active draft, but the message is NOT a slot answer. This is
    // an interruption. We classify what kind of interruption so
    // the receptionist can answer appropriately.
    const interruption = classifyInterruption(text)
    if (interruption) {
      return {
        route: interruption,
        expectedField: expected,
        slotAnswerCandidate: false,
        reason: "interruption_while_draft_active",
      }
    }

    // Could not classify. Conservative: treat as an interruption
    // (preserve draft) and let the AI handle it. The AI may ask
    // for clarification, but the draft survives.
    return {
      route: "APPOINTMENT_INTERRUPTION",
      expectedField: expected,
      slotAnswerCandidate: false,
      reason: "unclassified_while_draft_active",
    }
  }

  // LEVEL 5: No active draft. Decide the route from the message
  // alone.
  if (isAppointmentStart(text)) {
    return {
      route: "APPOINTMENT_START",
      expectedField: null,
      slotAnswerCandidate: false,
      reason: "explicit_appointment_intent",
    }
  }

  if (matchesAny(LOCATION_PATTERNS, text) || matchesAny(HOURS_PATTERNS, text) || matchesAny(CONTACT_PATTERNS, text) || matchesAny(SERVICES_PATTERNS, text)) {
    return {
      route: "CLINIC_INFORMATION",
      expectedField: null,
      slotAnswerCandidate: false,
      reason: "clinic_information_keyword",
    }
  }

  if (matchesAny(INSURANCE_PATTERNS, text)) {
    return {
      route: "INSURANCE",
      expectedField: null,
      slotAnswerCandidate: false,
      reason: "insurance_keyword",
    }
  }

  if (matchesAny(SYMPTOM_PATTERNS, text)) {
    return {
      route: "MEDICAL_SYMPTOM",
      expectedField: null,
      slotAnswerCandidate: false,
      reason: "symptom_keyword",
    }
  }

  if (matchesAny(GREETING_PATTERNS, text)) {
    return {
      route: "GENERAL",
      expectedField: null,
      slotAnswerCandidate: false,
      reason: "greeting_keyword",
    }
  }

  if (matchesAny(THANKS_PATTERNS, text) || matchesAny(BYE_PATTERNS, text)) {
    return {
      route: "GENERAL",
      expectedField: null,
      slotAnswerCandidate: false,
      reason: "smalltalk_keyword",
    }
  }

  // LEVEL 5b: Off-topic detection — checked after all clinic-related
  // routes but before GENERAL fallback. This ensures appointment,
  // clinic info, insurance, symptoms, greetings all pass through,
  // while coding/essays/injection/extraction are caught.
  if (matchesAny(OFF_TOPIC_PATTERNS, text)) {
    return {
      route: "OFF_TOPIC",
      expectedField: null,
      slotAnswerCandidate: false,
      reason: "off_topic_keyword",
    }
  }

  return {
    route: "GENERAL",
    expectedField: null,
    slotAnswerCandidate: false,
    reason: "default",
  }
}

function classifyInterruption(text: string): Route | null {
  if (matchesAny(LOCATION_PATTERNS, text) || matchesAny(CONTACT_PATTERNS, text) || matchesAny(SERVICES_PATTERNS, text) || matchesAny(HOURS_PATTERNS, text)) {
    return "CLINIC_INFORMATION"
  }
  if (matchesAny(INSURANCE_PATTERNS, text)) {
    return "INSURANCE"
  }
  if (matchesAny(SYMPTOM_PATTERNS, text)) {
    return "MEDICAL_SYMPTOM"
  }
  return null
}

function matchesAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((re) => re.test(text))
}

/**
 * Decide if a message plausibly answers the currently expected
 * appointment slot.
 *
 * Rules:
 *   - expectedField=null (no draft) → false
 *   - expectedField=name → looks like a name (2+ words of letters,
 *     or a name + "my name is ..." / "i'm ..." / etc.)
 *   - expectedField=phone → looks like a phone number, OR
 *     "my number is ..." / "phone is ..."
 *   - expectedField=reason → anything that is NOT a date/time and
 *     that contains at least one non-trivial word
 *   - expectedField=date → looks like a date
 *   - expectedField=time → looks like a time
 *
 * Conservative: when in doubt, return false (route as interruption).
 */
export function isSlotAnswerFor(
  message: string,
  expectedField: ExpectedField,
  draft: AppointmentDraft,
): boolean {
  if (!expectedField) return false
  const text = message.trim()
  if (!text) return false

  const segments = /[\r\n,;]/.test(text)
    ? text.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean)
    : [text]

  switch (expectedField) {
    case "name":
      return looksLikeNameAnswer(text) || segments.some((seg) => looksLikeNameAnswer(seg))
    case "phone":
      return looksLikePhoneAnswer(text) || segments.some((seg) => looksLikePhoneAnswer(seg))
    case "reason":
      // Reason is intentionally permissive — anything that doesn't
      // look like a date/time/phone/location and is at least a few
      // words can be a reason.
      return looksLikeReasonAnswer(text) || segments.some((seg) => looksLikeReasonAnswer(seg))
    case "date":
      return hasDateIntent(text) || segments.some((seg) => hasDateIntent(seg))
    case "time":
      return hasTimeIntent(text) || segments.some((seg) => hasTimeIntent(seg))
    default:
      return false
  }
}

function looksLikeNameAnswer(text: string): boolean {
  const lower = text.toLowerCase()
  // Explicit "my name is ..." / "I'm ..." / "this is ..." /
  // "call me ..." / "actually my name is ...". These are strong
  // signals that the user is providing or correcting their name.
  if (/\b(my\s+name\s+is|i\s+am|i'm|this\s+is|call\s+me|it's|its|actually\s+my\s+name\s+is|i'm\s+called|my\s+name's)\b/i.test(lower)) {
    return true
  }
  // Otherwise: must look like a name (no digits, no question marks,
  // 1-5 words starting with letters). This is the same shape as
  // extractName in appointment-state.ts.
  if (/[?]/.test(text)) return false
  if (/\d/.test(text)) return false
  const words = text.split(/\s+/)
  if (words.length < 1 || words.length > 5) return false
  if (!words.every((w) => /^[A-Za-z][A-Za-z'\-.]{1,30}$/.test(w))) return false
  if (!words.some((w) => w.length >= 2)) return false
  // Reject the message outright if it contains a question word
  // or other non-name vocabulary. This prevents
  // "where are you located", "what is your address",
  // "how do I reach the clinic" from being misclassified as
  // a name answer.
  const nonNameWords = [
    "what", "where", "when", "how", "is", "are", "do", "does", "did",
    "can", "could", "would", "will", "shall", "may", "might", "must",
    "should", "the", "a", "an", "my", "for", "with", "to", "of", "in",
    "i", "you", "we", "it", "they", "he", "she", "me", "us",
    "tomorrow", "today", "yesterday", "morning", "afternoon", "evening",
    "pain", "hurt", "sore", "ache", "fever", "headache", "toothache",
    "phone", "number", "address", "clinic", "doctor", "dentist",
    "located", "directions", "open", "hours", "timings", "insurance",
    "appointment", "booking", "visit", "consultation", "checkup",
  ]
  // Strip the "is"/"am" out of the explicit phrase "my name is" /
  // "I am ...": these are sentence verbs, not question words. The
  // "name" word is allowed as part of the "my name is" pattern.
  const stripped = lower
    .replace(/\bmy\s+name\s+is\b/g, "mynameis")
    .replace(/\bactually\s+my\s+name\s+is\b/g, "actuallymynameis")
    .replace(/\bi\s+am\b/g, "iam")
    .replace(/\bi'm\b/g, "im")
    .replace(/\bthis\s+is\b/g, "thisis")
    .replace(/\bit's\b/g, "its")
    .replace(/\bits\b/g, "its")
    .replace(/\bcall\s+me\b/g, "callme")
    .replace(/\bmy\s+name's\b/g, "mynames")
  const words2 = stripped.split(/\s+/).filter(Boolean)
  if (words2.some((w) => nonNameWords.includes(w))) return false
  return true
}

function looksLikePhoneAnswer(text: string): boolean {
  const lower = text.toLowerCase()
  if (/\b(my\s+(phone|number|cell|mobile)\s+is|phone\s+is|call\s+(me|at)|reach\s+me\s+at)\b/i.test(lower)) {
    return true
  }
  // Direct digit-only or near-digit answer.
  const digits = text.replace(/[^\d]/g, "")
  if (digits.length >= 7 && digits.length <= 15) {
    const nonPhone = text.replace(/[+\d\s\-().]/g, "").trim()
    if (nonPhone.length <= 2) return true
  }
  return false
}

function looksLikeReasonAnswer(text: string): boolean {
  const lower = text.toLowerCase()
  // Explicit "I have ..." / "for ..." starters are strong reason
  // signals. Anything longer than a few words that is NOT a date,
  // time, phone, or location question is a reason candidate.
  if (/\b(i\s+have|i've|i\s+am|i'm|it's|for|because|since|due\s+to)\b/i.test(lower)) {
    return true
  }
  // Must contain at least one non-trivial word and not be a question
  // about location/hours/insurance.
  if (text.split(/\s+/).length < 2) return false
  if (/[?]/.test(text)) return false
  // If it looks like a date or time, it's not a reason.
  if (hasDateIntent(text) || hasTimeIntent(text)) return false
  // If it looks like a clinic-information question, it's not a reason.
  if (matchesAny(LOCATION_PATTERNS, text) || matchesAny(HOURS_PATTERNS, text) || matchesAny(CONTACT_PATTERNS, text) || matchesAny(INSURANCE_PATTERNS, text)) {
    return false
  }
  return true
}

function hasDateIntent(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    /\btoday\b/.test(lower) ||
    /\btomorrow\b/.test(lower) ||
    /\bday\s+after\s+tomorrow\b/.test(lower) ||
    /\b(next|this|on)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(lower) ||
    /\b\d{1,2}[\/\-]\d{1,2}\b/.test(lower) ||
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i.test(lower)
  )
}

function hasTimeIntent(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    /\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)\b/i.test(lower) ||
    /\b([01]?\d|2[0-3]):[0-5]\d\b/.test(lower) ||
    /\b(half\s+past|quarter\s+(past|to))\s+\d{1,2}\b/.test(lower) ||
    /\b(morning|afternoon|evening|noon|midnight)\b/.test(lower)
  )
}

// === Logging helper =====================================================

export function logRouteDecision(decision: RouteDecision, conversationId: string, clinicId: string): void {
  logger.info("[CLINOT_AI_TRACE]", {
    stage: "router",
    conversationId,
    clinicId,
    route: decision.route,
    expectedField: decision.expectedField,
    slotAnswerCandidate: decision.slotAnswerCandidate,
    reason: decision.reason,
  })
}
