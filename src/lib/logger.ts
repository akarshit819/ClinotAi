type LogLevel = "info" | "warn" | "error" | "debug"

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const PII_PATTERNS = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[EMAIL]" },
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: "[PHONE]" },
  { pattern: /\b(?:sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9]{20,})\b/g, replacement: "[API_KEY]" },
  { pattern: /"token":"[^"]+"/g, replacement: '"token":"[JWT]"' },
  { pattern: /"password":"[^"]+"/g, replacement: '"password":"[REDACTED]"' },
  { pattern: /"apiKey":"[^"]+"/g, replacement: '"apiKey":"[REDACTED]"' },
  { pattern: /\b\d{16}\b/g, replacement: "[CC_NUMBER]" },
]

function sanitizePII(data: unknown): unknown {
  if (typeof data === "string") {
    let sanitized = data
    for (const { pattern, replacement } of PII_PATTERNS) {
      sanitized = sanitized.replace(pattern, replacement)
    }
    return sanitized
  }
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        let sanitizedValue = value
        for (const { pattern, replacement } of PII_PATTERNS) {
          sanitizedValue = sanitizedValue.replace(pattern, replacement)
        }
        sanitized[key] = sanitizedValue
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = sanitizePII(value)
      } else {
        sanitized[key] = value
      }
    }
    return sanitized
  }
  return data
}

function shouldLog(level: LogLevel): boolean {
  const current = (process.env.LOG_LEVEL ?? "info") as LogLevel
  return LOG_LEVELS[level] >= LOG_LEVELS[current]
}

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString()
  if (meta !== undefined) {
    const sanitized = sanitizePII(meta)
    const metaStr = JSON.stringify(sanitized)
    return `[${timestamp}] [${level.toUpperCase()}] ${message} ${metaStr}`
  }
  return `[${timestamp}] [${level.toUpperCase()}] ${message}`
}

function log(level: LogLevel, message: string, meta?: unknown): void {
  if (!shouldLog(level)) return
  const formatted = formatMessage(level, message, meta)
  switch (level) {
    case "error":
      console.error(formatted)
      break
    case "warn":
      console.warn(formatted)
      break
    case "debug":
      if (process.env.NODE_ENV !== "production") console.debug(formatted)
      break
    default:
      console.log(formatted)
  }
}

export const logger = {
  info: (message: string, meta?: unknown) => log("info", message, meta),
  warn: (message: string, meta?: unknown) => log("warn", message, meta),
  error: (message: string, meta?: unknown) => log("error", message, meta),
  debug: (message: string, meta?: unknown) => log("debug", message, meta),
}
