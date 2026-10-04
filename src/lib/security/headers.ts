export interface SecurityHeaders {
  [key: string]: string
}

export function getSecurityHeaders(isProduction: boolean): SecurityHeaders {
  return {
    "X-DNS-Prefetch-Control": "off",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-XSS-Protection": "0",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...(isProduction
      ? {
          "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
        }
      : {}),
  }
}

export function getCSPDirectives(isProduction: boolean): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.groq.com https://openrouter.ai",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ]

  return directives.join("; ")
}

export const BOT_USER_AGENT_PATTERNS = [
  /bot/i,
  /crawl/i,
  /spider/i,
  /scrape/i,
  /curl/i,
  /wget/i,
  /python-requests/i,
  /go-http-client/i,
  /java\/[\d.]+/i,
  /ruby/i,
  /scrapy/i,
  /ahrefs/i,
  /semrush/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
]

export function isBot(userAgent: string): boolean {
  return BOT_USER_AGENT_PATTERNS.some((p) => p.test(userAgent))
}

const CORS_BASE_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
}

/**
 * Correct per-origin CORS headers.
 *
 * Never emits a comma-joined multi-origin list: with
 * `Access-Control-Allow-Credentials: true` the ACAO value must be a
 * single origin (or `*` is forbidden with credentials). Disallowed or
 * missing origins get no ACAO/credentials headers (fail-closed).
 */
export function getCorsHeadersForOrigin(
  requestOrigin: string | null | undefined,
  allowedOrigins: string[],
): Record<string, string> {
  if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
    return { ...CORS_BASE_HEADERS }
  }
  return {
    ...CORS_BASE_HEADERS,
    "Access-Control-Allow-Origin": requestOrigin,
    "Access-Control-Allow-Credentials": "true",
  }
}

/**
 * Legacy helper (no request context). Safe fail-closed behavior:
 * emits ACAO only when exactly one origin is configured; otherwise
 * omits ACAO/credentials so callers must use getCorsHeadersForOrigin().
 */
export function getCorsHeaders(allowedOrigins: string[]): Record<string, string> {
  if (allowedOrigins.length === 1) {
    return {
      ...CORS_BASE_HEADERS,
      "Access-Control-Allow-Origin": allowedOrigins[0],
      "Access-Control-Allow-Credentials": "true",
    }
  }
  return { ...CORS_BASE_HEADERS }
}
