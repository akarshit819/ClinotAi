import { logger } from "@/lib/logger"

const DEV_JWT_SECRET = "clinot-ai-dev-secret-key-change-in-production"
const DEV_ENCRYPTION_KEY = "clinot-ai-encryption-key-change-in-production-32bytes"

function isProduction(): boolean {
  return process.env.NODE_ENV === "production"
}

function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development"
}

export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value!
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    if (isProduction()) {
      throw new Error("JWT_SECRET is required in production. Generate a random 32+ character string.")
    }
    logger.warn("JWT_SECRET not set — using development default. Set JWT_SECRET env var for production.")
    return DEV_JWT_SECRET
  }
  if (secret.length < 32) {
    if (isProduction()) {
      throw new Error(`JWT_SECRET is only ${secret.length} characters. Use at least 32 characters.`)
    }
    logger.warn(`JWT_SECRET is only ${secret.length} characters. Use 32+ characters for production.`)
  }
  return secret
}

export function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    if (isProduction()) {
      throw new Error("ENCRYPTION_KEY is required in production. Generate a random 32+ character string.")
    }
    logger.warn("ENCRYPTION_KEY not set — using development default. Set ENCRYPTION_KEY env var for production.")
    return DEV_ENCRYPTION_KEY
  }
  if (key.length < 32) {
    if (isProduction()) {
      throw new Error(`ENCRYPTION_KEY is only ${key.length} characters. Use at least 32 characters.`)
    }
    logger.warn(`ENCRYPTION_KEY is only ${key.length} characters. Use 32+ characters for production.`)
  }
  return key
}

export function getCsrfSecret(): string {
  const secret = process.env.CSRF_SECRET
  if (!secret) {
    if (isProduction()) {
      throw new Error("CSRF_SECRET is required in production. Generate a random 32+ character string.")
    }
    logger.warn("CSRF_SECRET not set — using JWT_SECRET as fallback. Set CSRF_SECRET env var for production.")
    return getJwtSecret()
  }
  if (secret.length < 32) {
    if (isProduction()) {
      throw new Error(`CSRF_SECRET is only ${secret.length} characters. Use at least 32 characters.`)
    }
    logger.warn(`CSRF_SECRET is only ${secret.length} characters. Use 32+ characters for production.`)
  }
  return secret
}

export function getRedisUrl(): string {
  return process.env.REDIS_URL || ""
}

export { isDevelopment, isProduction }

export function validateProductionSecrets(): void {
  if (!isProduction()) return

  const errors: string[] = []

  // JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    errors.push("JWT_SECRET is required in production. Generate a random 32+ character string.")
  } else if (jwtSecret.length < 32) {
    errors.push(`JWT_SECRET is only ${jwtSecret.length} characters. Use at least 32 characters.`)
  }

  // ENCRYPTION_KEY
  const encryptionKey = process.env.ENCRYPTION_KEY
  if (!encryptionKey) {
    errors.push("ENCRYPTION_KEY is required in production. Generate a random 32+ character string.")
  } else if (encryptionKey.length < 32) {
    errors.push(`ENCRYPTION_KEY is only ${encryptionKey.length} characters. Use at least 32 characters.`)
  }

  // CSRF_SECRET
  const csrfSecret = process.env.CSRF_SECRET
  if (!csrfSecret) {
    errors.push("CSRF_SECRET is required in production. Generate a random 32+ character string.")
  } else if (csrfSecret.length < 32) {
    errors.push(`CSRF_SECRET is only ${csrfSecret.length} characters. Use at least 32 characters.`)
  }

  // DATABASE_URL
  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is required in production.")
  }

  // META_APP_SECRET (for WhatsApp/Facebook)
  if (!process.env.META_APP_SECRET) {
    errors.push("META_APP_SECRET is required in production for WhatsApp/Facebook integration.")
  }

  // WA_WEBHOOK_SECRET
  if (!process.env.WA_WEBHOOK_SECRET) {
    errors.push("WA_WEBHOOK_SECRET is required in production for WhatsApp webhook verification.")
  }

  // STRIPE_SECRET_KEY
  if (!process.env.STRIPE_SECRET_KEY) {
    errors.push("STRIPE_SECRET_KEY is required in production for billing.")
  }

  // WhatsApp credentials (required for WhatsApp integration)
  if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_WABA_ID) {
    logger.warn("WhatsApp credentials (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_WABA_ID) not all set — WhatsApp integration will be disabled.")
  }

  // Optional but recommended for production
  const optionalWarnings: string[] = []
  if (!process.env.NEXT_PUBLIC_APP_URL) optionalWarnings.push("NEXT_PUBLIC_APP_URL")
  if (!process.env.OPENROUTER_API_KEY) optionalWarnings.push("OPENROUTER_API_KEY (AI provider — the single LLM provider)")
  if (!process.env.STRIPE_WEBHOOK_SECRET) optionalWarnings.push("STRIPE_WEBHOOK_SECRET")

  if (optionalWarnings.length > 0) {
    logger.warn(`Optional production environment variables not set: ${optionalWarnings.join(", ")}`)
  }

  if (errors.length > 0) {
    const message = "Missing or invalid required production environment variables:\n" + errors.map((e) => `  - ${e}`).join("\n")
    throw new Error(message)
  }

  logger.info("All required production environment variables validated successfully.")
}
