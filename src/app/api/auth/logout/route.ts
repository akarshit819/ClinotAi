import { NextRequest, NextResponse } from "next/server"
import { revokeSession, clearCookie, extractBearerToken, verifyAccessToken } from "@/lib/auth"
import { recordAuditEvent } from "@/lib/security/audit"

export async function POST(req: NextRequest) {
  try {
    const token = extractBearerToken(req)
    let sessionId: string | null = null
    let clinicId = ""
    let userId = ""

    if (token) {
      const payload = await verifyAccessToken(token)
      if (payload) {
        sessionId = payload.sessionId
        clinicId = payload.clinicId
        userId = payload.userId
      }
    }

    if (sessionId) {
      await revokeSession(sessionId)
      await recordAuditEvent({
        action: "logout", clinicId, userId,
        ip: req.headers.get("x-forwarded-for") || "",
        userAgent: req.headers.get("user-agent") || "",
        details: { sessionId }, severity: "info",
      })
    }

    const clearAccess = clearCookie("access_token")
    const clearRefresh = clearCookie("refresh_token")

    const response = NextResponse.json({ success: true })
    response.headers.append("Set-Cookie", clearAccess)
    response.headers.append("Set-Cookie", clearRefresh)
    return response
  } catch {
    const response = NextResponse.json({ success: true })
    response.headers.append("Set-Cookie", clearCookie("access_token"))
    response.headers.append("Set-Cookie", clearCookie("refresh_token"))
    return response
  }
}
