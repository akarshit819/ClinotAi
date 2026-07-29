import { NextRequest, NextResponse } from "next/server"
import { stripeProvider, processStripeWebhook } from "@/lib/billing"
import { prisma } from "@/lib/db"
import { logger } from "@/lib/logger"

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }

  let event: Record<string, any>

  try {
    const body = await req.text()
    const signature = req.headers.get("stripe-signature") || ""
    event = stripeProvider.constructWebhookEvent(body, signature)
  } catch (err) {
    logger.error("Stripe webhook signature verification failed")
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const existing = await prisma.stripeEvent.findUnique({
    where: { stripeEventId: event.id },
  })
  if (existing) {
    return NextResponse.json({ received: true, handled: false, skipped: true })
  }

  await prisma.stripeEvent.create({
    data: { stripeEventId: event.id, type: event.type },
  })

  try {
    const result = await processStripeWebhook(event)
    return NextResponse.json({
      received: true,
      handled: result.handled,
      skipped: result.skipped,
    })
  } catch (error) {
    logger.error("Stripe webhook handler error", { eventId: event.id, type: event.type })
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }
}
