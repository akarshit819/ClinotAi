const STRIP_HTML = /<[^>]*>/g
const STRIP_SCRIPT = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi
const STRIP_EVENTS = /\son\w+\s*=\s*"[^"]*"/gi
const STRIP_JAVASCRIPT = /javascript\s*:/gi
const STRIP_DANGEROUS_PROTOCOLS = /^(javascript|data|vbscript):/i

const ALLOWED_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const ALLOWED_PHONE = /^[\d\s\-().+]{7,20}$/
const ALLOWED_NAME = /^[a-zA-ZÀ-ÿ\s'.-]{1,100}$/

export function sanitizeHtml(input: string): string {
  return input
    .replace(STRIP_SCRIPT, "")
    .replace(STRIP_HTML, "")
    .replace(STRIP_EVENTS, "")
    .replace(STRIP_JAVASCRIPT, "")
    .trim()
}

export function stripHtml(input: string): string {
  return input.replace(STRIP_HTML, "").trim()
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export function validateEmail(email: string): boolean {
  return ALLOWED_EMAIL.test(email)
}

export function validatePhone(phone: string): boolean {
  return ALLOWED_PHONE.test(phone)
}

export function validateName(name: string): boolean {
  return ALLOWED_NAME.test(name.trim())
}

export function sanitizeAndTruncate(input: string, maxLength = 2000): string {
  return sanitizeHtml(input).slice(0, maxLength)
}

export function stripAndTruncate(input: string, maxLength = 2000): string {
  return stripHtml(input).slice(0, maxLength)
}

export function stripDangerousProtocols(input: string): string {
  return input.replace(STRIP_DANGEROUS_PROTOCOLS, "")
}

export function sanitizeFilePath(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 255)
}

export function validateContentType(mime: string, allowed: string[]): boolean {
  return allowed.includes(mime.toLowerCase())
}
