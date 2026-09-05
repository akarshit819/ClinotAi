const EMERGENCY_PATTERNS = [
  /\b(emergency|urgent|immediately|asap|right away)\b/i,
  /\b(severe|extreme|unbearable|excruciating)\s+(pain|bleeding|swelling|burn)\b/i,
  /\b(heart\s*attack|stroke|choking|not\s*breathing|unconscious|passed\s*out)\b/i,
  /\b(can'?t\s*?breathe|difficulty\s*?breathing|shortness\s*?of\s*?breath)\b/i,
  /\b(heavy\s*?bleeding|uncontrollable\s*?bleeding|gushing)\b/i,
  /\b(suicide|kill\s*?myself|harm\s*?myself|self\s*?harm)\b/i,
  /\b(poison|overdose|OD\b)/i,
  /\b(severe\s*?allergic\s*?reaction|anaphylaxis|anaphylactic)\b/i,
  /\b(compound\s*?fracture|bone\s*?through\s*?skin)\b/i,
]

// IMPORTANT: these regexes are used with .test() against a
// module-level array. A `g` flag makes a regex STATEFUL — `.test()`
// advances `lastIndex` between calls, so the same text can be spam in
// one request and clean in the next depending on how many messages
// were validated before it. That nondeterminism shipped to production
// (a booking prompt containing the word "folloWINg" was classified as
// spam because the prize pattern lacked word boundaries AND the /g
// flag made detection call-order-dependent). Never use /g here.
const SPAM_PATTERNS = [
  /(https?:\/\/[^\s]+)/i,
  /(www\.)[^\s]+/i,
  /\b(buy|sell|cheap|discount|offer|limited|act\s*now|click\s*here)\s*(now|today|only)\b/i,
  // NOTE: Phone numbers and email addresses are intentionally NOT blocked here.
  // Patients legitimately provide their phone and email when booking appointments.
  // The old patterns (/(\+?\d{1,3}[-.\s]?){3,}/ and email regex) have been removed
  // because they caused every appointment slot-answer to be rejected as "spam".
  /\b(free|win|winner|cash|prize|lottery|jackpot)\b/i,
  /[!?]{4,}/,
]

const ABUSE_PATTERNS = [
  /\b(fuck|shit|damn|bitch|asshole|bastard|crap|dick|piss)\b/i,
  /\b(stupid|idiot|dumb|moron|loser|jerk)\b/i,
  /\b(kill\s+(you|yourself|urself)|die|hate\s+you)\b/i,
  /\b(suck|sucks|worst|terrible|useless)\s*(at\s*)?(this|app|you|your)\b/i,
]

const GIBBERISH_THRESHOLD = 0.6

const MEDICAL_AVOID_PATTERNS = [
  /\b(diagnos(e|is)|prescribe|prescription|medication|dosage|dose)\b/i,
  /\b(should\s+I\s*take|what\s*medicine|recommend\s*a\s*drug|is\s*this\s*normal)\b/i,
  /\b(cure|treatment\s*for|how\s*to\s*treat|remedy\s*for)\s*(cancer|diabetes|infection|disease|virus)\b/i,
  /\b(surgery|operation|procedure)\s*(need|required|recommend)\b/i,
  /\b(second\s*opinion|what\s*would\s*you\s*do|do\s*you\s*think)\b/i,
]

const PHONE_PATTERN = /\+?[\d\s\-().]{7,15}/
const NAME_PATTERN = /^[a-zA-Z\s'.-]{2,50}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface GuardrailResult {
  passed: boolean
  action: "allow" | "emergency" | "spam" | "abuse" | "invalid" | "medical_query"
  message?: string
  confidence: number
}

export function gibberishScore(text: string): number {
  const cleaned = text.replace(/\s+/g, "").toLowerCase()
  if (cleaned.length < 4) return 0

  // Repeated single characters ("aaaaaaa", "!!!!!") — strong garbage
  // signal. A run of 5+ of the same char is 0.7 (above the 0.6
  // rejection threshold on its own).
  const repeatedChars = cleaned.match(/(.)\1{4,}/g)
  const repeatedScore = repeatedChars ? repeatedChars.length * 0.7 : 0

  // Vowel-less alphabetic strings of 8+ chars ("xkcdtzvqm") — real
  // keyboard mash almost never contains normal vowel distribution.
  // Normal English NEVER trips this ("whatisyou" has 4/9 vowels).
  //
  // The previous heuristic (keyboard-row run >= 8 + unique-letter
  // ratio > 0.8) was fundamentally broken: the "keyboard" character
  // class is the entire alphabet, so every 8+ letter word matched it,
  // and normal English text reliably has a >0.8 unique-letter ratio —
  // meaning "What is you" / "What are you" (real receptionist
  // questions!) scored 0.8 and were hard-rejected before the AI ran.
  const letters = cleaned.replace(/[^a-z]/g, "")
  let vowellessScore = 0
  if (letters.length >= 8) {
    const vowels = (letters.match(/[aeiou]/g) || []).length
    if (vowels / letters.length < 0.1) vowellessScore = 0.7
  }

  return Math.min(1, repeatedScore + vowellessScore)
}

function isMostlyUppercase(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, "")
  if (letters.length < 5) return false
  return letters.split("").filter((c) => c === c.toUpperCase()).length / letters.length > 0.7
}

