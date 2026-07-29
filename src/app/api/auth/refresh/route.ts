import { NextRequest, NextResponse } from "next/server"
import { refreshSession, createTokenCookie, clearCookie } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const cookieHeader = req.headers.get("cookie") || ""
    const match = cookieHeader.match(/refresh_token=([^;]+)/)
    const refreshToken = match ? match[1] : null

    if (!refreshToken) {
      return NextResponse.json({ error: "No refresh token" }, { status: 401 })
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1"
    const userAgent = req.headers.get("user-agent") || ""

    const result = await refreshSession(refreshToken, ip, userAgent)

    if (!result) {
      const response = NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 })
      response.headers.append("Set-Cookie", clearCookie("access_token"))
      response.headers.append("Set-Cookie", clearCookie("refresh_token"))
      return response
    }

    const response = NextResponse.json({
      session: { id: result.sessionId, expiresAt: result.expiresAt },
    })

    response.headers.append("Set-Cookie", createTokenCookie("access_token", result.accessToken, 900, "Lax"))
    response.headers.append("Set-Cookie", createTokenCookie("refresh_token", result.refreshToken, 2592000, "Lax"))

    return response
  } catch {
    return NextResponse.json({ error: "Session refresh failed" }, { status: 500 })
  }
}
