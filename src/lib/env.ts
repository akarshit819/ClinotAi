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
  return process.env.CSRF_SECRET || getJwtSecret()
}

export function getRedisUrl(): string {
  return process.env.REDIS_URL || ""
}

export { isDevelopment, isProduction }
