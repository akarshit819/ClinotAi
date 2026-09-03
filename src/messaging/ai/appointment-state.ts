/**
 * Appointment state machine.
 *
 * Persisted as a JSON blob inside Conversation.metadata (the column
 * already exists in the schema). The state machine is deterministic
 * (no LLM call required to advance a turn) and handles all of:
 *
 *  - activating a new draft from a booking keyword or symptom
 *  - extracting name / reason / date / time / phone from free-form text
 *  - accepting multi-field input in a single message
 *  - accepting multi-line input (each line may contain a different field)
 *  - falling back to the WhatsApp sender for phone
 *  - clearing on emergency / cancellation / explicit user request
 *  - returning the next prompt and a "ready to book" flag when all
 *    fields are present
 *
 * The receptionist module calls processTurn() BEFORE the generic AI
 * intent classifier, so an active draft is never overwritten by a
 * free-form user reply.
 */

export type AppointmentDraft = {
  active: boolean
  activatedAt?: string
  updatedAt?: string
  patientName?: string
  patientPhone?: string
  reason?: string
  preferredDate?: string // YYYY-MM-DD
  preferredTime?: string // HH:MM 24h
  providerId?: string
  providerName?: string
  history: Array<{ field: string; value: string; source: "user" | "whatsapp" }>
  clearedReason?: string
}

export const EMPTY_DRAFT: AppointmentDraft = { active: false, history: [] }

export const APPOINTMENT_TRIGGER_KEYWORDS = [
  "appointment", "book", "schedule", "reschedule", "cancel my appointment",
  "need to see a doctor", "when can i come in", "availability",
  "available", "booking", "visit", "see a doctor", "see the doctor",
  "checkup", "cleaning", "consult", "consultation",
]

// Symptoms / health complaints that should activate appointment intent.
// These are not strictly "book" but clearly indicate the patient
// wants clinical help and the appropriate response is to offer /
// collect booking info.
export const SYMPTOM_TRIGGERS = [
  "headache", "toothache", "tooth hurts", "my tooth", "tooth pain",
  "pain", "hurt", "sore", "ache",
  "fever", "cough", "cold", "flu",
  "bleeding", "swelling", "swell",
  "dizzy", "nausea", "vomit",
  "back pain", "neck pain", "ear pain", "sore throat",
  "check", "checkup", "look at", "take a look",
]

// Emergency keywords — if any of these appear in the current message
// we clear the active draft and return the emergency response, even
// mid-flow.
export const EMERGENCY_OVERRIDE_KEYWORDS = [
  "emergency", "urgent", "severe pain", "can't breathe", "difficulty breathing",
  "bleeding heavily", "unconscious", "heart attack", "stroke", "chest pain",
  "allergic reaction", "anaphylaxis", "overdose", "suicide", "self harm",
]

// We do NOT trigger on "headache" alone at the global level — only at
// the receptionist level when an active draft exists, so the user is
// not aggressively pushed toward booking on casual mentions. The
// keyword list is intentionally conservative: pain, sore, hurt, etc.
// alongside active draft is a strong signal of intent.

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const DAY_ABBR = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

/**
 * Detect whether a user message should START a new appointment draft.
 * The receptionist calls this on the raw message BEFORE the generic
 * intent classifier, so a booking intent is never lost to a later
 * "general_question" classification.
 */
export function isAppointmentTrigger(message: string): boolean {
  const lower = message.toLowerCase()
  return APPOINTMENT_TRIGGER_KEYWORDS.some((kw) => lower.includes(kw))
}

export function isSymptomTrigger(message: string): boolean {
  const lower = message.toLowerCase()
  return SYMPTOM_TRIGGERS.some((kw) => lower.includes(kw))
}

export function isEmergencyOverride(message: string): boolean {
  const lower = message.toLowerCase()
  return EMERGENCY_OVERRIDE_KEYWORDS.some((kw) => lower.includes(kw))
}

