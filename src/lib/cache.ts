const cacheStore = new Map<string, { data: unknown; expiresAt: number }>()

const FIVE_SECONDS = 5000
const THIRTY_SECONDS = 30000
const ONE_MINUTE = 60000
const FIVE_MINUTES = 300000

setInterval(() => {
  const now = Date.now()
  cacheStore.forEach((entry, key) => {
    if (entry.expiresAt <= now) cacheStore.delete(key)
  })
}, THIRTY_SECONDS)

export function getCached<T>(key: string): T | null {
  const entry = cacheStore.get(key)
  if (!entry || entry.expiresAt <= Date.now()) {
    cacheStore.delete(key)
    return null
  }
  return entry.data as T
}

export function setCache<T>(key: string, data: T, ttl = FIVE_SECONDS): void {
  cacheStore.set(key, { data, expiresAt: Date.now() + ttl })
}

export function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = FIVE_SECONDS,
): Promise<T> {
  const cached = getCached<T>(key)
  if (cached !== null) return Promise.resolve(cached)
  return fetcher().then((data) => {
    setCache(key, data, ttl)
    return data
  })
}

export function getCacheKey(...parts: string[]): string {
  return parts.join(":")
}

export function getDashboardCacheTTL(): number {
  return THIRTY_SECONDS
}

export function getAnalyticsCacheTTL(): number {
  return ONE_MINUTE
}

export function getSettingsCacheTTL(): number {
  return FIVE_MINUTES
}
