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
  // Length guard: very short messages are unlikely to be a real
  // booking request. "ok" / "no" / "yes" should not activate.
  if (lower.length < 5) return false
  return APPOINTMENT_START_PATTERNS.some((re) => re.test(lower))
}

// === Cancellation / rescheduling ==========================================
// These do NOT start a new draft. They are routed to the normal
// receptionist flow so the existing booking (if any) can be
// cancelled or rescheduled through the standard clinic tooling.
const CANCEL_PATTERNS: RegExp[] = [
  /\b(cancel|cancellation|cancelled|cancelling)\b/i,
]
const RESCHEDULE_PATTERNS: RegExp[] = [
  new RegExp("\\b(i\\s+need\\s+to\\s+reschedule|i\\s+want\\s+to\\s+reschedule|reschedule|re-?schedule)\\b", "i"),
  new RegExp("\\b(change\\s+my|change\\s+the|move\\s+my|move\\s+the)\\b.*\\b(appointment|booking|visit)\\b", "i"),
  new RegExp("\\b(can\\s+i\\s+(move|change|reschedule|re-?schedule))\\b", "i"),
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
    if (!draft.patientPhone || draft.expectedField === "phone") {
      if (draft.patientPhone !== extracted.phone) {
        draft.patientPhone = extracted.phone
        draft.history.push({ field: "patientPhone", value: extracted.phone, source: "user" })
      }
    }
  }
  if (extracted.reason) {
    if (!draft.reason || draft.expectedField === "reason") {
      draft.reason = extracted.reason
      draft.history.push({ field: "reason", value: extracted.reason, source: "user" })
    }
  }
  if (extracted.preferredDate) {
    if (!draft.preferredDate || draft.expectedField === "date") {
      draft.preferredDate = extracted.preferredDate
      draft.history.push({ field: "preferredDate", value: extracted.preferredDate, source: "user" })
    }
  }
  if (extracted.preferredTime) {
    if (!draft.preferredTime || draft.expectedField === "time") {
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
    out.reason = extractReason(message, out)
  }

  return out
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

  const m = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/)
  if (m) {
    let h = parseInt(m[1], 10)
    const min = m[2] ? parseInt(m[2], 10) : 0
    const meridiem = m[3]
    if (meridiem) {
      const isPm = /p/.test(meridiem)
      if (isPm && h < 12) h += 12
      if (!isPm && h === 12) h = 0
    }
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
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) return buildCalendarDate(now, a, b, year)
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
  if (/[!?]/.test(trimmed)) return undefined
  if (/\d/.test(trimmed)) return undefined
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
  ]
  // Strip out non-name words. "My Name Is Akarshit" → "Akarshit".
  const nameWords = words.filter((w) => !nonNameWords.includes(w.toLowerCase()))
  if (nameWords.length === 0) return undefined
  if (!nameWords.some((w) => w.length >= 2)) return undefined
  return nameWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
}

function extractReason(message: string, alreadyExtracted?: ExtractedFields): string | undefined {
  const extracted = alreadyExtracted || {}
  const segments = message
    .split(/[\r\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const reasonParts: string[] = []
  for (const seg of segments) {
    if (isAppointmentStart(seg)) continue
    if (extractPhone(seg)) continue
    if (extractTime(seg)) continue
    if (extractDate(seg, new Date())) continue
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
  return finalClean.length > 200 ? finalClean.slice(0, 200) : finalClean
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
  /^(yes|yeah|yep|yup|sure|ok|okay|okay\s+confirm|confirm|confirmed|yes\s+confirm|confirm\s+(it|this|that|appointment|my\s+appointment)|book\s+it|book\s+this|book\s+my\s+appointment|please\s+confirm|please\s+book|go\s+ahead|do\s+it|looks\s+good|that'?s\s+(correct|right|good|fine)|correct|right)\b[.!?]*$/i,
  /\b(yes[,\s]+confirm|confirm\s+my\s+appointment|yes[,\s]+book\s+it|yes[,\s]+please)\b/i,
]

export function isConfirmationMessage(message: string): boolean {
  const text = message.trim()
  if (!text || text.length > 120) return false
  return CONFIRM_PATTERNS.some((re) => re.test(text))
}

const DENY_PATTERNS: RegExp[] = [
  /^(no|nope|nah|not\s+yet|don'?t(\s+book|\s+confirm)?|stop|cancel\s+(it|this|that)|never\s*mind|forget\s+it|nvm)\b[.!]*$/i,
]

export function isDenialMessage(message: string): boolean {
  const text = message.trim()
  if (!text || text.length > 60) return false
  return DENY_PATTERNS.some((re) => re.test(text))
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
  const lines = [
    "Perfect. I have:",
    `Date: ${draft.preferredDate ? formatDateHuman(draft.preferredDate) : "—"}`,
    `Time: ${draft.preferredTime ? formatTimeHuman(draft.preferredTime) : "—"}`,
  ]
  if (draft.patientName) lines.push(`Name: ${draft.patientName}`)
  if (draft.reason) lines.push(`Reason: ${draft.reason}`)
  lines.push("", "Shall I confirm this appointment?")
  return lines.join("\n")
}

export function buildBookingConfirmation(draft: AppointmentDraft): string {
  const firstName = draft.patientName?.split(/\s+/)[0]
  return (
    `Your appointment has been confirmed for ` +
    `${draft.preferredDate ? formatDateHuman(draft.preferredDate) : "your requested date"}` +
    `${draft.preferredTime ? ` at ${formatTimeHuman(draft.preferredTime)}` : ""}` +
    `${draft.reason ? ` for ${draft.reason}` : ""}.` +
    `${firstName ? ` We'll see you then, ${firstName}!` : " We'll see you then!"}`
  )
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
