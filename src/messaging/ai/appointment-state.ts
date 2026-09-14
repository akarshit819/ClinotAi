/**
 * Appointment state machine.
 *
 * Persisted as a JSON blob inside Conversation.metadata (the column
 * already exists in the schema). The state machine is deterministic
 * (no LLM call required to advance a turn) and is the SINGLE owner
 * of `Conversation.metadata.appointmentDraft`. No other code path
 * writes that field.
 *
 * CRITICAL PRODUCT CONTRACT (per the production bug audit):
 *
 *   Symptoms NEVER activate a draft. Only EXPLICIT booking intent
 *   activates. After activation, the state machine distinguishes
 *   "slot answer" from "interruption" via the route classifier in
 *   `./route-classifier.ts` — this module only handles the slot-
 *   answer branch.
 *
 *   When the receptionist detects an interruption (clinic question,
 *   symptom question, insurance question, etc.) while a draft is
 *   active, the draft is preserved unchanged. The expectedField
 *   field on the draft tells the receptionist which slot to resume
 *   on the next user message.
 *
 * Slot order (cannot be skipped):
 *   name → phone → reason → date → time
 *
 *   The "phone" slot is normally auto-filled from the WhatsApp
 *   sender the first time the draft is activated. The user is only
 *   asked for a phone if the WhatsApp sender did not provide one.
 */

import type { Intent } from "../types"
import { fuzzyHealthSignal } from "@/lib/ai/clinot-domain"

// === Activation triggers (EXPLICIT only) ===================================
// Symptoms are NOT in this list. "I have a headache" never starts
// a booking. The user must say "I want to book an appointment" or
// equivalent.
const APPOINTMENT_START_PATTERNS: RegExp[] = [
  // "I want to book an appointment" / "I need to schedule a visit"
  new RegExp("\\b(i\\s+want|i\\s+need|i\\s+'?d\\s+like|want\\s+to|need\\s+to|let'?s|can\\s+i|could\\s+i|may\\s+i|please|plz)\\s+(to\\s+)?(book|schedule|make(?:\\s+an)?|set(?:\\s+up)?|get)\\b.*\\b(appointment|booking|visit|consult|consultation|checkup|session|slot)\\b", "i"),
  // "I need an appointment" / "I need a visit"
  new RegExp("\\b(i\\s+need|i\\s+want|i\\s+'?d\\s+like|need|want)\\s+(a|an|the)\\s+(appointment|visit|consult|consultation|checkup)\\b", "i"),
  // "I need to come to the clinic" / "I want to see the doctor"
  new RegExp("\\b(i\\s+need|i\\s+want|i\\s+'?d\\s+like|need|want)\\s+to\\s+(come|see|visit|meet)\\b", "i"),
  // "book an appointment" / "schedule a visit"
  new RegExp("\\b(book|schedule|make(?:\\s+an)?|set\\s+up)\\b.*\\b(appointment|booking|visit|consult|consultation|checkup|session|slot)\\b", "i"),
  // "appointment please" / "appointment now"
  new RegExp("\\b(appointment|booking|visit|consult|consultation|checkup)\\b.*\\b(please|plz|now|today|tomorrow|book|schedule)\\b", "i"),
  // "can I book an appointment?"
  new RegExp("^(can\\s+i|may\\s+i|could\\s+i|do\\s+you\\s+do)\\b.*\\b(appointment|booking|visit|consult|consultation)\\b", "i"),
  // "see a doctor" / "meet the dentist"
  new RegExp("\\b(see|meet|visit)\\b.*\\b(doctor|dentist|practitioner|specialist)\\b", "i"),
  // "schedule me tomorrow" / "book me for tomorrow" / "make me an
  // appointment"
  new RegExp("\\b(make\\s+me|book\\s+me|schedule\\s+me|fit\\s+me\\s+in)\\b.*\\b(an?\\s+)?(appointment|slot|visit|next\\s+week|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b", "i"),
]

export function isAppointmentStart(message: string): boolean {
  const lower = message.toLowerCase().trim()
  if (!lower) return false
  if (lower.length < 4) return false

  // Direct check against patterns
  if (APPOINTMENT_START_PATTERNS.some((re) => re.test(lower))) return true

  // Normalization for common typos & informal variants:
  // "vant" -> "want", "wanna" -> "want to", "app" / "appt" -> "appointment"
  const normalized = lower
    .replace(/\bvant\b/g, "want")
    .replace(/\bwanna\b/g, "want to")
    .replace(/\b(app|appt)\b/g, "appointment")

  if (APPOINTMENT_START_PATTERNS.some((re) => re.test(normalized))) return true

  // Hinglish and informal booking intents:
  // "appointment book krna hai", "appointment chahiye", "mujhe appointment chahiye"
  if (/\b(appointment|booking|slot|doctor)\b.*\b(book|schedule|krna|karna|chahiye|lena|karana|karwana)\b/i.test(lower)) return true
  if (/\b(mujhe|hume|humko)\b.*\b(appointment|booking|doctor)\b/i.test(lower)) return true
  if (/\b(appointment\s+chahiye|slot\s+chahiye|doctor\s+chahiye)\b/i.test(lower)) return true
  if (/\b(book|schedule)\s+(appointment|slot|booking)\b/i.test(normalized)) return true
  if (/\b(want|need)\s+to\s+book\b/i.test(normalized)) return true
  if (/\b(want|need)\s+(an?\s+)?appointment\b/i.test(normalized)) return true

  // "another appointment" / "new appointment" / "one more appointment":
  // the user explicitly wants (another) booking, with or without a verb.
  // Previously these fell through to the generic AI flow and the next
  // structured message had no draft — the "generic fallback" incident.
  if (isNewAppointmentRequest(lower)) return true

  return false
}

