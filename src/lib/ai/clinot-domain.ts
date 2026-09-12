/**
 * Clinot strict positive allowlist — the SINGLE source of truth for
 * Clinot's product universe.
 *
 * ARCHITECTURE (not a blacklist, not a prompt):
 *
 *   The application asks ONE question per incoming message:
 *   "Does this message belong to Clinot's explicitly allowed domain?"
 *
 *   Allowed domains (Sections A–G of the product spec):
 *     - reception_conversation  (greetings, thanks, goodbye, short acks)
 *     - appointment             (booking, slots, dates, times, confirm,
 *                                status, reschedule, cancel, availability)
 *     - clinic_information      (name, address, location, directions,
 *                                phone/contact, hours, days, policies)
 *     - doctor_information      (doctors, specialties, availability)
 *     - clinic_service          (services offered, pricing, insurance)
 *     - patient_clinic_communication (appointment help, booking needs,
 *                                contact details, next steps)
 *     - health_receptionist     (symptoms via existing medical-safety
 *                                receptionist policy)
 *     - emergency               (life-safety override)
 *
 *   Anything else => "outside" => deterministic redirect, and the
 *   general AI provider MUST NOT be called.
 *
 * DESIGN NOTES:
 *   - POSITIVE patterns only. There is intentionally NO list of
 *     forbidden topics, NO python/code blacklist, NO hardcoded
 *     single-example filter. Unknown paraphrases fail CLOSED
 *     (denied by default) instead of failing open.
 *   - No `g` flag on any regex (stateful .test() nondeterminism).
 *   - This module is TEXT-ONLY and dependency-free so both the
 *     guardrail layer (lib) and the router layer (messaging) can
 *     share it without import cycles. Draft/state-aware allowance
 *     (slot answers, confirmations) lives in the route classifier,
 *     which runs BEFORE this text check for active drafts.
 */

export const CLINOT_REDIRECT =
  "I'm Clinot, the clinic's virtual assistant. I can help with appointments, clinic information, doctors, services, timings, and other clinic-related questions. How can I help you?"

export type ClinotDomain =
  | "reception_conversation"
  | "appointment"
  | "clinic_information"
  | "doctor_information"
  | "clinic_service"
  | "patient_clinic_communication"
  | "health_receptionist"
  | "emergency"
  | "outside"

export interface ClinotDomainDecision {
  allowed: boolean
  domain: ClinotDomain
  reason: string
}

// === A. Natural receptionist conversation ================================

const RECEPTION_PATTERNS: RegExp[] = [
  /^(hi|hello|hey|hola|namaste|good\s+(morning|afternoon|evening)|greetings|howdy|yo)\b/i,
  /^(thanks|thank\s+you|appreciate|grateful|ty|thx)\b/i,
  /^(bye|goodbye|see\s+you|good\s+night|talk\s+to\s+you\s+later|have\s+a\s+great\s+day|talk\s+later|cya)\b/i,
  /^(ok|okay|sure|alright|fine|cool|great|awesome|got\s+it|understood|noted)\b/i,
  /^(yes|yeah|yep|yup|no|nope|nah)\b[.!?]*$/i,
  // Bare short help-seeking ("help", "help me"). End-anchored so
  // longer requests ("help me with code") stay outside.
  /^(help|help\s+me|help\s+please|need\s+help)\s*[.!?]*$/i,
  // Receptionist identity ("What are you" in patient phrasing). The AI
  // answers these from its Clinot system prompt. Distinct from
  // extraction ("who created/trained you", "what model are you"),
  // which matches NO allowlist entry and stays outside.
  /\b(who\s+are\s+you|what\s+are\s+you|what\s+is\s+you)\b/i,
]

// === B + F. Appointment management / patient-clinic communication =========

