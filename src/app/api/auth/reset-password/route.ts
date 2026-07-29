import { NextRequest, NextResponse } from "next/server"
import { verifyPasswordResetToken, consumePasswordResetToken, hashPassword, checkPasswordStrength, revokeAllUserSessions } from "@/lib/auth"
import { recordAuditEvent } from "@/lib/security/audit"
import { prisma } from "@/lib/db"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, password } = body

    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required" }, { status: 400 })
    }

    const strength = checkPasswordStrength(password)
    if (!strength.valid) {
      return NextResponse.json({ error: strength.message }, { status: 400 })
    }

    const userId = await verifyPasswordResetToken(token)
    if (!userId) {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 })
    }

    const passwordHash = await hashPassword(password)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, isLocked: false, lockedUntil: null } }),
    ])

    await consumePasswordResetToken(token)

    await revokeAllUserSessions(userId)

    await recordAuditEvent({
      action: "password.reset", clinicId: user.clinicId, userId,
      ip: req.headers.get("x-forwarded-for") || "",
      userAgent: req.headers.get("user-agent") || "",
      details: { method: "email_link" }, severity: "info",
    })

    return NextResponse.json({ success: true, message: "Password has been reset. Please log in with your new password." })
  } catch {
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 })
  }
}