// === Cancellation / rescheduling ==========================================
// These do NOT start a new draft. They are routed to the normal
// receptionist flow so the existing booking (if any) can be
// cancelled or rescheduled through the standard clinic tooling.
const CANCEL_PATTERNS: RegExp[] = [
  /\b(cancel|cancellation|cancelled|cancelling)\b.*\b(appointment|booking|visit)\b/i,
  /\b(cancel|cancellation|cancelled|cancelling)\b/i,
]
const RESCHEDULE_PATTERNS: RegExp[] = [
  new RegExp("\\b(i\\s+need\\s+to\\s+reschedule|i\\s+want\\s+to\\s+reschedule)\\b", "i"),
  new RegExp("\\b(reschedule|re-?schedule)\\b.*\\b(appointment|booking|visit|my)\\b", "i"),
  new RegExp("\\b(change\\s+my|change\\s+the|move\\s+my|move\\s+the)\\b.*\\b(appointment|booking|visit)\\b", "i"),
  new RegExp("\\b(can\\s+i\\s+(move|change|reschedule|re-?schedule))\\b.*\\b(appointment|booking|visit|my)\\b", "i"),
  new RegExp("\\b(reschedule|re-?schedule)\\b.*\\b(my|the)\\b.*\\b(appointment|booking|visit)\\b", "i"),
]

export function isCancelIntent(message: string): boolean {
  const lower = message.toLowerCase().trim()
  return CANCEL_PATTERNS.some((re) => re.test(lower))
}

export function isRescheduleIntent(message: string): boolean {
  const lower = message.toLowerCase().trim()
  return RESCHEDULE_PATTERNS.some((re) => re.test(lower))
}

// === Emergency override ==================================================
// These keywords indicate a life-threatening situation. They take
// priority over EVERYTHING else, even an in-progress appointment.
const EMERGENCY_OVERRIDE_KEYWORDS = [
  "emergency", "urgent care", "can't breathe", "difficulty breathing",
  "bleeding heavily", "unconscious", "heart attack", "stroke", "chest pain",
  "severe bleeding", "anaphylaxis", "overdose", "suicide", "self harm",
  "not breathing", "passed out",
]

export function isEmergencyOverride(message: string): boolean {
  const lower = message.toLowerCase()
  return EMERGENCY_OVERRIDE_KEYWORDS.some((kw) => lower.includes(kw))
}

// === Explicit "I changed my mind" cancellation of the booking flow ====

