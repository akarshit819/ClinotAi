/**
 * Outbound message safeguard — the LAST line of defense before a
 * patient-facing reply is stored and queued for WhatsApp delivery.
 *
 * Production incident: an AI reply containing a raw internal payload
 *
 *   {"appointment":{"date":"2026-09-12","time":"16:00","name":"…",
 *    "phone":"phone set","reason":"reason set"}}
 *
 * was sent verbatim to a patient. Internal structured data, tool-call
 * arguments, function payloads, and model reasoning must NEVER reach
 * WhatsApp. This module detects those shapes and replaces the WHOLE
 * message with a safe human fallback (plus an error log) instead of
 * trying to surgically repair model output.
 *
 * Legitimate user-facing text (including plain-language appointment
 * details like "12 September 2026 at 4:00 PM") passes through
 * untouched — only machine-shaped payloads are blocked.
 */

import { logger } from "@/lib/logger"

// Internal placeholder tokens that must never appear in patient text.
// (Legacy draft summaries used "phone set" / "reason set"; the model
// copied them verbatim into its reply.)
const PLACEHOLDER_TOKENS = ["phone set", "reason set"]

export interface SanitizeResult {
  text: string
  blocked: boolean
  reason?: string
}

function containsFencedJson(text: string): boolean {
  return /```(?:json)?\s*\{[\s\S]*?\}\s*```/i.test(text)
}

function containsAppointmentJson(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    /\{\s*"appointment"\s*:/.test(lower) ||
    (/\{\s*"date"\s*:/.test(lower) && /"(preferredDate|patientName|preferredTime)"\s*:/.test(lower)) ||
    (/"tool_calls"\s*:/.test(lower) && /"function"\s*:/.test(lower)) ||
    (/"book_appointment"\s*(,|:)/.test(lower) && /\{\s*"[^"]*"\s*:/.test(lower))
  )
}

function containsPlaceholderTokens(text: string): boolean {
  const lower = text.toLowerCase()
  return PLACEHOLDER_TOKENS.some((t) => lower.includes(t))
}

const SAFE_FALLBACK =
  "Thanks! I've noted your details and our team will confirm shortly. Is there anything else I can help with?"

export function sanitizeOutboundText(
  raw: string,
  context: { conversationId?: string; clinicId?: string } = {},
): SanitizeResult {
  const text = (raw || "").trim()
  if (!text) return { text, blocked: false }

  let reason: string | undefined
  if (containsFencedJson(text)) {
    reason = "fenced_json_payload"
  } else if (containsAppointmentJson(text)) {
    reason = "raw_appointment_json"
  } else if (containsPlaceholderTokens(text)) {
    reason = "internal_placeholder_tokens"
  }

  if (reason) {
    logger.error("[OUTBOUND-SANITIZE] Blocked internal payload from reaching patient", {
      conversationId: context.conversationId,
      clinicId: context.clinicId,
      reason,
      preview: text.slice(0, 160),
    })
    return { text: SAFE_FALLBACK, blocked: true, reason }
  }

  return { text, blocked: false }
}