/**
 * Process one turn of the appointment flow.
 *
 * Inputs:
 *   - existingDraft: the draft currently in Conversation.metadata, or null
 *   - message: the raw user message (may be multi-line)
 *   - whatsappFrom: the sender info (used for phone fallback)
 *   - now: current Date (for relative-time resolution)
 *
 * Returns:
 *   - draft: the new draft (after this turn's updates)
 *   - nextPrompt: a string the receptionist should send to the patient
 *     ("Thanks, Akarshit. What is the reason..."). If draft.active=false
 *     and no activation happened, nextPrompt is null and the caller
 *     should fall back to normal intent handling.
 *   - isComplete: true when all required fields (name, phone, reason,
 *     preferredDate, preferredTime) are present. The receptionist can
 *     then proceed to book_appointment.
 *   - shouldClear: true when the user explicitly cancels or changes
 *     topic. The receptionist should clear Conversation.metadata and
 *     fall through to normal handling.
 */
export function processTurn(
  existingDraft: AppointmentDraft | null,
  message: string,
  whatsappFrom: { id: string; phone?: string; name?: string },
  now: Date = new Date(),
): {
  draft: AppointmentDraft
  nextPrompt: string | null
  isComplete: boolean
  shouldClear: boolean
} {
  // Emergency override — clear any active draft and let the caller
  // emit the emergency response.
  if (isEmergencyOverride(message)) {
    return {
      draft: { ...EMPTY_DRAFT, history: [] },
      nextPrompt: null,
      isComplete: false,
      shouldClear: true,
    }
  }

  // Explicit cancellation from the user (in any phrasing).
  const lower = message.toLowerCase().trim()
  if (
    existingDraft?.active &&
    /^(never ?mind|forget (it|that)|cancel|stop|don'?t (book|need)|no (thanks|thank you))$/i.test(lower)
  ) {
    return {
      draft: { ...EMPTY_DRAFT, clearedReason: "user_cancelled", history: [] },
      nextPrompt: null,
      isComplete: false,
      shouldClear: true,
    }
  }

  const draft: AppointmentDraft = existingDraft
    ? { ...existingDraft, history: [...existingDraft.history] }
    : { ...EMPTY_DRAFT, history: [] }

  // Activate if not yet active AND the message is a trigger.
  if (!draft.active) {
    if (isAppointmentTrigger(message) || isSymptomTrigger(message)) {
      draft.active = true
      draft.activatedAt = now.toISOString()
    } else {
      // No active draft, no trigger → caller falls through to normal
      // intent handling (greeting, FAQ, etc.).
      return {
        draft: existingDraft || { ...EMPTY_DRAFT, history: [] },
        nextPrompt: null,
        isComplete: false,
        shouldClear: false,
      }
    }
  }

  // From here, draft.active is true. Extract fields from the message.
  // The message may contain multiple fields at once. We run all
  // extractors in a single pass.
  const extracted = extractAllFields(message, now)

  // Apply extracted fields. An explicit user-provided value ALWAYS
  // wins over a previously-set WhatsApp fallback — the patient is
  // not held hostage to a phone number we inferred before they had
  // a chance to type their own. For all other fields, the
  // "already set" check applies so the patient is never asked to
  // repeat themselves.
  if (extracted.name && !draft.patientName) {
    draft.patientName = extracted.name
    draft.history.push({ field: "patientName", value: extracted.name, source: "user" })
  }
  if (extracted.reason && !draft.reason) {
    draft.reason = extracted.reason
    draft.history.push({ field: "reason", value: extracted.reason, source: "user" })
  }
  if (extracted.preferredDate && !draft.preferredDate) {
    draft.preferredDate = extracted.preferredDate
    draft.history.push({ field: "preferredDate", value: extracted.preferredDate, source: "user" })
  }
  if (extracted.preferredTime && !draft.preferredTime) {
    draft.preferredTime = extracted.preferredTime
    draft.history.push({ field: "preferredTime", value: extracted.preferredTime, source: "user" })
  }

  // Phone: explicit user value ALWAYS wins, even if a prior turn's
  // WhatsApp fallback was already in place. The patient is not
  // locked into a number we inferred. The WhatsApp fallback is only
  // used as a last resort when nothing else is set.
  if (extracted.phone) {
    if (draft.patientPhone !== extracted.phone) {
      draft.patientPhone = extracted.phone
      draft.history.push({ field: "patientPhone", value: extracted.phone, source: "user" })
    }
  } else if (!draft.patientPhone && whatsappFrom.phone) {
    draft.patientPhone = whatsappFrom.phone
    draft.history.push({ field: "patientPhone", value: whatsappFrom.phone, source: "whatsapp" })
  }

  draft.updatedAt = now.toISOString()

  // Decide what to ask next.
  const missing: string[] = []
  if (!draft.patientName) missing.push("name")
  if (!draft.patientPhone) missing.push("phone")
  if (!draft.reason) missing.push("reason")
  if (!draft.preferredDate) missing.push("date")
  if (!draft.preferredTime) missing.push("time")

  const isComplete = missing.length === 0
  const nextPrompt = isComplete
    ? null
    : buildNextPrompt(draft, missing)

  return { draft, nextPrompt, isComplete, shouldClear: false }
}

function buildNextPrompt(draft: AppointmentDraft, missing: string[]): string {
  // Friendly, field-specific prompts. Keep them short and natural.
  const field = missing[0]
  switch (field) {
    case "name":
      return "Sure, I can help you book an appointment. What's your full name?"
    case "phone":
      // We only ask for phone if WhatsApp did not provide one (rare).
      return "Thanks! What phone number should we use to confirm the appointment?"
    case "reason":
      return `Thanks${draft.patientName ? `, ${draft.patientName.split(/\s+/)[0]}` : ""}. What is the reason for your visit?`
    case "date":
      return "Got it. What date would you prefer? You can say 'tomorrow', 'next Monday', or a specific date like 'October 5'."
    case "time":
      return "What time works for you? For example, '4 PM', 'morning', or 'afternoon'."
    default:
      return "Could you provide a bit more detail so I can help you book the appointment?"
  }
}

interface ExtractedFields {
  name?: string
  phone?: string
  reason?: string
  preferredDate?: string
  preferredTime?: string
}

/**
 * Extract appointment-relevant fields from a free-form message.
 *
 * The extractor is deliberately permissive: it captures anything that
 * looks like a name, a phone number, a date, or a time, and leaves
 * the rest to the reason extractor. This is the deterministic
 * counterpart to the AI-based extraction the brief warned against
 * relying on alone — the state machine must work even when the AI
 * returns "I don't understand".
 */
export function extractAllFields(message: string, now: Date = new Date()): ExtractedFields {
  const out: ExtractedFields = {}

  // Split on BOTH newlines AND commas so multi-field single-line
  // messages like "Akarshit, I have a headache" are handled the same
  // way as multi-line messages. The order of fields in the user's
  // message is preserved (we walk segments in order).
  const segments = message
    .split(/[\r\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const line of segments) {
    // Skip segments that are clearly trigger phrases (e.g. "book
    // appointment") so they are not mis-classified as a name.
    if (isAppointmentTrigger(line)) continue

    // 1) Phone number? (digits, possibly with spaces, dashes, parens,
    //    optional +).
    if (!out.phone) {
      const phone = extractPhone(line)
      if (phone) out.phone = phone
    }

    // Date and time can co-exist in the same segment
    // ("tomorrow at 4 PM"). Extract BOTH before continuing, because
    // if we extracted time first and the segment was "tomorrow at
    // 4 PM" the segment would be consumed and the date lost.
    if (!out.preferredDate) {
      const date = extractDate(line, now)
      if (date) out.preferredDate = date
    }
    if (!out.preferredTime) {
      const time = extractTime(line)
      if (time) out.preferredTime = time
    }
    if (out.phone || out.preferredDate || out.preferredTime) {
      // We found a structured field in this segment. The segment is
      // not a name. Move on.
      continue
    }

    // 2) Name? (a line of 2-4 words that look like a person's name —
    //    capitalized first letter, no digits, not a stopword).
    if (!out.name) {
      const name = extractName(line)
      if (name) out.name = name
    }
  }

  // If reason not yet set, anything that looks like a health
  // complaint is a reason. We accept the full original message
  // (minus anything we already classified) as the reason, so a
  // single-line "I have a headache" sets reason without losing
  // information.
  if (!out.reason) {
    out.reason = extractReason(message, out)
  }

  return out
}

function extractPhone(line: string): string | undefined {
  // Strip everything except digits, then validate length.
  const digits = line.replace(/[^\d]/g, "")
  if (digits.length < 7 || digits.length > 15) return undefined
  // Only treat as phone if the line is mostly digits / phone punctuation.
  const phonePunct = line.replace(/[+\d\s\-().]/g, "")
  if (phonePunct.trim().length > 2) return undefined
  return digits
}

function extractTime(line: string): string | undefined {
  const lower = line.toLowerCase().trim()

  // "morning" / "afternoon" / "evening" — map to representative hours.
  if (/^morning$/.test(lower)) return "09:00"
  if (/^afternoon$/.test(lower)) return "14:00"
  if (/^evening$/.test(lower)) return "17:30"

  // "4 PM", "4pm", "4:00 PM", "16:00", "4 p.m."
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

  // Bare 24h "16:00".
  const m24 = line.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
  if (m24) {
    return `${m24[1].padStart(2, "0")}:${m24[2]}`
  }

  return undefined
}

function extractDate(line: string, now: Date): string | undefined {
  const lower = line.toLowerCase().trim()

  // Relative terms. Accept the term anywhere in the segment
  // ("tomorrow at 4 PM" should still match), but only as a whole
  // word so "tomorrowish" does not accidentally match.
  if (/\btoday\b/.test(lower)) return isoDate(now)
  if (/\btomorrow\b/.test(lower)) return isoDate(addDays(now, 1))
  if (/\bday\s+after\s+tomorrow\b/.test(lower)) return isoDate(addDays(now, 2))

  // "next Monday" / "this Friday" / "on Monday".
  const dayMatch = lower.match(/\b(?:(next|this|on)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/)
  if (dayMatch) {
    const wantNext = dayMatch[1] === "next"
    const idx = DAY_NAMES.indexOf(dayMatch[2])
    if (idx >= 0) {
      return isoDate(nextWeekday(now, idx, wantNext))
    }
  }

  // "Oct 5" / "October 5" / "5 Oct" / "5 October"
  const monthDay = lower.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:[,\s]+(\d{4}))?\b/)
  if (monthDay) {
    const month = MONTHS[monthDay[1].slice(0, 3)]
    const day = parseInt(monthDay[2], 10)
    const year = monthDay[3] ? parseInt(monthDay[3], 10) : now.getFullYear()
    return isoDate(new Date(year, (month || 1) - 1, day))
  }

  const dayMonth = lower.match(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:[,\s]+(\d{4}))?\b/)
  if (dayMonth) {
    const day = parseInt(dayMonth[1], 10)
    const month = MONTHS[dayMonth[2].slice(0, 3)]
    const year = dayMonth[3] ? parseInt(dayMonth[3], 10) : now.getFullYear()
    return isoDate(new Date(year, (month || 1) - 1, day))
  }

  // Numeric: "10/5/2026" or "10-5-2026" or "10/5".
  const numeric = lower.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/)
  if (numeric) {
    const a = parseInt(numeric[1], 10)
    const b = parseInt(numeric[2], 10)
    const year = numeric[3] ? parseInt(numeric[3], 10) : now.getFullYear()
    // Assume US ordering: first is month, second is day.
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
      return isoDate(new Date(year, a - 1, b))
    }
  }

  return undefined
}

