import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, rateLimitKey, rateLimitHeaders, type RateLimitScope } from "@/lib/security/rate-limit"
import { getCSPDirectives, getSecurityHeaders } from "@/lib/security/headers"
import { decideCsrf } from "@/lib/security/csrf-check"
import { isProduction } from "@/lib/env"
import { isPublicPath, shouldBypassCsrf } from "@/lib/routing"

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
    // getCSPDirectives() already returns a complete, valid policy string.
    response.headers.set("Content-Security-Policy", getCSPDirectives(true))
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

  const cookieHeader = request.headers.get("cookie") || ""
  const getCookie = (name: string) => {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
    return match ? match[1] : null
  }

  const accessToken = getCookie("access_token")

  if (pathname.startsWith("/api/") && !shouldBypassCsrf(pathname) && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const decision = decideCsrf({
      method,
      isExempt: false,
      // CSRF is a cookie-ambient attack: only enforce the origin check
      // when the request carries cookie auth. Bearer-token (server to
      // server) traffic skips it; webhooks are already exempt above.
      hasCookieAuth: Boolean(accessToken),
      origin: request.headers.get("origin") || "",
      referer: request.headers.get("referer") || "",
      host: request.headers.get("host") || "",
      protocol: request.nextUrl.protocol || "https:",
      appUrl: process.env.NEXT_PUBLIC_APP_URL || "",
    })
    if (decision !== "allow" && decision !== "skip") {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 })
    }
  }

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