const FLOW_CANCEL_PATTERNS = [
  /^(never\s*mind|forget\s+it|forget\s+that|nvm|stop|cancel)$/i,
  /^(don'?t\s+book|nevermind|please\s+stop)$/i,
]

export function isFlowCancel(message: string): boolean {
  const lower = message.toLowerCase().trim()
  return FLOW_CANCEL_PATTERNS.some((re) => re.test(lower))
}

// === Draft schema =========================================================

export type ExpectedField = "name" | "phone" | "reason" | "date" | "time" | null

export type AppointmentDraft = {
  active: boolean
  status: "collecting" | "ready" | "booking" | "completed" | "cancelled"
  expectedField: ExpectedField
  activatedAt?: string
  updatedAt?: string
  patientName?: string
  patientPhone?: string
  reason?: string
  preferredDate?: string // YYYY-MM-DD
  preferredTime?: string // HH:MM 24h
  providerId?: string
  providerName?: string
  history: Array<{ field: string; value: string; source: "user" | "whatsapp" | "auto" | "user_correction" }>
  clearedReason?: string
}

export const EMPTY_DRAFT: AppointmentDraft = {
  active: false,
  status: "collecting",
  expectedField: null,
  history: [],
}

// === Public API ==========================================================

/**
 * Pure function. Decide what to do with one incoming message given
 * the current draft. Returns the updated draft, the next prompt to
 * send (if the receptionist should respond deterministically), and
 * a "complete" flag.
 *
 * IMPORTANT: this function does NOT activate a draft. Activation
 * is the route classifier's job (route-classifier.ts). The state
 * machine is invoked only AFTER the route classifier has decided
 * the message is a slot answer for the active draft.
 *
 * If the message cannot plausibly answer the currently expected
 * field, the state machine should NOT be called — the route
 * classifier routes the message to the normal receptionist and
 * the draft is preserved unchanged.
 */
export function processSlotAnswer(
  existingDraft: AppointmentDraft,
  message: string,
  whatsappFrom: { id: string; phone?: string; name?: string },
  now: Date = new Date(),
): {
  draft: AppointmentDraft
  nextPrompt: string | null
  isComplete: boolean
} {
  // Defensive: only process if the draft is active. The caller
  // (receptionist) is responsible for the activation decision.
  if (!existingDraft.active) {
    return {
      draft: existingDraft,
      nextPrompt: null,
      isComplete: false,
    }
  }

  const draft: AppointmentDraft = {
    ...existingDraft,
    history: [...existingDraft.history],
  }

  const extracted = extractAllFields(message, now)

  // Always apply extracted values into the draft, BUT only into
  // fields the receptionist has explicitly asked for (the
  // expectedField), to keep the slot-interpretation contextual.
  //
  // For the CURRENT expected field, apply normally.
  // For OTHER fields, the user may have volunteered them in this
  // message — capture them too, but they don't change what we
  // ask next. This is what the brief's test C2 ("All four fields
  // in one multi-line message") requires.
  if (extracted.name) {
    if (!draft.patientName || draft.expectedField === "name") {
      draft.patientName = extracted.name
      draft.history.push({ field: "patientName", value: extracted.name, source: "user" })
    }
  }
  if (extracted.phone) {
    // Provenance rule: an EXPLICIT phone in the user message always
    // beats a WhatsApp-autofilled one (the bundle incident: the user
    // typed 9643070673 but the draft kept the sender number). A phone
    // the user explicitly provided earlier stays locked unless the
    // message carries an explicit correction introducer.
    const userLockedPhone = draft.history.some(
      (h) => h.field === "patientPhone" && (h.source === "user" || h.source === "user_correction"),
    )
    const hasPhoneIntroducer =
      /\b(my\s+(phone|number|cell|mobile)\s+is|phone\s+is|actually\s+my\s+number|call\s+me\s+at|reach\s+me\s+at)\b/i.test(message)
    if (
      draft.patientPhone !== extracted.phone &&
      (!draft.patientPhone || draft.expectedField === "phone" || !userLockedPhone || hasPhoneIntroducer)
    ) {
      draft.patientPhone = extracted.phone
      draft.history.push({ field: "patientPhone", value: extracted.phone, source: "user" })
    }
  }
  if (extracted.reason) {
    if (!draft.reason || draft.expectedField === "reason") {
      draft.reason = extracted.reason
      draft.history.push({ field: "reason", value: extracted.reason, source: "user" })
    }
  } else if (draft.expectedField === "reason" && !isControlMessage(message)) {
    // Context-aware fallback: the receptionist explicitly asked for the visit reason.
    // Accept any plausible text answer (e.g. single-word "toothache", "checkup", or typo "teeh pain").
    // Control commands and questions are never reasons.
    const trimmed = message.trim()
    if (
      trimmed.length >= 2 &&
      !extractDate(trimmed, now) &&
      !extractTime(trimmed) &&
      !extractPhone(trimmed) &&
      !/[?]/.test(trimmed) &&
      !/^(what|where|when|how|who|why|is|are|do|does|did|can|could|tell|show)\b/i.test(trimmed)
    ) {
      draft.reason = trimmed
      draft.history.push({ field: "reason", value: trimmed, source: "user" })
    }
  }
  // Date/time: an EXPLICITLY present value ALWAYS replaces a stale one,
  // regardless of which field was expected (production incident: the user
  // said "12 september 2026 at 4pm" and the system kept 2026-10-05/12:00).
  // Date/time extractors only fire on unambiguous markers, so an explicit
  // hit is never accidental.
  if (extracted.preferredDate) {
    if (draft.preferredDate !== extracted.preferredDate) {
      draft.preferredDate = extracted.preferredDate
      draft.history.push({ field: "preferredDate", value: extracted.preferredDate, source: "user" })
    }
  }
  if (extracted.preferredTime) {
    if (draft.preferredTime !== extracted.preferredTime) {
      draft.preferredTime = extracted.preferredTime
      draft.history.push({ field: "preferredTime", value: extracted.preferredTime, source: "user" })
    }
  }

  // Phone fallback: if still unset, take the WhatsApp sender.
  // User-provided values always win (handled above).
  if (!draft.patientPhone && whatsappFrom.phone) {
    draft.patientPhone = whatsappFrom.phone
    draft.history.push({ field: "patientPhone", value: whatsappFrom.phone, source: "whatsapp" })
  }

  // Phone correction: a message like "my number is ..." or "phone
  // is ..." ALWAYS overrides the existing phone, even if the
  // expectedField is not "phone" and even if a whatsapp fallback
  // is already set. This handles the case where the user wants to
  // use a different number than the WhatsApp sender.
  if (extracted.phone && /\b(my\s+(phone|number|cell|mobile)\s+is|phone\s+is|actually\s+my\s+number)\b/i.test(message)) {
    if (draft.patientPhone !== extracted.phone) {
      draft.patientPhone = extracted.phone
      draft.history.push({ field: "patientPhone", value: extracted.phone, source: "user_correction" })
    }
  }

  // Name correction: a message like "actually my name is ..." or
  // "my name is ..." ALWAYS overrides the existing name, even if
  // the expectedField is not "name". The name is extracted from
  // the text AFTER the introducer phrase.
  if (/\b(actually\s+my\s+name\s+is|my\s+name\s+is|i\s+am|i'm)\b/i.test(message)) {
    const stripped = message
      .replace(/.*?\b(actually\s+my\s+name\s+is|my\s+name\s+is|i\s+am|i'm)\b\s*/i, "")
      .trim()
    const correctedName = extractName(stripped)
    if (correctedName && draft.patientName !== correctedName) {
      draft.patientName = correctedName
      draft.history.push({ field: "patientName", value: correctedName, source: "user_correction" })
    }
  }

  // Recompute the next missing field.
  draft.expectedField = nextMissingField(draft)
  draft.status = draft.expectedField ? "collecting" : "ready"
  draft.updatedAt = now.toISOString()

  return {
    draft,
    nextPrompt: draft.expectedField ? buildPrompt(draft, draft.expectedField) : null,
    isComplete: draft.expectedField === null,
  }
}

export function nextMissingField(draft: AppointmentDraft): ExpectedField {
  if (!draft.patientName) return "name"
  if (!draft.patientPhone) return "phone"
  if (!draft.reason) return "reason"
  if (!draft.preferredDate) return "date"
  if (!draft.preferredTime) return "time"
  return null
}

export function buildPrompt(draft: AppointmentDraft, field: ExpectedField): string {
  if (field === null) return ""
  const firstName = draft.patientName?.split(/\s+/)[0]
  switch (field) {
    case "name":
      return "Sure, I can help you book an appointment. What's your full name?"
    case "phone":
      // We only ask for phone if WhatsApp did not provide one (rare).
      return "Thanks! What phone number should we use to confirm the appointment?"
    case "reason":
      return `Thanks${firstName ? `, ${firstName}` : ""}. What is the reason for your visit?`
    case "date":
      return "Got it. What date would you prefer? You can say 'tomorrow', 'next Monday', or a specific date like 'October 5'."
    case "time":
      return "What time works for you? For example, '4 PM', 'morning', or 'afternoon'."
  }
}

/**
 * Create a fresh draft in response to a confirmed APPOINTMENT_START
 * signal from the route classifier. Returns the new draft ready to
 * be persisted.
 */
export function createFreshDraft(now: Date = new Date()): AppointmentDraft {
  return {
    ...EMPTY_DRAFT,
    active: true,
    status: "collecting",
    expectedField: "name",
    activatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    history: [{ field: "_activated", value: now.toISOString(), source: "auto" }],
  }
}

export function clearDraft(reason: string): AppointmentDraft {
  return {
    ...EMPTY_DRAFT,
    clearedReason: reason,
    history: [],
  }
}

// === Field extractors =====================================================

interface ExtractedFields {
  name?: string
  phone?: string
  reason?: string
  preferredDate?: string
  preferredTime?: string
}

export function extractAllFields(message: string, now: Date = new Date()): ExtractedFields {
  const out: ExtractedFields = {}

  // Fail closed: a pure control message carries no field evidence.
  if (isControlMessage(message)) return out

  // Introducer-anchored whole-message extraction: one sentence can
  // carry several fields ("My name is X and I have headache. ...
  // My number is ..."). Newline/comma segmentation misses those, so
  // anchor on the introducer phrases directly. Positive evidence
  // only — a failed anchor simply leaves the field empty.
  if (!out.name) {
    const m = message.match(/\b(?:actually\s+)?my\s+name\s+is\s+([A-Za-z][A-Za-z'\-.]{1,30}(?:\s+[A-Za-z][A-Za-z'\-.]{1,30}){0,3})/i)
    if (m) {
      const chunk = m[1].split(/\s+(?:and|for|because|with|who|that|which)\b/i)[0].trim()
      const name = extractName(chunk)
      if (name) out.name = name
    }
  }
  if (!out.phone) {
    const m = message.match(/\b(?:my\s+(?:phone|number|cell|mobile)\s+is|phone\s+is|call\s+me\s+at|reach\s+me\s+at)\s*([+\d][\d\s\-().]{5,20})/i)
    if (m) {
      const phone = extractPhone(m[1])
      if (phone) out.phone = phone
    }
  }

  // Split on newlines and commas (single-line multi-field messages).
  const segments = message
    .split(/[\r\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const seg of segments) {
    if (isAppointmentStart(seg)) continue

    if (!out.phone) {
      const phone = extractPhone(seg)
      if (phone) out.phone = phone
    }
    if (!out.preferredDate) {
      const date = extractDate(seg, now)
      if (date) out.preferredDate = date
    }
    if (!out.preferredTime) {
      const time = extractTime(seg)
      if (time) out.preferredTime = time
    }
    if (out.phone || out.preferredDate || out.preferredTime) continue

    if (!out.name) {
      const name = extractName(seg)
      if (name) out.name = name
    }
  }

  if (!out.reason) {
    out.reason = extractReason(message, out, now)
  }

  return out
}

export interface AppointmentEvidence {
  hasName: boolean
  hasPhone: boolean
  hasReason: boolean
  hasDate: boolean
  hasTime: boolean
  /** Count of hard evidence fields (phone/date/time). */
  hardCount: number
}

/** Count which appointment fields a message carries positive evidence for. */
export function countAppointmentEvidence(message: string, now: Date = new Date()): AppointmentEvidence {
  if (isControlMessage(message)) {
    return { hasName: false, hasPhone: false, hasReason: false, hasDate: false, hasTime: false, hardCount: 0 }
  }
  const fields = extractAllFields(message, now)
  const hasPhone = Boolean(fields.phone)
  const hasDate = Boolean(fields.preferredDate)
  const hasTime = Boolean(fields.preferredTime)
  return {
    hasName: Boolean(fields.name),
    hasPhone,
    hasReason: Boolean(fields.reason),
    hasDate,
    hasTime,
    hardCount: (hasPhone ? 1 : 0) + (hasDate ? 1 : 0) + (hasTime ? 1 : 0),
  }
}

/**
 * True when a message with NO active draft is clearly a structured
 * appointment bundle (e.g. name + phone + reason + date + time in one
 * message). Such messages must enter the appointment flow — never the
 * generic fallback. Conservative by design: requires at least two
 * hard-evidence fields (phone/date/time), or one hard field plus both
 * a name and a reason, so pure symptom messages ("I have headache")
 * never auto-start a booking.
 */
export function looksLikeAppointmentBundle(message: string, now: Date = new Date()): boolean {
  const text = message.trim()
  if (!text || text.length > 500) return false
  if (isControlMessage(text)) return false
  if (isAppointmentStart(text)) return false
  const ev = countAppointmentEvidence(text, now)
  if (ev.hardCount >= 2) return true
  if (ev.hardCount === 1 && ev.hasName && ev.hasReason) return true
  return false
}

export function extractPhone(line: string): string | undefined {
  const digits = line.replace(/[^\d]/g, "")
  if (digits.length < 7 || digits.length > 15) return undefined
  // Two ways a line can be a phone:
  //   1. Mostly digits / phone punctuation: "8700879401",
  //      "+1 555 000 1111", "(555) 000-1111"
  //   2. Contains a phone-introducer phrase ("my number is",
  //      "phone is", "call me at", "my phone is") followed by digits
  const phonePunct = line.replace(/[+\d\s\-().]/g, "")
  if (phonePunct.trim().length <= 2) return digits
  if (/\b(my\s+(phone|number|cell|mobile)\s+is|phone\s+is|actually\s+my\s+number|call\s+me\s+at|reach\s+me\s+at)\b/i.test(line)) {
    return digits
  }
  return undefined
}

export function extractTime(line: string): string | undefined {
  const lower = line.toLowerCase().trim()
  if (/^morning$/.test(lower)) return "09:00"
  if (/^afternoon$/.test(lower)) return "14:00"
  if (/^evening$/.test(lower)) return "17:30"
  if (/\bnoon\b/.test(lower)) return "12:00"
  if (/\bmidnight\b/.test(lower)) return "00:00"

  // "half past four", "quarter past 4", "quarter to 5" — digits or words.
  // No meridiem is assumed (consistent with bare-hour handling).
  const hourToken = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)"
  const wordHour = (t: string): number | undefined => {
    if (/^\d{1,2}$/.test(t)) {
      const h = parseInt(t, 10)
      return h >= 1 && h <= 12 ? h : undefined
    }
    return NUMBER_WORDS[t]
  }
  const halfPast = lower.match(new RegExp(`\\bhalf\\s+past\\s+${hourToken}\\b`))
  if (halfPast) {
    const h = wordHour(halfPast[1])
    if (h !== undefined) return `${String(h === 12 ? 12 : h).padStart(2, "0")}:30`
  }
  const quarterPast = lower.match(new RegExp(`\\bquarter\\s+past\\s+${hourToken}\\b`))
  if (quarterPast) {
    const h = wordHour(quarterPast[1])
    if (h !== undefined) return `${String(h === 12 ? 12 : h).padStart(2, "0")}:15`
  }
  const quarterTo = lower.match(new RegExp(`\\bquarter\\s+to\\s+${hourToken}\\b`))
  if (quarterTo) {
    const h = wordHour(quarterTo[1])
    if (h !== undefined) {
      const prev = h === 1 ? 12 : h - 1
      return `${String(prev).padStart(2, "0")}:45`
    }
  }

  // Word-number meridiem: "four pm" → 16:00.
  const wordMeridiem = lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(am|pm|a\.m\.|p\.m\.)\b/)
  if (wordMeridiem) {
    let h = NUMBER_WORDS[wordMeridiem[1]]
    const isPm = /p/.test(wordMeridiem[2])
    if (isPm && h < 12) h += 12
    if (!isPm && h === 12) h = 0
    return `${String(h).padStart(2, "0")}:00`
  }

  // Explicit meridiem forms: "4pm", "4 PM", "4:30pm", "12am".
  // NOTE: a BARE 1-2 digit number is deliberately NOT a time — it is far
  // more likely a day-of-month ("12 September" must never become 12:00).
  const m = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/)
  if (m) {
    let h = parseInt(m[1], 10)
    const min = m[2] ? parseInt(m[2], 10) : 0
    const isPm = /p/.test(m[3])
    if (isPm && h < 12) h += 12
    if (!isPm && h === 12) h = 0
    if (h < 0 || h > 23 || min < 0 || min > 59) return undefined
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
  }

  const m24 = line.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
  if (m24) return `${m24[1].padStart(2, "0")}:${m24[2]}`

  return undefined
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

/**
 * Parse a natural-language date into YYYY-MM-DD.
 *
 * Year resolution (dynamic — NEVER hardcoded):
 *   - explicit 4-digit year in the message → that year wins;
 *   - no year → the server's current year, EXCEPT when that date has
 *     already passed (relative to server `now`), in which case the
 *     NEXT year is used (a past appointment is never bookable).
 *   - invalid calendar dates (e.g. 30 February) → undefined.
 *
 * Supported: today/tomorrow/day after tomorrow, weekday names
 * ("next Monday", "this Saturday"), "12 September", "September 12",
 * ordinals ("12th September", "September 12th"), "12 Sep",
 * numeric (M/D, D-M with year), explicit years ("12 September 2026").
 */
export function extractDate(line: string, now: Date): string | undefined {
  const lower = line.toLowerCase().trim()
  if (/\btoday\b/.test(lower)) return isoDate(now)
  if (/\btomorrow\b/.test(lower)) return isoDate(addDays(now, 1))
  if (/\bday\s+after\s+tomorrow\b/.test(lower)) return isoDate(addDays(now, 2))

  const dayMatch = lower.match(/\b(?:(next|this|on)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (dayMatch) {
    const wantNext = dayMatch[1] === "next"
    const idx = DAY_NAMES.indexOf(dayMatch[2])
    if (idx >= 0) return isoDate(nextWeekday(now, idx, wantNext))
  }

  const monthDay = lower.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,\s]+(\d{4}))?\b/)
  if (monthDay) {
    const month = MONTHS[monthDay[1].slice(0, 3)]
    const day = parseInt(monthDay[2], 10)
    return buildCalendarDate(now, month || 0, day, monthDay[3] ? parseInt(monthDay[3], 10) : undefined)
  }

  const dayMonth = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:[,\s]+(\d{4}))?\b/)
  if (dayMonth) {
    const day = parseInt(dayMonth[1], 10)
    const month = MONTHS[dayMonth[2].slice(0, 3)]
    return buildCalendarDate(now, month || 0, day, dayMonth[3] ? parseInt(dayMonth[3], 10) : undefined)
  }

  const numeric = lower.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/)
  if (numeric) {
    const a = parseInt(numeric[1], 10)
    const b = parseInt(numeric[2], 10)
    let year = numeric[3] ? parseInt(numeric[3], 10) : undefined
    if (year !== undefined && year < 100) year += 2000
    // DD/MM or DD-MM when a > 12 (e.g. 20/09, 20-09)
    if (a > 12 && a <= 31 && b >= 1 && b <= 12) {
      return buildCalendarDate(now, b, a, year)
    }
    // MM/DD or MM-DD when b > 12
    if (b > 12 && b <= 31 && a >= 1 && a <= 12) {
      return buildCalendarDate(now, a, b, year)
    }
    // Default when both <= 12: assume MM/DD or standard format
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
      return buildCalendarDate(now, a, b, year)
    }
  }

  return undefined
}

