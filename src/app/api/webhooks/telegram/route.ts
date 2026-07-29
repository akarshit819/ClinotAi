import { NextRequest, NextResponse } from "next/server"
import { parseTelegramUpdate } from "@/integrations/telegram"
import { getCredentials } from "@/integrations/token-store"
import { prisma } from "@/lib/db"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const secretToken = req.headers.get("x-telegram-bot-api-secret-token")

    let clinicId: string | null = null

    if (secretToken) {
      clinicId = secretToken
    } else {
      const integration = await prisma.integration.findFirst({
        where: { platform: "telegram", enabled: true },
      })
      if (integration) clinicId = integration.clinicId
    }

    if (!clinicId) {
      return NextResponse.json({ ok: true })
    }

    const parsed = parseTelegramUpdate(body)

    if (parsed) {
      const creds = await getCredentials(clinicId, "telegram")
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: true })
  }
}
