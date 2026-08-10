import { NextRequest, NextResponse } from "next/server"
import { handlePlatformWebhook } from "@/messaging"
import type { Platform } from "@/messaging/types"

export async function POST(req: NextRequest) {
  try {
    const platform = req.nextUrl.searchParams.get("platform") as Platform | null

    if (!platform) {
      return NextResponse.json({ error: "Platform parameter required" }, { status: 400 })
    }

    const body = await req.text()
    const headers: Record<string, string> = {}
    req.headers.forEach((value, key) => { headers[key] = value })

    const result = await handlePlatformWebhook(platform, body, headers)

    if (!result) {
      return NextResponse.json({ error: "Platform not supported or not configured" }, { status: 400 })
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error("Platform webhook error:", error)
    return NextResponse.json({ error: error?.message || "Webhook processing failed" }, { status: 500 })
  }
}
