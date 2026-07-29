import { prisma } from "@/lib/db"
import { getEnv } from "@/lib/env"
import type { Intent } from "../types"

export interface NotificationEvent {
  clinicId: string
  conversationId: string
  patientName?: string
  type: "appointment_request" | "emergency" | "manual_followup" | "low_confidence" | "new_conversation"
  message: string
  platform: string
}

export async function shouldNotifyClinic(
  clinicId: string,
  intent: Intent,
  confidence: number,
  isEmergency: boolean,
): Promise<NotificationEvent | null> {
  if (isEmergency || intent === "emergency") {
    return {
      clinicId,
      conversationId: "",
      type: "emergency",
      message: "Emergency detected — immediate attention required",
      platform: "website",
    }
  }

  if (intent === "appointment") {
    return {
      clinicId,
      conversationId: "",
      type: "appointment_request",
      message: "Patient is requesting an appointment",
      platform: "website",
    }
  }

  if (confidence < 0.5) {
    return {
      clinicId,
      conversationId: "",
      type: "low_confidence",
      message: "AI confidence low — manual review recommended",
      platform: "website",
    }
  }

  return null
}

export async function sendNotification(event: NotificationEvent): Promise<void> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: event.clinicId },
    select: { notificationsEmail: true, notificationsPhone: true, name: true },
  })

  if (!clinic) return

  const subject = `[Clinot] ${event.type.replace("_", " ").toUpperCase()} — ${event.platform}`

  if (clinic.notificationsEmail) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.FROM_EMAIL || "notifications@clinot.ai",
          to: clinic.notificationsEmail,
          subject,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
              <h2 style="color:#07090d">${event.type === "emergency" ? "🚨 " : ""}${subject}</h2>
              <p style="color:#55617a;line-height:1.5">${event.message}</p>
              ${event.patientName ? `<p style="color:#55617a">Patient: <strong>${event.patientName}</strong></p>` : ""}
              <a href="${getEnv("NEXT_PUBLIC_APP_URL")}/dashboard/inbox/${event.conversationId}" style="display:inline-block;padding:12px 24px;background:#2463eb;color:#fff;text-decoration:none;border-radius:8px;margin:16px 0">View in Inbox</a>
            </div>
          `,
        }),
      })
    } catch {
      console.error("Failed to send notification email")
    }
  }
}
