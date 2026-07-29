import { NextRequest, NextResponse } from "next/server"
import { extractBearerToken, verifyAccessToken, hashPassword, comparePassword, checkPasswordStrength, revokeAllUserSessions, createTokenCookie } from "@/lib/auth"
import { recordAuditEvent } from "@/lib/security/audit"
import { prisma } from "@/lib/db"

export async function POST(req: NextRequest) {
  try {
    const token = extractBearerToken(req)
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const payload = await verifyAccessToken(token)
    if (!payload) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 })
    }

    const body = await req.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current password and new password are required" }, { status: 400 })
    }

    const strength = checkPasswordStrength(newPassword)
    if (!strength.valid) {
      return NextResponse.json({ error: strength.message }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const valid = await comparePassword(currentPassword, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
    }

    const newHash = await hashPassword(newPassword)

    await prisma.user.update({
      where: { id: payload.userId },
      data: { passwordHash: newHash, passwordChangedAt: new Date() },
    })

    await revokeAllUserSessions(payload.userId, payload.sessionId)

    await recordAuditEvent({
      action: "password.change", clinicId: payload.clinicId, userId: payload.userId,
      ip: req.headers.get("x-forwarded-for") || "",
      userAgent: req.headers.get("user-agent") || "",
      details: { sessionId: payload.sessionId }, severity: "info",
    })

    return NextResponse.json({ success: true, message: "Password changed successfully. Other sessions have been terminated." })
  } catch {
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 })
  }
}