/**
 * Construct a validated YYYY-MM-DD for month/day in the appropriate year.
 * Returns undefined for impossible dates (month 0, day out of range,
 * e.g. 30 February — detected via round-trip, since `new Date` rolls over).
 */
function buildCalendarDate(now: Date, month: number, day: number, year: number | undefined): string | undefined {
  if (!month || month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const explicitYear = year !== undefined
  let y = explicitYear ? year! : now.getFullYear()
  let built = new Date(y, month - 1, day)
  if (built.getMonth() !== month - 1 || built.getDate() !== day) return undefined
  if (!explicitYear) {
    // A yearless date that already passed this year belongs to next year
    // (appointments are always in the future). Explicit years are NEVER
    // shifted — the user said what they said.
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (built < todayStart) {
      y += 1
      built = new Date(y, month - 1, day)
      if (built.getMonth() !== month - 1 || built.getDate() !== day) return undefined
    }
  }
  return isoDate(built)
}

export function extractName(line: string): string | undefined {
  const trimmed = line.trim()
  if (trimmed.length < 2 || trimmed.length > 80) return undefined
  // Control commands are never names ("Confirm", "Done", "Book this").
  if (isControlMessage(trimmed)) return undefined
  if (/[!?]/.test(trimmed)) return undefined
  if (/\d/.test(trimmed)) return undefined
  // Symptom-like text is a reason, never a name ("teeh pain",
  // "headche", "tooth pain") — unless an explicit name introducer
  // ("my name is ...") proves otherwise.
  const hasNameIntroducer = /\b(my\s+name\s+is|actually\s+my\s+name\s+is|i\s+am|i'm|this\s+is|call\s+me|it's|its)\b/i.test(trimmed)
  if (!hasNameIntroducer && fuzzyHealthSignal(trimmed).matched) return undefined
  // A control verb anywhere means this is a command, not a name
  // ("Book this" must not become "Book").
  if (/\b(book|books|booking|confirm|confirmed|confirming|done|proceed|proceeding|continue|submit|finalize|cancel|cancelling|yes|yeah|yep|ok|okay|sure|another|change)\b/i.test(trimmed)) return undefined
  const words = trimmed.split(/\s+/)
  if (words.length < 1 || words.length > 5) return undefined
  const nameShape = /^[A-Za-z][A-Za-z'\-.]{1,30}$/
  if (!words.every((w) => nameShape.test(w))) return undefined
  if (!words.some((w) => w.length >= 2)) return undefined
  const nonNameWords = [
    "book", "appointment", "schedule", "reschedule", "visit", "see",
    "doctor", "checkup", "consultation", "consult", "i", "want", "need",
    "to", "the", "a", "an", "my", "for", "with", "please", "thanks",
    "thank", "you", "hi", "hello", "hey", "where", "what", "when",
    "how", "is", "are", "do", "does", "did", "can", "could", "would",
    "will", "shall", "may", "might", "must", "should",
    "tomorrow", "today", "yesterday", "morning", "afternoon", "evening",
    "pain", "hurt", "sore", "ache", "fever", "headache", "toothache",
    "name", "phone", "number", "address", "clinic", "dentist",
    "this", "that", "these", "those", "was", "were", "be", "been",
    "have", "has", "had", "am", "i'm", "it", "its", "it's",
    "confirm", "confirmed", "done", "yes", "yeah", "yep", "ok", "okay",
    "sure", "proceed", "continue", "submit", "finalize", "cancel",
    "another", "new", "change",
  ]
  // Strip out non-name words. "My Name Is Akarshit" → "Akarshit".
  const nameWords = words.filter((w) => !nonNameWords.includes(w.toLowerCase()))
  if (nameWords.length === 0) return undefined
  if (!nameWords.some((w) => w.length >= 2)) return undefined
  return nameWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
}

function extractReason(message: string, alreadyExtracted?: ExtractedFields, now: Date = new Date()): string | undefined {
  // Control commands carry no reason ("Book" is not a reason).
  if (isControlMessage(message)) return undefined
  const extracted = alreadyExtracted || {}
  const segments = message
    .split(/[\r\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const reasonParts: string[] = []
  for (const seg of segments) {
    if (isAppointmentStart(seg)) continue
    // Control segments are commands, never reasons — drop them so a
    // mixed message ("Headache. Book it") keeps only real content.
    if (isControlMessage(seg)) continue
    if (extractPhone(seg)) continue
    if (extractTime(seg)) continue
    if (extractDate(seg, now)) continue
    if (extracted.name) {
      const candidate = extractName(seg)
      if (candidate && candidate === extracted.name) continue
    }
    reasonParts.push(seg)
  }
  const cleaned = reasonParts.join(", ").replace(/\s+/g, " ").trim()
  if (!cleaned) return undefined
  const finalClean = cleaned.replace(/^[,\-\s]+/, "").trim()
  if (!finalClean) return undefined
  // A leftover that is itself just a control word is not a reason.
  if (isControlMessage(finalClean)) return undefined
  return finalClean.length > 200 ? finalClean.slice(0, 200) : finalClean
}

/**
 * Reason-only correction while a READY draft awaits confirmation
 * ("Make reason tooth pain", "change reason to fever", "reason: cold").
 * Strips the correction introducer so only the new reason is stored —
 * never the whole command sentence.
 */
export function extractReasonCorrection(message: string, now: Date = new Date()): string | undefined {
  if (isControlMessage(message)) return undefined
  const stripped = message
    // Word boundaries on "to"/"as" matter: without them the "to" of
    // "tooth" is eaten ("Make reason tooth pain" → "oth pain").
    .replace(/.*?\b(?:make|change|update|set)\s+(?:the\s+|my\s+)?reason\s+(?:\bto\b|\bas\b|:)?\s*/i, "")
    .replace(/.*?\breason\s*(?:is|:)\s*/i, "")
    .trim()
  const source = stripped || message.trim()
  return extractReason(source, undefined, now)
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function nextWeekday(now: Date, target: number, wantNext: boolean): Date {
  const current = now.getDay()
  let diff = (target - current + 7) % 7
  if (diff === 0) diff = 7
  if (wantNext && diff < 7) diff += 7
  return addDays(now, diff)
}

// === Confirmation / denial ================================================
// Explicit user confirmation while a READY draft awaits it. Checked BEFORE
// the route classifier so "yes confirm" books instead of falling through
// to the generic AI flow.

const CONFIRM_PATTERNS: RegExp[] = [
  /^(yes|yeah|yep|yup|ya|sure|ok|okay|okay\s+confirm|confirm|confirmed|confirming|yes\s+confirm|confirm\s+(it|this|that|booking|appointment|my\s+appointment)|book|book\s+it|book\s+this|book\s+that|book\s+my\s+appointment|please\s+confirm|please\s+book|go\s+ahead|do\s+it|continue|proceed|submit|finalize|done|all\s+done|looks\s+good|that'?s\s+(it|all|correct|right|good|fine)|correct|right|haan|ha|han|ji\s*haan)\b[.!?]*$/i,
  /\b(yes[,\s]+confirm|confirm\s+my\s+appointment|yes[,\s]+book\s+it|yes[,\s]+please|please\s+confirm|please\s+book|confirm\s+it|book\s+it)\b/i,
  /\b(yeah|yes|sure|okay|ok|haan)\s+(bro\s+|please\s+)?(do\s+it|book\s+it|confirm(\s+it)?|go\s+ahead)\b/i,
  /\b(do\s+it|go\s+ahead)\b/i,
  // Affirmation + action combos: "yes book", "ok confirm", "sure book it".
  /^(yes|yeah|yep|ok|okay|sure)\s+(book|confirm|do\s+it|go\s+ahead)(\s+(it|this|that|please))?\b[.!?]*$/i,
  /\bconfirm\s+(the\s+)?booking\b/i,
]

export function isConfirmationMessage(message: string): boolean {
  const text = message.trim()
  if (!text || text.length > 120) return false
  return CONFIRM_PATTERNS.some((re) => re.test(text))
}

const DENY_PATTERNS: RegExp[] = [
  /^(no|nope|nah|not\s+yet|not\s+now|don'?t(\s+book|\s+confirm)?|stop|cancel(\s+(it|this|that|my\s+appointment))?|never\s*mind|forget\s+it|nvm|wait|change\s+it|nahi|na)\b[.!?]*$/i,
  /\b(don'?t\s+book|cancel\s+(it|this|my\s+appointment)|do\s+not\s+book|not\s+now|change\s+it|wait)\b/i,
]

export function isDenialMessage(message: string): boolean {
  const text = message.trim()
  if (!text || text.length > 80) return false
  return DENY_PATTERNS.some((re) => re.test(text))
}

// === Conversational control intents ========================================
// ARCHITECTURAL CONTRACT: control messages are commands, never data.
// "Confirm" / "Book" / "Done" / "yes" must be classified BEFORE any
// appointment field extraction runs. They must NEVER overwrite name,
// phone, reason, date, or time.
//
// Priority (evaluated in this order by classifyAppointmentControl):
//   1. denial / cancel
//   2. confirmation / book-submit
//   3. new-appointment request

const NEW_APPOINTMENT_PATTERNS: RegExp[] = [
  /\b(another|one\s+more|new|second|additional)\s+(appointment|booking|visit|consult|consultation|checkup)\b/i,
  /\b(book|schedule|need|want|get|have)\b.*\b(another|one\s+more)\s+(appointment|booking|visit|slot)\b/i,
  /\bschedule\s+another\s+visit\b/i,
]

export function isNewAppointmentRequest(message: string): boolean {
  const text = message.trim()
  if (!text || text.length > 140) return false
  return NEW_APPOINTMENT_PATTERNS.some((re) => re.test(text))
}

export type AppointmentControl = "deny" | "confirm" | "new" | null

/**
 * Classify a message as an appointment-flow control command.
 * Returns null when the message carries no control intent and may
 * proceed to field extraction.
 */
export function classifyAppointmentControl(message: string): AppointmentControl {
  const text = message.trim()
  if (!text || text.length > 140) return null
  if (isDenialMessage(text) || isFlowCancel(text)) return "deny"
  if (isConfirmationMessage(text)) return "confirm"
  if (isNewAppointmentRequest(text)) return "new"
  return null
}

// Whole-message control vocabulary: conversational commands that carry
// NO field data on their own. Used as a fail-closed guard inside the
// field extractors so a control word can never become slot data even
// if it reaches extraction.
const CONTROL_EXACT_WORDS: ReadonlySet<string> = new Set([
  "yes", "yeah", "yep", "yup", "ya",
  "sure", "ok", "okay", "confirm", "confirmed", "confirming",
  "please confirm", "book", "book it", "book this", "book that",
  "go ahead", "do it", "continue", "proceed", "submit", "finalize",
  "done", "all done", "correct", "right", "looks good",
  "thats it", "that's it", "thats correct", "that's correct",
  "thats right", "that's right", "thats good", "that's good",
  "thats fine", "that's fine",
  "no", "nope", "nah", "cancel", "change it",
  "another appointment", "new appointment",
  "haan", "ha", "han",
])

/**
 * True when the ENTIRE message is a conversational command with no
 * appointment field data. Field extractors must return "no evidence"
 * for such messages.
 */
export function isControlMessage(message: string): boolean {
  const text = message.trim()
  if (!text || text.length > 140) return false
  const normalized = text
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (CONTROL_EXACT_WORDS.has(normalized)) return true
  // Pattern-level control (covers punctuated/longer variants) — but
  // only when the message carries no hard field evidence (phone,
  // date, time), so "confirm for 4pm" still yields its time.
  if (!extractPhone(text) && !extractDate(text, new Date()) && !extractTime(text)) {
    if (classifyAppointmentControl(text) !== null) return true
  }
  return false
}

// === Delegation intents ("choose for me" / "what's available") ============
// Deterministic appointment behavior: when the user delegates the time
// choice, the system searches REAL availability instead of asking the
// LLM (which invents times) or falling back generically.

const CHOOSE_FOR_ME_PATTERNS: RegExp[] = [
  /\btake\s+(it\s+)?according\s+to\s+yourself\b/i,
  /\b(you\s+(choose|decide|pick)|choose\s+for\s+me|decide\s+for\s+me|pick\s+for\s+me)\b/i,
  /\b(any\s+(available\s+)?time|whatever(\s+is)?\s+(available|free)|your\s+choice|you\s+decide|whatever\s+time)\b/i,
  /\b(earliest\s+available|first\s+available|soonest\s+available|choose\s+a\s+good\s+time|pick\s+a\s+good\s+time)\b/i,
]

export function isChooseForMeMessage(message: string): boolean {
  const text = message.trim()
  if (!text || text.length > 140) return false
  return CHOOSE_FOR_ME_PATTERNS.some((re) => re.test(text))
}

const LIST_TIMES_PATTERNS: RegExp[] = [
  /\bwhat\s+times?\s+are\s+available\b/i,
  /\bshow\s+me\s+.*\b(available|slots|times)\b/i,
  /\bavailable\s+(times|slots)\b/i,
  /\bwhen\s+are\s+you\s+(free|available)\b/i,
  /\bopen\s+slots\b/i,
]

export function isListTimesMessage(message: string): boolean {
  const text = message.trim()
  if (!text || text.length > 140) return false
  return LIST_TIMES_PATTERNS.some((re) => re.test(text))
}

// === Booking-status questions =============================================
// "confirm or not?" / "is it confirmed?" / "did you confirm?" / "has it
// been booked?" — these ask ABOUT state and must NEVER trigger booking.
// They are answered deterministically from the draft / database.

const STATUS_QUESTION_PATTERNS: RegExp[] = [
  /\bconfirm\s+or\s+not\b/i,
  /\bis\s+it\s+confirmed\b/i,
  /\b(did\s+you|have\s+you)\s+(confirm|book)(ed|ing)?\b/i,
  /\bhas\s+it\s+been\s+(confirmed|booked)\b/i,
  /\bis\s+my\s+appointment\s+(confirmed|booked)\b/i,
  /\bam\s+i\s+(confirmed|booked)\b/i,
  /\bwhat'?s\s+my\s+appointment\s+(status|confirmation)\b/i,
  /\bappointment\s+status\b/i,
]

export function isBookingStatusQuestion(message: string): boolean {
  const text = message.trim()
  if (!text || text.length > 140) return false
  return STATUS_QUESTION_PATTERNS.some((re) => re.test(text))
}

// === Year correction ======================================================
// "not 2027, 2026" / "it's 2026" / "year is 2026" / bare "2026" while a
// draft holds a date: deterministically rewrite the draft year instead of
// routing to the generic AI flow.

export function extractYearCorrection(message: string): number | undefined {
  const lower = message.toLowerCase()
  const years = (lower.match(/\b(?:19|20)\d{2}\b/g) || []).map((y) => parseInt(y, 10))
  if (years.length === 0) return undefined
  const hasCorrectionCue =
    /\b(not|isn'?t|it'?s|actually|correction|wrong|year|change)\b/i.test(lower) ||
    /\bnot\s+\d{4}\b/.test(lower) ||
    years.length === 1
  if (!hasCorrectionCue) return undefined
  // "not 2027, 2026" → the LAST mentioned year is the correction target.
  return years[years.length - 1]
}

export function applyYearToDate(dateIso: string, year: number): string | undefined {
  const m = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return undefined
  const built = new Date(year, parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  if (built.getMonth() !== parseInt(m[2], 10) - 1 || built.getDate() !== parseInt(m[3], 10)) return undefined
  return isoDate(built)
}

// === Human-readable formatting (no hardcoding — pure functions) ============

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function formatDateHuman(dateIso: string): string {
  const m = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return dateIso
  const monthName = MONTH_NAMES[parseInt(m[2], 10) - 1] || m[2]
  return `${parseInt(m[3], 10)} ${monthName} ${m[1]}`
}

const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
]

export function formatDateHumanLong(dateIso: string): string {
  const m = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return dateIso
  const built = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  const weekday = WEEKDAY_NAMES[built.getDay()] || ""
  return `${weekday}, ${parseInt(m[3], 10)} ${MONTH_NAMES[parseInt(m[2], 10) - 1] || m[2]} ${m[1]}`
}

export function formatTimeHuman(time24: string): string {
  const m = time24.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return time24
  let h = parseInt(m[1], 10)
  const suffix = h >= 12 ? "PM" : "AM"
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${m[2]} ${suffix}`
}

export function buildConfirmationSummary(draft: AppointmentDraft): string {
  const firstName = draft.patientName?.split(/\s+/)[0]
  const prefix = firstName ? `Perfect, ${firstName}. Here are your appointment details:` : "Perfect. Here are your appointment details:"
  const lines = [
    prefix,
    "",
    `📅 Date: ${draft.preferredDate ? formatDateHuman(draft.preferredDate) : "—"}`,
    `🕑 Time: ${draft.preferredTime ? formatTimeHuman(draft.preferredTime) : "—"}`,
  ]
  if (draft.patientName) lines.push(`👤 Name: ${draft.patientName}`)
  if (draft.patientPhone) lines.push(`📞 Phone: ${draft.patientPhone}`)
  if (draft.reason) lines.push(`🩺 Reason: ${draft.reason}`)
  lines.push("", "Would you like me to confirm this appointment?")
  return lines.join("\n")
}

export function buildBookingConfirmation(draft: AppointmentDraft, clinicName?: string): string {
  const name = clinicName || "the clinic"
  const lines = [
    "🎉 Your appointment has been confirmed!",
    "",
    `📅 Date: ${draft.preferredDate ? formatDateHuman(draft.preferredDate) : "—"}`,
    `🕑 Time: ${draft.preferredTime ? formatTimeHuman(draft.preferredTime) : "—"}`,
    `👤 Patient: ${draft.patientName || "—"}`,
  ]
  if (draft.reason) lines.push(`🩺 Reason: ${draft.reason}`)
  lines.push("", `We look forward to seeing you at ${name}.`, "If you need to make any changes, just message us here.")
  return lines.join("\n")
}

// === Persistence helpers ==================================================

export function readDraftFromMetadata(metadata: string | null | undefined): AppointmentDraft | null {
  if (!metadata) return null
  try {
    const parsed = JSON.parse(metadata)
    if (parsed && typeof parsed === "object" && "appointmentDraft" in parsed) {
      const d = (parsed as { appointmentDraft?: AppointmentDraft }).appointmentDraft
      if (d && d.active) {
        // Defensive: ensure the loaded draft has the required shape.
        return {
          ...EMPTY_DRAFT,
          ...d,
          history: Array.isArray(d.history) ? d.history : [],
        }
      }
    }
  } catch {
    // Malformed JSON — treat as no draft. The receptionist will
    // start fresh on the next activation signal.
  }
  return null
}

export function writeDraftToMetadata(
  metadata: string | null | undefined,
  draft: AppointmentDraft,
): string {
  // CRITICAL: This function is the SINGLE owner of the
  // `appointmentDraft` field. Other code MUST NOT write
  // `metadata` directly; instead they should call
  // `mergeConversationMetadata` to safely combine their updates
  // with the appointment draft.
  let base: Record<string, unknown> = {}
  if (metadata) {
    try {
      const parsed = JSON.parse(metadata)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>
      }
    } catch {
      // Malformed metadata — overwrite rather than crash. The draft
      // is the new source of truth.
    }
  }
  if (!draft.active) {
    delete base.appointmentDraft
  } else {
    base.appointmentDraft = draft
  }
  return JSON.stringify(base)
}

export function isDraftReady(draft: AppointmentDraft | null): boolean {
  if (!draft || !draft.active) return false
  return Boolean(
    draft.patientName && draft.patientPhone && draft.reason &&
    draft.preferredDate && draft.preferredTime,
  )
}