function extractName(line: string): string | undefined {
  const trimmed = line.trim()
  if (trimmed.length < 2 || trimmed.length > 80) return undefined
  // Reject lines that are obviously something else.
  if (/[!?]/.test(trimmed)) return undefined
  if (/\d/.test(trimmed)) return undefined
  // A "name" is 1-5 words, each starting with a letter, no digits, no
  // stopwords-only lines. Allow apostrophes, hyphens, dots.
  const words = trimmed.split(/\s+/)
  if (words.length < 1 || words.length > 5) return undefined
  const nameShape = /^[A-Za-z][A-Za-z'\-.]{1,30}$/
  if (!words.every((w) => nameShape.test(w))) return undefined
  // At least one word must be 2+ characters (skip single-letter
  // artifacts like "a").
  if (!words.some((w) => w.length >= 2)) return undefined
  // Reject if every word is in the non-name vocabulary, or if the
  // line is a known health-symptom term. Both classes would be
  // misclassified as a person's name otherwise ("headache" would
  // become "Headache").
  const nonNameWords = [
    "book", "appointment", "schedule", "reschedule", "visit", "see",
    "doctor", "checkup", "consultation", "consult", "i", "want", "need",
    "to", "the", "a", "an", "my", "for", "with", "please", "thanks",
    "thank", "you", "hi", "hello", "hey",
  ]
  const lowered = words.map((w) => w.toLowerCase())
  if (lowered.every((w) => nonNameWords.includes(w))) return undefined
  if (lowered.every((w) => SYMPTOM_TRIGGERS.includes(w))) return undefined
  // Capitalize first letter of each word for tidy display.
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
}

function extractReason(message: string, alreadyExtracted?: ExtractedFields): string | undefined {
  // Reason is the leftover text after removing explicit name / phone /
  // time / date tokens. We keep the original phrasing because the
  // user often writes the reason in their own words ("I have a
  // headache", "my tooth hurts", "need a checkup").
  const extracted = alreadyExtracted || {}

  // The reason can contain commas (it's free text), so split on
  // whitespace, newlines, and semicolons — but NOT on commas.
  const segments = message
    .split(/[\r\n;]+/)
    .flatMap((line) => line.split(/,(?=\s)/))
    .map((s) => s.trim())
    .filter(Boolean)

  const reasonParts: string[] = []
  for (const seg of segments) {
    // Strip leading tokens that are clearly not part of the reason:
    // trigger phrases, an extracted phone, time, or date.
    if (isAppointmentTrigger(seg)) continue
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
  // Strip a leading comma or dash that may be left after removing the
  // name token from "Akarshit, I have a headache" → " I have a headache".
  const finalClean = cleaned.replace(/^[,\-\s]+/, "").trim()
  if (!finalClean) return undefined
  // Cap reason length to keep DB rows small.
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
  // target: 0=Sun, 1=Mon, ..., 6=Sat (matches Date.getDay()).
  const current = now.getDay()
  let diff = (target - current + 7) % 7
  if (diff === 0) diff = 7 // "next Monday" means at least 7 days away
  if (wantNext) {
    if (diff < 7) diff += 7
  }
  return addDays(now, diff)
}

// === Public helpers for the receptionist / pipeline ===

export function readDraftFromMetadata(metadata: string | null | undefined): AppointmentDraft | null {
  if (!metadata) return null
  try {
    const parsed = JSON.parse(metadata)
    if (parsed && typeof parsed === "object" && "appointmentDraft" in parsed) {
      const d = (parsed as { appointmentDraft?: AppointmentDraft }).appointmentDraft
      if (d && d.active) return d
    }
  } catch {
    // ignore malformed JSON
  }
  return null
}

export function writeDraftToMetadata(
  metadata: string | null | undefined,
  draft: AppointmentDraft,
): string {
  let base: Record<string, unknown> = {}
  if (metadata) {
    try {
      const parsed = JSON.parse(metadata)
      if (parsed && typeof parsed === "object") base = parsed as Record<string, unknown>
    } catch {
      // overwrite corrupt metadata rather than crash
    }
  }
  if (!draft.active) {
    delete (base as any).appointmentDraft
  } else {
    (base as any).appointmentDraft = draft
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
