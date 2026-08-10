import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { parseWebhookPayload, extractMessages, verifyWebhook } from "@/integrations/whatsapp/api"
import { handlePlatformWebhook } from "@/messaging/engine"
import { checkFeatureAccess } from "@/lib/billing"
import { logger } from "@/lib/logger"

function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val || val.trim() === "") {
    if (process.env.NODE_ENV === "development") {
      throw new Error(
        `Missing required environment variable: ${name}. ` +
        `Set it in .env before using WhatsApp webhook.`,
      )
    }
    throw new Error("Server configuration error")
  }
  return val.trim()
}

function timingSafeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    if (bufA.length !== bufB.length) {
      const empty = Buffer.alloc(bufA.length)
      crypto.timingSafeEqual(bufA, empty)
      return false
    }
    return crypto.timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false

  const prefix = "sha256="
  if (!signatureHeader.startsWith(prefix)) return false

  const receivedSig = signatureHeader.slice(prefix.length)
  if (!/^[a-f0-9]{64}$/i.test(receivedSig)) return false

  const expectedSig = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex")

  return timingSafeEqual(expectedSig, receivedSig)
}

function getWebhookSecret(): string {
  return requireEnv("WA_WEBHOOK_SECRET")
}

function getAppSecret(): string {
  return requireEnv("META_APP_SECRET")
}

export async function GET(req: NextRequest) {
  try {
    const webhookSecret = getWebhookSecret()
    const { searchParams } = new URL(req.url)
    const mode = searchParams.get("hub.mode")
    const token = searchParams.get("hub.verify_token")
    const challenge = searchParams.get("hub.challenge")

    const result = verifyWebhook(mode, token, challenge, webhookSecret)
    if (result) {
      return new NextResponse(result, { status: 200 })
    }
    return new NextResponse("Verification failed", { status: 403 })
  } catch {
    return new NextResponse("Server configuration error", { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const signatureHeader = req.headers.get("x-hub-signature-256")
    const appSecret = getAppSecret()

    const rawBody = await req.text()

    if (!verifySignature(rawBody, signatureHeader, appSecret)) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 })
    }

    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const payload = parseWebhookPayload(body)
    if (!payload) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 })
    }

    const { messages, statuses, phoneNumberId, errors } = extractMessages(payload)

    if (errors.length > 0) {
      logger.warn("WhatsApp webhook errors in payload")
    }

    // Resolve the clinic from the phone number that received the webhook.
    // Credentials are encrypted at rest so a plaintext search cannot match;
    // the WhatsAppPhoneNumber record is the canonical clinic link.
    const phoneRecord = await prisma.whatsAppPhoneNumber.findFirst({
      where: { phoneNumberId },
    })
    let clinicId: string | null = phoneRecord?.clinicId || null

    if (!clinicId) {
      const integration = await prisma.integration.findFirst({
        where: { platform: "whatsapp", credentials: { contains: phoneNumberId } },
      })
      clinicId = integration?.clinicId || null
    }

    if (!clinicId) {
      return NextResponse.json({ received: true })
    }

    for (const status of statuses) {
      await prisma.whatsAppWebhookEvent.upsert({
        where: { eventId: status.id },
        update: { status: status.status, phoneNumberId },
        create: {
          eventId: status.id,
          clinicId,
          phoneNumberId,
          type: `status:${status.status}`,
          status: "processed",
        },
      })

      await prisma.conversationMessage.updateMany({
        where: { sourceMessageId: status.id },
        data: { status: mapWhatsAppStatus(status.status) },
      })
    }

    if (messages.length === 0) {
      return NextResponse.json({ received: true })
    }

    const featureCheck = await checkFeatureAccess(clinicId, "messaging")
    if (!featureCheck.allowed) {
      return NextResponse.json({ received: true })
    }

    for (const msg of messages) {
      await prisma.whatsAppWebhookEvent.upsert({
        where: { eventId: msg.id },
        update: { type: `message:${msg.type}`, phoneNumberId },
        create: {
          eventId: msg.id,
          clinicId,
          phoneNumberId,
          type: `message:${msg.type}`,
          status: "processed",
        },
      })
    }

    try {
      const result = await handlePlatformWebhook("whatsapp", body, Object.fromEntries(req.headers))
      return NextResponse.json({ received: true, processed: result ? 1 : 0 })
    } catch {
      return NextResponse.json({ received: true })
    }
  } catch {
    return NextResponse.json({ received: true })
  }
}

function mapWhatsAppStatus(status: string): string {
  switch (status) {
    case "sent": return "sent"
    case "delivered": return "delivered"
    case "read": return "read"
    case "failed": return "failed"
    default: return status
  }
}
