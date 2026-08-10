import { NextRequest, NextResponse } from "next/server"
import { createPasswordResetToken } from "@/lib/auth"
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit"
import { prisma } from "@/lib/db"
import { sendEmail } from "@/lib/email"
import { getEnv } from "@/lib/env"
import { normalizeEmail, isValidEmail } from "@/lib/email-utils"

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1"
    const rlKey = rateLimitKey(ip, "login")
    const rl = checkRateLimit("login", rlKey)
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 })
    }

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }
    const email = normalizeEmail(body.email ?? "")

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    if (user) {
      const token = await createPasswordResetToken(user.id)
      const appUrl = getEnv("NEXT_PUBLIC_APP_URL")
      const resetUrl = `${appUrl}/login?reset=${token}`

      await sendEmail({
        to: email,
        subject: "Reset your Clinot password",
        html: `Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.`,
      })
    }

    return NextResponse.json({
      message: "If an account with that email exists, a password reset link has been sent.",
    })
  } catch {
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 })
  }
}
