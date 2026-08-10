const ALLOWED_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normalizeEmail(email: string): string {
  return (email || "").trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return ALLOWED_EMAIL.test(email)
}