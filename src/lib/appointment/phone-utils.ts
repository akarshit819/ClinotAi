/**
 * Phone number normalization and active appointment limits.
 */

export const MAX_ACTIVE_APPOINTMENTS_PER_PHONE = 3
export const ACTIVE_APPOINTMENT_STATUSES = ["pending", "confirmed", "in_progress"] as const

/**
 * Normalizes a phone number to digits only (strips non-digits like spaces, hyphens, parentheses, plus).
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return ""
  return phone.replace(/\D/g, "").trim()
}

/**
 * Returns candidate string variants of a phone number to query existing DB records
 * regardless of whether they were stored with '+', raw spacing, or local 10-digit format.
 */
export function getCandidatePhoneVariants(phone: string): string[] {
  const raw = phone.trim()
  const digits = normalizePhoneNumber(phone)
  if (!digits) return raw ? [raw] : []

  const set = new Set<string>()
  if (raw) set.add(raw)
  set.add(digits)
  set.add(`+${digits}`)

  // If international format with country code (e.g. 918700879401, 14155552671), also add last 10 digits
  if (digits.length > 10) {
    const last10 = digits.slice(-10)
    set.add(last10)
    set.add(`+${last10}`)
  }

  return Array.from(set).filter(Boolean)
}

/**
 * Validates whether a phone number contains a reasonable number of digits (7 to 15 digits).
 */
export function isValidPhoneNumber(phone: string): boolean {
  const digits = normalizePhoneNumber(phone)
  return digits.length >= 7 && digits.length <= 15
}
