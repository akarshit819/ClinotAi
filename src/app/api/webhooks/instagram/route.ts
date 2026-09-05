import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { parseInstagramIncoming } from "@/integrations/instagram"
import { logger } from "@/lib/logger"
import { timingSafeEqual, verifySignature, requireEnv } from "@/lib/webhook-utils"


export async function GET(req: NextRequest) {
  try {
    const verifyToken = process.env.META_WEBHOOK_SECRET
    if (!verifyToken) {
      return new NextResponse("Server configuration error", { status: 500 })
    }
    const { searchParams } = new URL(req.url)
    const mode = searchParams.get("hub.mode")
    const token = searchParams.get("hub.verify_token")
    const challenge = searchParams.get("hub.challenge")

    if (mode === "subscribe" && token === verifyToken && challenge) {
      return new NextResponse(challenge, { status: 200 })
    }

    logger.warn("Instagram webhook verification failed", { mode, token: token ? "present" : "missing" })
    return new NextResponse("Verification failed", { status: 403 })
  } catch {
    return new NextResponse("Server configuration error", { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const signatureHeader = req.headers.get("x-hub-signature-256")
    const appSecret = requireEnv("META_APP_SECRET")

    const rawBody = await req.text()

    if (!verifySignature(rawBody, signatureHeader, appSecret)) {
      logger.warn("Instagram webhook invalid signature")
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 })
    }

    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (body.object !== "instagram") {
      return NextResponse.json({ error: "Invalid webhook object" }, { status: 400 })
    }

    // Extract Instagram Business Account ID from the first entry
    const entry = body.entry?.[0]
    const instagramId = entry?.id
    if (!instagramId) {
      logger.warn("Instagram webhook missing instagram ID")
      return NextResponse.json({ received: true })
    }

    // Resolve clinic from the Instagram Business Account ID via integration
    const integration = await prisma.integration.findFirst({
      where: { platform: "instagram", enabled: true },
    })

    if (!integration) {
      logger.warn("Instagram webhook: no Instagram integration configured")
      return NextResponse.json({ received: true })
    }

    const messages = (await import("@/integrations/instagram")).parseInstagramIncoming(body)

    for (const msg of messages) {
      await prisma.instagramWebhookEvent.upsert({
        where: { eventId: msg.messageId },
        update: { status: "processed", instagramId: instagramId },
        create: {
          eventId: msg.messageId,
          clinicId: integration.clinicId,
          instagramId,
          type: "message",
          status: "processed",
        },
      })
    }

    if (messages.length === 0) {
      return NextResponse.json({ received: true })
    }

    return NextResponse.json({ received: true, count: messages.length })
  } catch (err: any) {
    logger.error("Instagram webhook error", { error: err.message })
    return NextResponse.json({ received: true })
  }
}