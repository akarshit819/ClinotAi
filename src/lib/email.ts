import { isProduction } from "./env"
import { logger } from "./logger"

export interface EmailData {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail(data: EmailData): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    if (isProduction()) {
      logger.error("RESEND_API_KEY not configured")
    }
    return false
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL || "noreply@clinot.ai",
        to: data.to,
        subject: data.subject,
        html: data.html,
        text: data.text || data.html.replace(/<[^>]*>/g, ""),
      }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      logger.error("Email send failed", errData)
      return false
    }

    return true
  } catch (err) {
    logger.error("Email send error")
    return false
  }
}

export function buildPasswordResetEmail(resetUrl: string): string {
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Reset your Clinot password</h2>
      <p>Click the button below to reset your password. This link expires in 1 hour.</p>
      <a href="${resetUrl}" style="display: inline-block; background: #1E7FE3; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Reset Password
      </a>
      <p style="color: #666; font-size: 14px; margin-top: 24px;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  `
}

export function buildEmailVerificationEmail(verifyUrl: string): string {
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Verify your email address</h2>
      <p>Click the button below to verify your email address. This link expires in 24 hours.</p>
      <a href="${verifyUrl}" style="display: inline-block; background: #1E7FE3; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Verify Email
      </a>
    </div>
  `
}
