import { NextRequest, NextResponse } from "next/server"
import { verifyMessengerWebhook, parseMessengerIncoming } from "@/integrations/messenger"
import { prisma } from "@/lib/db"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  const clinicId = searchParams.get("clinic_id")
  const verifyToken = clinicId || process.env.META_WEBHOOK_SECRET || "clinot-webhook"

  const result = verifyMessengerWebhook(mode, token, challenge, verifyToken)
  if (result) {
    return new NextResponse(result, { status: 200 })
  }

  return new NextResponse("Verification failed", { status: 403 })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (body.object !== "page") {
      return NextResponse.json({ error: "Invalid webhook object" }, { status: 400 })
    }

    const messages = parseMessengerIncoming(body)

    for (const msg of messages) {
      const integration = await prisma.integration.findFirst({
        where: { platform: "facebook", enabled: true },
      })
      if (!integration) continue
    }

    return NextResponse.json({ received: true, count: messages.length })
  } catch (err) {
    return NextResponse.json({ received: true })
  }
}
