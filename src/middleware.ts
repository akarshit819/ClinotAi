import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, rateLimitKey, rateLimitHeaders, type RateLimitScope } from "@/lib/security/rate-limit"
import { getCSPDirectives, getSecurityHeaders } from "@/lib/security/headers"
import { isProduction } from "@/lib/env"
import { isPublicPath, shouldBypassCsrf, ONBOARDING_EXEMPT_PATHS } from "@/lib/routing"

function isMissingOrigin(request: NextRequest): boolean {
  if (!request.headers.get("origin") && !request.headers.get("referer")) return true
  return false
}

function isSameOrigin(request: NextRequest, appUrl: string): boolean {
  const origin = (request.headers.get("origin") || "").replace(/\/+$/, "")
  const referer = (request.headers.get("referer") || "").replace(/\/+$/, "")
  const normalizedAppUrl = appUrl.replace(/\/+$/, "")

  if (normalizedAppUrl && origin.startsWith(normalizedAppUrl)) return true
  if (normalizedAppUrl && referer.startsWith(normalizedAppUrl)) return true

  const host = request.headers.get("host")
  if (host && origin) {
    const protocol = request.nextUrl.protocol || "https:"
    if (origin === `${protocol}//${host}`) return true
  }

  return false
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
    if (!isMissingOrigin(request)) {
      const origin = request.headers.get("origin")
      const referer = request.headers.get("referer")
      if (!isSameOrigin(request, appUrl)) {
        if (appUrl || origin || referer) {
          return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 })
        }
      }
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