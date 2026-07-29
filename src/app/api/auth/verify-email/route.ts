import { NextRequest, NextResponse } from "next/server"
import { verifyEmailToken, createEmailVerificationToken } from "@/lib/auth"
import { extractBearerToken, verifyAccessToken } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { sendEmail } from "@/lib/email"
import { getEnv } from "@/lib/env"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token } = body

    if (!token) {
      return NextResponse.json({ error: "Verification token is required" }, { status: 400 })
    }

    const success = await verifyEmailToken(token)
    if (!success) {
      return NextResponse.json({ error: "Invalid or expired verification token" }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: "Email verified successfully" })
  } catch {
    return NextResponse.json({ error: "Failed to verify email" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const token = extractBearerToken(req)
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const payload = await verifyAccessToken(token)
    if (!payload) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } })
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.isEmailVerified) {
      return NextResponse.json({ success: true, message: "Email already verified" })
    }

    const verifyToken = await createEmailVerificationToken(payload.userId)
    const appUrl = getEnv("NEXT_PUBLIC_APP_URL")
    const verifyUrl = `${appUrl}/verify-email?token=${verifyToken}`

    await sendEmail({
      to: user.email,
      subject: "Verify your Clinot email address",
      html: `Click <a href="${verifyUrl}">here</a> to verify your email. This link expires in 24 hours.`,
    })

    return NextResponse.json({ success: true, message: "Verification email sent" })
  } catch {
    return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 })
  }
}
