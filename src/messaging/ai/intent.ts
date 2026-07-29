import type { Intent } from "../types"

const EMERGENCY_KEYWORDS = [
  "emergency", "urgent", "bleeding", "severe pain", "broken", "accident",
  "can't breathe", "unconscious", "heart attack", "stroke", "poison",
  "suicide", "chest pain", "head injury", "allergic reaction",
]

const APPOINTMENT_KEYWORDS = [
  "appointment", "book", "schedule", "reschedule", "cancel my appointment",
  "need to see a doctor", "when can i come in", "availability",
  "available", "booking", "visit",
]

const LEAD_KEYWORDS = [
  "new patient", "interested in", "how much", "pricing", "cost",
  "what services", "do you offer", "looking for a",
]

export function detectIntent(content: string): { intent: Intent; confidence: number } {
  const lower = content.toLowerCase()

  for (const kw of EMERGENCY_KEYWORDS) {
    if (lower.includes(kw)) {
      return { intent: "emergency", confidence: 0.95 }
    }
  }

  for (const kw of APPOINTMENT_KEYWORDS) {
    if (lower.includes(kw)) {
      return { intent: "appointment", confidence: 0.85 }
    }
  }

  for (const kw of LEAD_KEYWORDS) {
    if (lower.includes(kw)) {
      return { intent: "lead", confidence: 0.7 }
    }
  }

  if (lower.length < 5) {
    return { intent: "other", confidence: 0.3 }
  }

  return { intent: "general_question", confidence: 0.6 }
}
