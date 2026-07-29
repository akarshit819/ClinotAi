import { NextRequest, NextResponse } from "next/server"
import { authenticateUser, createTokenCookie } from "@/lib/auth"
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/security/rate-limit"

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1"
    const userAgent = req.headers.get("user-agent") || ""

    const rlKey = rateLimitKey(ip, "login")
    const rl = checkRateLimit("login", rlKey)
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many login attempts. Try again later." }, {
        status: 429, headers: rateLimitHeaders(rl),
      })
    }

    const body = await req.json()
    const email = (body.email || "").toLowerCase().trim()
    const password = body.password || ""
    const rememberMe = body.rememberMe === true

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    const result = await authenticateUser(email, password, ip, userAgent, rememberMe)

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const accessMaxAge = 900
    const refreshMaxAge = rememberMe ? 7776000 : 2592000
    const accessCookie = createTokenCookie("access_token", result.session.accessToken, accessMaxAge, "Lax")
    const refreshCookie = createTokenCookie("refresh_token", result.session.refreshToken, refreshMaxAge, "Lax")

    const response = NextResponse.json({
      user: result.user,
      session: { id: result.session.sessionId, expiresAt: result.session.expiresAt },
    })

    response.headers.append("Set-Cookie", accessCookie)
    response.headers.append("Set-Cookie", refreshCookie)

    return response
  } catch (err: any) {
    console.error("Login error:", err)
    return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 })
  }
}
