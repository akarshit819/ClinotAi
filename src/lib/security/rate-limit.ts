interface RateLimitEntry {
  count: number
  resetAt: number
}

const stores = new Map<string, Map<string, RateLimitEntry>>()

const FIVE_MIN = 300_000
const FIFTEEN_MIN = 900_000
const ONE_HOUR = 3_600_000

setInterval(() => {
  const now = Date.now()
  stores.forEach((store) => {
    store.forEach((entry, key) => {
      if (entry.resetAt <= now) store.delete(key)
    })
  })
}, FIVE_MIN)

export const RATE_LIMITS = {
  login: { window: FIFTEEN_MIN, max: process.env.NODE_ENV === "development" ? 200 : 10 },
  signup: { window: ONE_HOUR, max: process.env.NODE_ENV === "development" ? 100 : 5 },
  chat: { window: FIFTEEN_MIN, max: 200 },
  api: { window: FIFTEEN_MIN, max: process.env.NODE_ENV === "development" ? 500 : 100 },
  emergency: { window: FIVE_MIN, max: 5 },
  csrf: { window: ONE_HOUR, max: 1000 },
  test: { window: FIVE_MIN, max: 20 },
} as const

export type RateLimitScope = keyof typeof RATE_LIMITS

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

function getStore(scope: RateLimitScope): Map<string, RateLimitEntry> {
  if (!stores.has(scope)) {
    stores.set(scope, new Map())
  }
  return stores.get(scope)!
}

export function checkRateLimit(scope: RateLimitScope, key: string): RateLimitResult {
  const config = RATE_LIMITS[scope]
  const store = getStore(scope)
  const now = Date.now()

  const existing = store.get(key)
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + config.window })
    return { allowed: true, remaining: config.max - 1, resetAt: now + config.window }
  }

  existing.count++
  if (existing.count > config.max) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt }
  }

  return { allowed: true, remaining: config.max - existing.count, resetAt: existing.resetAt }
}

export function rateLimitKey(ip: string, identifier?: string): string {
  return identifier ? `${ip}:${identifier}` : ip
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  }
}