const APPOINTMENT_PATTERNS: RegExp[] = [
  /\b(appointment|booking|visit|consult|consultation|checkup|check-up|session|slot)\b/i,
  // NOTE: bare "book"/"schedule" alone is NOT allowlisted — "book" is
  // also a noun ("Summarize the book 1984"). The verb sense requires
  // an appointment object. Standalone reschedule/cancel verbs are
  // appointment-specific enough to allow on their own.
  /\b(reschedule|re-schedule|cancellation|cancelled|cancelling|postpone|prepone|cancel)\b/i,
  /\b(book|schedule)\b.*\b(appointment|booking|visit|consult|consultation|checkup|session|slot)\b/i,
  /\b(available|availability|open\s+slots?|free\s+slots?)\b/i,
  /\b(what\s+times?\s+are\s+available|show\s+me\b.*\b(available|slots?|times?)\b|when\s+are\s+you\s+(free|available))\b/i,
  /\b(choose\s+for\s+me|decide\s+for\s+me|pick\s+for\s+me|you\s+(choose|decide|pick)|whatever(\s+is)?\s+(available|free)|earliest\s+available|first\s+available|soonest\s+available)\b/i,
  /\b(confirm|confirmation|confirmed|is\s+it\s+confirmed|appointment\s+status|booking\s+status)\b/i,
  /\b(today|tomorrow|day\s+after\s+tomorrow)\b/i,
  /\b(next|this|on)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  /\b\d{1,2}[\/\-]\d{1,2}(\s*[\/\-]\s*\d{2,4})?\b/,
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i,
  /\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)\b/i,
  /\b([01]?\d|2[0-3]):[0-5]\d\b/,
  /\b(half\s+past|quarter\s+(past|to))\s+\d{1,2}\b/i,
  /\b(morning|afternoon|evening|noon|midnight)\b/i,
  /\b(my\s+(appointment|booking|visit)|change\s+(my|the)\s+(time|date|appointment)|move\s+(my|the)\s+(appointment|booking))\b/i,
  /\b(what\s+(information|details)\b.*\b(need|book)|how\b.*\b(book|schedule|appointment)|next\s+steps?)\b/i,
  /^\d{1,2}$/,
]

// === C. Clinic information ===============================================

const CLINIC_INFO_PATTERNS: RegExp[] = [
  /\b(where\s+(is|are)\s+(you|the\s+clinic|your\s+clinic|the\s+office|your\s+office))\b/i,
  /\b(what\s+is\s+(your|the)\s+address)\b/i,
  /\b(how\s+(do\s+i|can\s+i|to)\s+(get|reach|find))\b.*\b(there|clinic|office|hospital|you)\b/i,
  /\b(your\s+location|clinic\s+location|hospital\s+location|address|located\s+in|where\s+to\s+come|find\s+you|located\s+at|directions?|nearest\s+(clinic|hospital)|parking)\b/i,
  /\b(what\s+time|what\s+are\s+(your|the)\s+(hours|timings|opening\s+hours|business\s+hours)|when\s+(do\s+you|are\s+you)\s+open|when\s+do\s+you\s+close|are\s+you\s+open|opening\s+times|business\s+hours|working\s+hours|clinic\s+hours|office\s+hours|closing\s+(time|hours))\b/i,
  /\b(open\s+(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)|days?\s+of\s+operation|working\s+days?)\b/i,
  /\b(how\s+(do\s+i|can\s+i|to)\s+(contact|reach|call|email))\b/i,
  /\b(your\s+phone|phone\s+number|contact\s+(you|the\s+clinic|number|details|information)|email\s+address|how\s+to\s+reach\s+you)\b/i,
  /\b(clinic|hospital|office)\b.*\b(name|phone|address|hours|timings|location|contact|policy|policies|facilities|facilities)\b/i,
  /\b(general\s+clinic\s+policies|clinic\s+policies|your\s+policies)\b/i,
  // Bare universe anchors: any message explicitly mentioning the
  // clinic/hospital is plausibly clinic-related and stays inside for
  // the AI to answer from clinic data (or the existing fallback).
  /\b(clinic|clinics|hospital|hospitals)\b/i,
]

// === F. Patient contact provision (booking contact details) ==============
// Patients provide phone/email while booking ("my phone is ...").
// These must never be denied: phone handling is core appointment
// functionality, and the spam guardrail already ignores them.

