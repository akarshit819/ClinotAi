import { prisma } from "@/lib/db"
import { logger } from "@/lib/logger"

export type AuditAction =
  | "login.success"
  | "login.failure"
  | "signup"
  | "logout"
  | "api_key.create"
  | "api_key.update"
  | "api_key.delete"
  | "api_key.test"
  | "settings.update"
  | "password.change"
  | "password.reset"
  | "knowledge.create"
  | "knowledge.update"
  | "knowledge.delete"
  | "knowledge.import"
  | "lead.create"
  | "lead.update"
  | "appointment.create"
  | "appointment.update"
  | "emergency.create"
  | "conversation.create"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "rate_limit.exceeded"
  | "csrf.invalid"
  | "auth.invalid_token"
  | "auth.forged_token"
  | "spam.detected"
  | "abuse.detected"
  | "prompt_injection.blocked"
  | "prompt_leakage.blocked"
  | "emergency.detected"
  | "medical_query.blocked"

export interface AuditEntry {
  action: AuditAction
  clinicId?: string
  userId?: string
  ip?: string
  userAgent?: string
  details?: Record<string, unknown>
  severity?: "info" | "warning" | "critical"
}

const CURRENT_SESSION: { ip?: string; userAgent?: string } = {}

export function setAuditContext(context: { ip?: string; userAgent?: string }): void {
  CURRENT_SESSION.ip = context.ip
  CURRENT_SESSION.userAgent = context.userAgent
}

/**
 * Key names whose values must never reach the audit log in cleartext.
 * Matched case-insensitively against the key (substring); the value is
 * replaced with "[REDACTED]" while the key is preserved so the shape of
 * the event stays useful. `password` values are dropped entirely
 * (historical behavior preserved).
 */
const SENSITIVE_KEY_PATTERN =
  /passw|secret|token|jwt|api[_-]?key|apikey|authorization|cookie|session[_-]?token|database|postgres|openrouter|whatsapp|waba|wa[_-]?token|meta[_-]|stripe|resend|encrypt|credential|private[_-]?key/i

export function redactSensitiveDetails(details: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(details)) {
    if (/^passw/i.test(key)) continue
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      redacted[key] = "[REDACTED]"
      continue
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      redacted[key] = redactSensitiveDetails(value as Record<string, unknown>)
      continue
    }
    redacted[key] = value
  }
  return redacted
}

export async function recordAuditEvent(entry: AuditEntry): Promise<void> {
  const ip = entry.ip || CURRENT_SESSION.ip || "unknown"
  const userAgent = entry.userAgent || CURRENT_SESSION.userAgent || "unknown"
  const severity = entry.severity || "info"

  const details = redactSensitiveDetails(entry.details || {})

  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        clinicId: entry.clinicId || null,
        userId: entry.userId || null,
        ip,
        userAgent,
        details: JSON.stringify(details),
        severity,
      },
    })
  } catch (error) {
    logger.error("Failed to write audit log", {
      action: entry.action,
      error: error instanceof Error ? error.message : "Unknown",
    })
  }
}

export async function getAuditLogs(params: {
  clinicId?: string
  userId?: string
  action?: AuditAction
  severity?: "info" | "warning" | "critical"
  limit?: number
  offset?: number
}): Promise<{ logs: unknown[]; total: number }> {
  const { clinicId, userId, action, severity, limit = 50, offset = 0 } = params

  const where: Record<string, unknown> = {}
  if (clinicId) where.clinicId = clinicId
  if (userId) where.userId = userId
  if (action) where.action = action
  if (severity) where.severity = severity

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({ where }),
  ])

  return {
    logs: logs.map((l) => ({
      ...l,
      details: l.details ? JSON.parse(l.details) : null,
    })),
    total,
  }
}
