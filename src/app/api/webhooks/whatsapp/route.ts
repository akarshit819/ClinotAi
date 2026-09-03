import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { parseWebhookPayload, extractMessages, verifyWebhook } from "@/integrations/whatsapp/api"
import { canProcessMessaging } from "@/lib/billing"
import { logger } from "@/lib/logger"
import { timingSafeEqual, verifySignature, getWebhookSecret, getAppSecret } from "@/lib/webhook-utils"
import { createJob } from "@/lib/jobs/queue"

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
    //
    // `phoneNumberId` is NOT globally unique — the schema's compound unique
    // key is (clinicId, phoneNumberId). If multiple clinics somehow share a
    // phoneNumberId (which they should not, but the schema allows it), the
    // first match wins here. The fallback below uses the Integration record.
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
      logger.warn("WhatsApp webhook received for unknown phone number; dropping", { phoneNumberId })
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

    const featureCheck = await canProcessMessaging(clinicId)
    if (!featureCheck.allowed) {
      logger.warn("WhatsApp webhook dropped by messaging gate", { clinicId, phoneNumberId, reason: featureCheck.reason })
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

      // Update 24-hour window tracking on inbound patient message.
      // The schema's unique key on WhatsAppPhoneNumber is the compound
      // (clinicId, phoneNumberId) — phoneNumberId alone is NOT unique.
      // We use the compound key here so the update is correctly scoped
      // to a single clinic's phone record, preserving multi-tenant
      // isolation.
      if (msg.from && phoneNumberId && clinicId) {
        try {
          await prisma.whatsAppPhoneNumber.update({
            where: { clinicId_phoneNumberId: { clinicId, phoneNumberId } },
            data: { lastMessageAt: new Date(parseInt(msg.timestamp) * 1000) },
          })
        } catch (err) {
          // P2025 = record not found. This can happen if the phone record
          // was deleted between resolution and update. Log and continue —
          // the inbound message is still enqueued for processing.
          logger.warn("WhatsApp phone record update failed; continuing", {
            clinicId,
            phoneNumberId,
            error: (err as Error).message,
          })
        }
      }

      // Enqueue job for async processing
      await createJob("PROCESS_INBOUND_MESSAGE", {
        clinicId,
        message: {
          platform: "whatsapp",
          channelId: msg.from,
          sourceMessageId: msg.id,
          from: {
            id: msg.from,
            name: msg.contacts?.[0]?.name?.formatted_name || "Unknown",
            phone: msg.from,
          },
          content: msg.text?.body || "",
          timestamp: new Date(parseInt(msg.timestamp) * 1000),
        },
      }, {
        idempotencyKey: `whatsapp-${msg.id}`,
        priority: 10, // High priority for inbound messages
      })
    }

    return NextResponse.json({ received: true, queued: messages.length })
  } catch (error: unknown) {
    logger.error("WhatsApp webhook route error", { error: error instanceof Error ? error.message : "Unknown error" })
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