const CONTACT_PROVISION_PATTERNS: RegExp[] = [
  /\b(my\s+(email|phone|number|mobile|cell)\b)/i,
  /[^\s@]+@[^\s@]+\.[^\s@]+/,
  /\d{7,}/,
]

// === D. Doctor / staff information =======================================

const DOCTOR_PATTERNS: RegExp[] = [
  /\b(doctor|doctors|dentist|dentists|dr\.?|physician|specialist|surgeon|practitioner|staff|provider)\b/i,
  /\b(which\s+doctor|what\s+doctor|available\s+doctors?|doctor\s+availability|doctor\s+names?|who\s+is\s+(the\s+)?(doctor|dentist))\b/i,
  /\b(which\s+(department|doctor)\s+handles)\b/i,
]

// === E. Clinic services (incl. pricing + insurance — clinic-related) =====

const SERVICE_PATTERNS: RegExp[] = [
  /\b(what\s+services|what\s+do\s+you\s+(do|offer|provide)|services\s+(you\s+)?(offer|provide)|list\s+of\s+services|do\s+you\s+(do|offer|provide|have))\b/i,
  /\b(treatment|treatments|procedure|procedures|department|facility|facilities)\b/i,
  /\b(cleaning|whitening|filling|fillings|extraction|root\s+canal|implant|implants|braces|check-?up|checkup|crown|denture)\b/i,
  /\b(price|prices|pricing|cost|costs|how\s+much|fee|fees|charge|charges|rate|rates|payment|afford)\b/i,
  /\b(insurance|insured|coverage|covered|copay|co-?pay|deductible|in-?network|out-?of-?network|delta\s+dental|cigna|aetna|metlife|united\s+healthcare|blue\s*cross|blue\s*shield)\b/i,
  /\b(whether\s+(the\s+clinic|you)\s+provides?|do\s+you\s+treat|can\s+you\s+treat)\b/i,
]

// === G. Health / symptom (receptionist-safe handoff) =====================
// These are ALLOWED so they flow into the existing medical-safety
// receptionist pipeline — never denied as "outside".

