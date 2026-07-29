import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, rateLimitKey, rateLimitHeaders, type RateLimitScope } from "@/lib/security/rate-limit"
import { getCSPDirectives, getSecurityHeaders } from "@/lib/security/headers"
import { isProduction, getEnv } from "@/lib/env"

const PUBLIC_PATHS = [
  "/", "/login", "/signup", "/_next", "/favicon.ico", "/robots.txt", "/sitemap.xml",
  "/manifest.webmanifest", "/verify-email", "/api/health", "/api/webhooks",
  "/api/auth/login", "/api/auth/register", "/api/auth/forgot-password", "/api/auth/reset-password",
  "/api/chat", "/api/widget", "/api/checkout",
]

const ONBOARDING_EXEMPT_PATHS = ["/api/onboarding", "/api/auth/logout", "/api/auth/me", "/api/auth/refresh"]

const CSRF_EXEMPT_PATHS = ["/api/auth/login", "/api/auth/register", "/api/auth/forgot-password", "/api/auth/reset-password", "/api/chat", "/api/widget", "/api/webhooks", "/api/checkout"]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

function shouldBypassCsrf(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.some((p) => pathname.startsWith(p))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const method = request.method
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "127.0.0.1"
  const response = NextResponse.next()

  const securityHeaders = getSecurityHeaders(isProduction())
  for (const [key, value] of Object.entries(securityHeaders)) {
    if (value) response.headers.set(key, value)
  }

  response.headers.set("X-Robots-Tag", "noindex, nofollow")

  if (isProduction()) {
    const csp = getCSPDirectives(isProduction())
    response.headers.set("Content-Security-Policy", Object.entries(csp).map(([k, v]) => `${k} ${v}`).join("; "))
  }

  if (method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: response.headers })
  }

  const rateLimitScopes: Record<string, string> = {
    "/api/auth/login": "login",
    "/api/auth/register": "signup",
    "/api/chat": "chat",
  }

  const scope = Object.entries(rateLimitScopes).find(([path]) => pathname.startsWith(path))?.[1] as RateLimitScope | undefined
  if (scope) {
    const rl = checkRateLimit(scope, rateLimitKey(ip, scope))
    if (!rl.allowed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) })
      }
    }
    for (const [key, value] of Object.entries(rateLimitHeaders(rl))) {
      response.headers.set(key, value)
    }
  }

  if (pathname.startsWith("/api/") && !shouldBypassCsrf(pathname) && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrfToken = request.headers.get("x-csrf-token")
    const origin = request.headers.get("origin")
    const referer = request.headers.get("referer")
    const appUrl = getEnv("NEXT_PUBLIC_APP_URL")
    if (origin && !origin.startsWith(appUrl) && !referer?.startsWith(appUrl)) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 })
    }
  }

  const cookieHeader = request.headers.get("cookie") || ""
  const getCookie = (name: string) => {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
    return match ? match[1] : null
  }

  const accessToken = getCookie("access_token")

  if (pathname.startsWith("/api/") || pathname.startsWith("/dashboard")) {
    if (!isPublicPath(pathname) && !pathname.startsWith("/api/webhooks")) {
      if (!accessToken) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Authentication required" }, { status: 401 })
        }
        return NextResponse.redirect(new URL("/login", request.url))
      }
    }
  }

  if (pathname.startsWith("/dashboard") && !ONBOARDING_EXEMPT_PATHS.some((p) => pathname.startsWith(p))) {
    response.headers.set("x-access-token", accessToken || "")
  }

  const userAgent = request.headers.get("user-agent") || ""
  const botPattern = /bot|crawler|spider|scraper|curl|wget|python|go-http|java|httpclient/i
  if (pathname.startsWith("/api/chat") && botPattern.test(userAgent)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
}
