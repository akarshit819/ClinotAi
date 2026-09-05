import { prisma } from "@/lib/db"
import { logger } from "@/lib/logger"
import { canProcessMessaging } from "@/lib/billing/feature-check"

const CUSTOMER_SERVICE_WINDOW_HOURS = 24

export type MessagePolicyDecision = 
  | { allowed: true; type: "freeform" }
  | { allowed: true; type: "template"; templateName: string; languageCode: string; templateComponents?: any[] }
  | { allowed: false; reason: "outside_window_no_template" | "no_template_configured" | "billing_blocked" | "invalid_recipient" }

export interface MessagingPolicyContext {
  clinicId: string
  phoneNumberId: string
  platform: "whatsapp"
  messageType: "freeform" | "template"
  templateName?: string
  templateLanguage?: string
  templateComponents?: any[]
  isAppointmentRelated?: boolean
}

export async function evaluateMessagingPolicy(
  context: MessagingPolicyContext
): Promise<MessagePolicyDecision> {
  const { clinicId, phoneNumberId, messageType, templateName, templateLanguage, templateComponents, isAppointmentRelated } = context

  // Check billing/feature gate first.
  const featureCheck = await canProcessMessaging(context.clinicId)
  if (!featureCheck.allowed) {
    return { allowed: false, reason: "billing_blocked" }
  }

  // Get the WhatsApp phone number record to check 24-hour window
  // Need clinicId to use the compound unique key [clinicId, phoneNumberId]
  const phoneRecord = await prisma.whatsAppPhoneNumber.findFirst({
    where: { phoneNumberId },
    select: { lastMessageAt: true, clinicId: true },
  })

  if (!phoneRecord) {
    return { allowed: false, reason: "invalid_recipient" }
  }

  // Check 24-hour customer service window
  const now = new Date()
  const windowMs = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
  let isWithinWindow = false

  if (phoneRecord.lastMessageAt) {
    const timeSinceLastMessage = now.getTime() - phoneRecord.lastMessageAt.getTime()
    isWithinWindow = timeSinceLastMessage <= windowMs
  }

  // If sending free-form message
  if (messageType === "freeform") {
    if (isWithinWindow) {
      return { allowed: true, type: "freeform" }
    }
    // Outside window - free-form not allowed, need template
    return { allowed: false, reason: "outside_window_no_template" }
  }

  // If sending template message
  if (messageType === "template") {
    if (!templateName) {
      return { allowed: false, reason: "no_template_configured" }
    }
    // Template messages are allowed outside the window
    return { 
      allowed: true, 
      type: "template", 
      templateName,
      languageCode: templateLanguage || "en_US",
      templateComponents: templateComponents
    }
  }

  return { allowed: false, reason: "outside_window_no_template" }
}

export async function getTemplateForScenario(
  clinicId: string,
  scenario: "appointment_confirmation" | "appointment_reminder" | "appointment_followup" | "re_engagement"
): Promise<{ name: string; languageCode: string } | null> {
  // Check for clinic-specific template mapping first
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true },
  })

  // For now, return default template names
  // In production, this would be configurable per clinic
  const templates: Record<string, { name: string; languageCode: string }> = {
    appointment_confirmation: { name: "appointment_confirmation", languageCode: "en_US" },
    appointment_reminder: { name: "appointment_reminder_24h", languageCode: "en_US" },
    appointment_followup: { name: "appointment_followup", languageCode: "en_US" },
    re_engagement: { name: "re_engagement", languageCode: "en_US" },
  }

  return templates[scenario] || null
}

export function isWithinCustomerServiceWindow(lastMessageAt: Date | null): boolean {
  if (!lastMessageAt) return false
  const now = new Date()
  const windowMs = 24 * 60 * 60 * 1000
  return now.getTime() - lastMessageAt.getTime() <= CUSTOMER_SERVICE_WINDOW_HOURS * 60 * 60 * 1000
}