const HEALTH_PATTERNS: RegExp[] = [
  /\b(i\s+have|i've\s+got|i\s+am\s+having|i\s+am\s+feeling|i'm\s+having|i'm\s+feeling)\s+(a\s+)?(headache|toothache|tooth\s+pain|head\s+ache|migraine|backache|stomachache|back\s+pain|neck\s+pain|jaw\s+pain|ear\s+pain)\b/i,
  /\b(my\s+(head|tooth|teeth|gum|gums|jaw|back|ear|throat|stomach|neck|chest|leg|knee|shoulder|hand|foot)\s+(hurts?|ache|aches|pain))\b/i,
  /\b(i\s+have\s+(a\s+)?([a-z]+\s+)?(pain|ache|sore|swelling|fever|cough|cold|flu|nausea))\b/i,
  /\b(pain\s+in\s+(my\s+)?(back|head|tooth|teeth|gum|gums|jaw|ear|throat|neck|stomach|chest|leg|knee))\b/i,
  /\b(i\s+am\s+feeling\s+(sick|unwell|ill|nauseous|dizzy))\b/i,
  /\b(my\s+(gums|tooth|teeth)\s+(are|is)\s+(bleeding|swollen|hurting))\b/i,
  /\b(what\s+(should\s+i\s+do|can\s+i\s+do|to\s+do)\s+(for|about)\s+(a|my)\s+(headache|toothache|pain|ache|fever|cold|back\s+pain))\b/i,
  /\b(i\s+have\s+swelling|i\s+have\s+bleeding|i\s+have\s+a\s+problem\s+with\s+my\s+teeth)\b/i,
  /\b(i\s+have\s+(a\s+)?problem\s+with\s+my\s+teeth)\b/i,
  /\b(my\s+teeth\s+(are|is)\s+hurting|my\s+tooth\s+is\s+hurting\s+badly)\b/i,
  /\b(pain|pains|hurts?|aching?|aches?|sore|swelling|swollen|fever|feeling\s+sick|feel\s+sick|nausea|dizzy|bleeding|symptom|discomfort|injur(?:y|ed)|stiff)\b/i,
  /\b(diagnos(e|is)|prescribe|prescription|medication|dosage|dose|should\s+i\s*take|what\s*medicine|second\s*opinion)\b/i,
]

// === Emergency (always allowed, handled by life-safety path) =============

const EMERGENCY_PATTERNS: RegExp[] = [
  /\b(emergency|urgent|immediately|asap|right away)\b/i,
  /\b(severe|extreme|unbearable|excruciating)\s+(pain|bleeding|swelling|burn)\b/i,
  /\b(heart\s*attack|stroke|choking|not\s*breathing|unconscious|passed\s*out)\b/i,
  /\b(can'?t\s*?breathe|difficulty\s*?breathing|shortness\s*?of\s*?breath)\b/i,
  /\b(heavy\s*?bleeding|uncontrollable\s*?bleeding|gushing)\b/i,
  /\b(suicide|kill\s*?myself|harm\s*?myself|self\s*?harm)\b/i,
  /\b(poison|overdose)\b/i,
  /\b(severe\s*?allergic\s*?reaction|anaphylaxis|anaphylactic)\b/i,
]

function matchesAny(patterns: RegExp[], text: string): boolean {
  return patterns.some((re) => re.test(text))
}

/**
 * TEXT-ONLY positive allowlist check.
 *
 * Returns true ONLY when the message text itself belongs to one of
 * Clinot's explicitly allowed domains. Everything else returns
 * false (outside). Draft/state-aware short answers are handled by
 * the route classifier before this check; this function is the
 * fail-closed second line used by guardrails + router fallback.
 */
export function isClinotAllowedText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.length > 2000) return false
  if (matchesAny(EMERGENCY_PATTERNS, trimmed)) return true
  if (matchesAny(RECEPTION_PATTERNS, trimmed)) return true
  if (matchesAny(APPOINTMENT_PATTERNS, trimmed)) return true
  if (matchesAny(CLINIC_INFO_PATTERNS, trimmed)) return true
  if (matchesAny(CONTACT_PROVISION_PATTERNS, trimmed)) return true
  if (matchesAny(DOCTOR_PATTERNS, trimmed)) return true
  if (matchesAny(SERVICE_PATTERNS, trimmed)) return true
  if (matchesAny(HEALTH_PATTERNS, trimmed)) return true
  return false
}

export function classifyClinotDomainText(text: string): ClinotDomainDecision {
  const trimmed = text.trim()
  if (!trimmed) return { allowed: false, domain: "outside", reason: "empty_message" }
  if (trimmed.length > 2000) return { allowed: false, domain: "outside", reason: "message_too_long" }
  if (matchesAny(EMERGENCY_PATTERNS, trimmed))
    return { allowed: true, domain: "emergency", reason: "emergency_vocabulary" }
  if (matchesAny(RECEPTION_PATTERNS, trimmed))
    return { allowed: true, domain: "reception_conversation", reason: "reception_vocabulary" }
  if (matchesAny(APPOINTMENT_PATTERNS, trimmed))
    return { allowed: true, domain: "appointment", reason: "appointment_vocabulary" }
  if (matchesAny(CLINIC_INFO_PATTERNS, trimmed))
    return { allowed: true, domain: "clinic_information", reason: "clinic_information_vocabulary" }
  if (matchesAny(CONTACT_PROVISION_PATTERNS, trimmed))
    return { allowed: true, domain: "patient_clinic_communication", reason: "contact_provision_vocabulary" }
  if (matchesAny(DOCTOR_PATTERNS, trimmed))
    return { allowed: true, domain: "doctor_information", reason: "doctor_vocabulary" }
  if (matchesAny(SERVICE_PATTERNS, trimmed))
    return { allowed: true, domain: "clinic_service", reason: "service_vocabulary" }
  if (matchesAny(HEALTH_PATTERNS, trimmed))
    return { allowed: true, domain: "health_receptionist", reason: "health_receptionist_vocabulary" }
  return { allowed: false, domain: "outside", reason: "outside_clinot_domain" }
}
