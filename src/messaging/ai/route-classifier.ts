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
  isNewAppointmentRequest,
  isControlMessage,
  looksLikeAppointmentBundle,
  nextMissingField,
  extractPhone,
  type AppointmentDraft,
  type ExpectedField,
} from "./appointment-state"
import { logger } from "@/lib/logger"
import {
  isClinotAllowedText,
  fuzzyHealthSignal,
  type TypoHealthSignal,
} from "@/lib/ai/clinot-domain"

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
  /**
   * Present when the route came from the typo-tolerant health
   * matcher — lets the receptionist log WHY (token, vocabulary
   * word, distance, confidence) without touching message content.
   */
  typoMatch?: TypoHealthSignal
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

  // Empty messages keep the historical GENERAL route (the guardrail
  // layer owns empty-input handling via "invalid").
  if (!text) {
    return {
      route: "GENERAL",
      expectedField: draft?.expectedField ?? null,
      slotAnswerCandidate: false,
      reason: "empty_message",
    }
  }

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
    // A new-appointment request always wins over the active draft:
    // "I want another appointment" starts a FRESH draft instead of
    // being parsed as a slot value for the old one.
    if (isNewAppointmentRequest(text)) {
      return {
        route: "APPOINTMENT_START",
        expectedField: expected,
        slotAnswerCandidate: false,
        reason: "new_appointment_request",
      }
    }
    let looksLikeSlotAnswer = isSlotAnswerFor(text, expected, draft)

    // Contextual multi-field or explicit appointment field provision:
    // If the message carries unambiguous date, time, or phone while a draft is active,
    // and is not a clinic question/interruption, treat it as a slot answer so the draft absorbs it.
    if (!looksLikeSlotAnswer && !classifyInterruption(text)) {
      if (hasDateIntent(text) || hasTimeIntent(text) || Boolean(extractPhone(text))) {
        looksLikeSlotAnswer = true
      }
    }

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

    // STRICT ALLOWLIST during drafts: an unrelated message must NOT
    // become an AI interruption. It is OUTSIDE the Clinot domain —
    // deterministic redirect, draft preserved, provider never called.
    // Light allowed conversation ("ok", thanks) still falls through
    // to the AI interruption path with the draft intact.
    if (!isClinotAllowedText(text)) {
      return {
        route: "OFF_TOPIC",
        expectedField: expected,
        slotAnswerCandidate: false,
        reason: "outside_clinot_domain",
      }
    }

    // Allowed but unclassified while a draft is active: treat as an
    // interruption (preserve draft) and let the AI handle it. The AI
    // may ask for clarification, but the draft survives.
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

  // Structured appointment bundle without a draft (name + phone +
  // reason + date + time in one message): enter the appointment flow
  // with all fields extracted — never the generic fallback.
  if (looksLikeAppointmentBundle(text)) {
    return {
      route: "APPOINTMENT_START",
      expectedField: null,
      slotAnswerCandidate: false,
      reason: "appointment_bundle",
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

  // Typo-tolerant clinical intent ("i have headche"): the deterministic
  // fuzzy matcher found a symptom/body token with symptom framing.
  // Routes into the EXISTING medical-safety pipeline — no diagnosis
  // happens here. Detail rides along for observability.
  const typoSignal = fuzzyHealthSignal(text)
  if (typoSignal.matched) {
    return {
      route: "MEDICAL_SYMPTOM",
      expectedField: null,
      slotAnswerCandidate: false,
      reason: "symptom_typo_tolerant_match",
      typoMatch: typoSignal,
    }
  }

  // LEVEL 5b: STRICT POSITIVE ALLOWLIST — checked after all
  // explicitly allowed clinic routes but before GENERAL. Anything
  // that does not belong to Clinot's product universe is OUTSIDE:
  // deterministic redirect, provider never called. Unknown
  // paraphrases fail CLOSED (denied by default).
  if (!isClinotAllowedText(text)) {
    return {
      route: "OFF_TOPIC",
      expectedField: null,
      slotAnswerCandidate: false,
      reason: "outside_clinot_domain",
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
  // Typo-tolerant health side question during a draft ("i have
  // heache"): answered via the safe health pipeline with the draft
  // preserved — never mistaken for a slot answer or outside-domain.
  if (fuzzyHealthSignal(text).matched) {
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
  // ARCHITECTURAL GUARANTEE: control commands are never slot answers.
  // "Confirm" / "Book" / "Done" / "yes" can never become name, phone,
  // reason, date, or time.
  if (isControlMessage(text)) return false

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
  // Control commands are never names — checked first so "Confirm",
  // "Book this", "Done" can never pass the shape checks below.
  if (isControlMessage(text)) return false
  if (/\b(book|books|booking|confirm|confirmed|confirming|done|proceed|proceeding|continue|submit|finalize|cancel|cancelling|another|change)\b/i.test(lower)) {
    return false
  }
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
    "have", "has", "had", "am",
    "tomorrow", "today", "yesterday", "morning", "afternoon", "evening",
    "pain", "hurt", "sore", "ache", "fever", "headache", "toothache",
    "phone", "number", "address", "clinic", "doctor", "dentist",
    "located", "directions", "open", "hours", "timings", "insurance",
    "appointment", "booking", "visit", "consultation", "checkup",
    "book", "confirm", "confirmed", "done", "yes", "yeah", "yep",
    "ok", "okay", "sure", "proceed", "continue", "submit", "finalize",
    "cancel", "another", "new", "change",
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
  const lower = text.toLowerCase().trim()
  // Control commands are never reasons ("Book" is not a reason).
  if (isControlMessage(text)) return false
  // A pure identity/phone provision is not a reason ("My name is
  // Rahul", "my number is ..."). Strip those clauses: only the
  // REMAINDER can be reason evidence.
  const remainder = lower
    .replace(/\b(actually\s+)?my\s+name\s+is\s+[a-z][a-z'\-.]{1,30}(\s+[a-z][a-z'\-.]{1,30}){0,3}/i, " ")
    .replace(/\b(my\s+(phone|number|cell|mobile)\s+is|phone\s+is)\s*[+\d][\d\s\-().]{5,20}/i, " ")
    .replace(/^[,\s.]+/, "")
    .trim()
  if (!remainder) return false
  // Explicit "I have ..." / "for ..." starters are strong reason
  // signals.
  if (/\b(i\s+have|i've|i\s+am|i'm|it's|for|because|since|due\s+to)\b/i.test(lower)) {
    return true
  }
  // Must contain at least two characters, no question marks, and not be a question word.
  if (lower.length < 2) return false
  if (/[?]/.test(text)) return false
  if (/^(what|where|when|how|who|is|are|do|does|can|could|why)\b/i.test(lower)) return false
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