export function checkEmergency(text: string): boolean {
  return EMERGENCY_PATTERNS.some((p) => p.test(text))
}

export function checkSpam(text: string): boolean {
  return SPAM_PATTERNS.some((p) => p.test(text))
}

export function checkAbuse(text: string): boolean {
  return ABUSE_PATTERNS.some((p) => p.test(text))
}

export function checkMedicalQuery(text: string): boolean {
  return MEDICAL_AVOID_PATTERNS.some((p) => p.test(text))
}

export function validateInput(text: string): GuardrailResult {
  const trimmed = text.trim()

  if (!trimmed || trimmed.length < 1) {
    return { passed: false, action: "invalid", confidence: 1, message: "I didn't catch that. Could you please repeat your question?" }
  }

  if (trimmed.length > 2000) {
    return { passed: false, action: "invalid", confidence: 1, message: "Your message is quite long. Could you please summarize your question so I can help you better?" }
  }

  const gScore = gibberishScore(trimmed)
  if (gScore > GIBBERISH_THRESHOLD) {
    return { passed: false, action: "invalid", confidence: gScore, message: "I'm having trouble understanding your message. Could you please rephrase your question?" }
  }

  if (checkSpam(trimmed)) {
    return { passed: false, action: "spam", confidence: 0.9 }
  }

  if (checkAbuse(trimmed)) {
    return {
      passed: false,
      action: "abuse",
      confidence: 0.9,
      message: "I'm here to help with healthcare-related questions. Please feel free to ask about our services, appointments, or any clinic information.",
    }
  }

  if (checkEmergency(trimmed)) {
    return { passed: true, action: "emergency", confidence: 1 }
  }

  if (checkMedicalQuery(trimmed)) {
    return {
      passed: true,
      action: "medical_query",
      confidence: 0.8,
    }
  }

  return { passed: true, action: "allow", confidence: 1 }
}

export function extractPatientInfo(text: string): { name?: string; phone?: string; email?: string } {
  const result: { name?: string; phone?: string; email?: string } = {}

  const phoneMatch = text.match(PHONE_PATTERN)
  if (phoneMatch) result.phone = phoneMatch[0].trim()

  const emailMatch = text.match(EMAIL_PATTERN)
  if (emailMatch) result.email = emailMatch[0].toLowerCase().trim()

  const nameIndicators = /\b(my name is|I'm |I am |call me |this is )\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/
  const nameMatch = text.match(nameIndicators)
  if (nameMatch && NAME_PATTERN.test(nameMatch[2])) {
    result.name = nameMatch[2].trim()
  }

  return result
}

export function buildEmergencyResponse(emergencyPhone?: string | null): string {
  const phone = emergencyPhone || "your clinic's emergency number"
  return `I understand this sounds urgent. Please contact our clinic immediately at **${phone}** so we can assist you right away. If this is a life-threatening emergency, please call 911 now.\n\nWould you like me to alert our team about your situation? I can send an urgent notification so someone is ready when you call or arrive.`
}

export function buildMedicalQueryResponse(): string {
  return `I understand you're asking about a medical matter, but as an AI receptionist, I'm not able to provide medical advice, diagnoses, or treatment recommendations. These questions are best answered by a licensed healthcare professional who can examine you in person.\n\nI'd recommend scheduling an appointment with your doctor or contacting our clinic directly. Would you like me to help you book an appointment?`
}
