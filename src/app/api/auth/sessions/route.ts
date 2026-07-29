import { NextRequest, NextResponse } from "next/server"
import { extractBearerToken, verifyAccessToken, getActiveSessions, revokeSession } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    const token = extractBearerToken(req)
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const payload = await verifyAccessToken(token)
    if (!payload) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 })
    }

    const sessions = await getActiveSessions(payload.userId)

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        deviceName: s.deviceName,
        lastActiveAt: s.lastActiveAt,
        createdAt: s.createdAt,
        isCurrentSession: s.id === payload.sessionId,
      })),
    })
  } catch {
    return NextResponse.json({ error: "Failed to get sessions" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = extractBearerToken(req)
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const payload = await verifyAccessToken(token)
    if (!payload) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const sessionIdToRevoke = body.sessionId

    if (!sessionIdToRevoke) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 })
    }

    if (sessionIdToRevoke === payload.sessionId) {
      return NextResponse.json({ error: "Cannot revoke current session. Use logout instead." }, { status: 400 })
    }

    await revokeSession(sessionIdToRevoke)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to revoke session" }, { status: 500 })
  }
}
