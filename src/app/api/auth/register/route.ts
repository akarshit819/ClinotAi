import { NextRequest, NextResponse } from "next/server"
import { registerClinic, createTokenCookie, createEmailVerificationToken } from "@/lib/auth"
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/security/rate-limit"
import { sanitizeHtml, validateEmail, validateName } from "@/lib/security/sanitize"

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1"
    const userAgent = req.headers.get("user-agent") || ""

    const rlKey = rateLimitKey(ip, "signup")
    const rl = checkRateLimit("signup", rlKey)
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many signup attempts. Try again later." }, {
        status: 429, headers: rateLimitHeaders(rl),
      })
    }

    const body = await req.json()
    const name = sanitizeHtml(body.name || "").trim()
    const email = (body.email || "").toLowerCase().trim()
    const password = body.password || ""
    const clinicName = sanitizeHtml(body.clinicName || "").trim()

    if (!name || name.length < 1) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    if (!validateName(name)) {
      return NextResponse.json({ error: "Name contains invalid characters" }, { status: 400 })
    }
    if (!email || !validateEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 })
    }
    if (!clinicName) {
      return NextResponse.json({ error: "Clinic name is required" }, { status: 400 })
    }

    const result = await registerClinic({ name, email, password, clinicName, ip, userAgent })

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const accessCookie = createTokenCookie("access_token", result.session.accessToken, 900, "Lax")
    const refreshCookie = createTokenCookie("refresh_token", result.session.refreshToken, 2592000, "Lax")

    const response = NextResponse.json({
      user: result.user,
      session: { id: result.session.sessionId, expiresAt: result.session.expiresAt },
    }, { status: 201 })

    response.headers.append("Set-Cookie", accessCookie)
    response.headers.append("Set-Cookie", refreshCookie)

    return response
  } catch (err: any) {
    console.error("Registration error:", err)
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 })
  }
}
