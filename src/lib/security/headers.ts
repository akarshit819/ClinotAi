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

export function getCorsHeaders(allowedOrigins: string[]): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.join(", "),
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  }
}
