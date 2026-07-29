import { NextRequest, NextResponse } from "next/server"
import { ingestMessage } from "@/messaging/engine"
import { getClinicId } from "@/lib/api"
import { requireFeatureAccess } from "@/lib/billing"
import type { IncomingMessage, Platform } from "@/messaging/types"

export async function POST(req: NextRequest) {
  try {
    const { clinicId } = await getClinicId(req)
    await requireFeatureAccess(clinicId, "messaging")
    const body = await req.json()

    if (!body.platform || !body.message) {
      return NextResponse.json({ error: "Missing platform or message" }, { status: 400 })
    }

    const incoming: IncomingMessage = {
      platform: body.platform as Platform,
      channelId: body.channelId || `ingest-${Date.now()}`,
      sourceMessageId: body.sourceMessageId || `ingest-${Date.now()}`,
      from: {
        id: body.from?.id || `anonymous-${Date.now()}`,
        name: body.from?.name,
        phone: body.from?.phone,
        email: body.from?.email,
      },
      content: body.message,
      timestamp: new Date(body.timestamp || Date.now()),
      attachments: body.attachments,
      metadata: body.metadata,
    }

    const result = await ingestMessage(clinicId, incoming)

    return NextResponse.json(result)
  } catch (error: any) {
    if (error?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    console.error("Ingest error:", error)
    return NextResponse.json({ error: error?.message || "Failed to process message" }, { status: 500 })
  }
}
