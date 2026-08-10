import { NextRequest, NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { prisma } from "@/lib/db"
import { deleteCredentials, getCredentials } from "@/integrations/token-store"
import { revokeGoogleToken } from "@/integrations/google-calendar"
import { deleteTelegramWebhook } from "@/integrations/telegram"
import { unsubscribeWebhook } from "@/integrations/whatsapp/api"
import { logger } from "@/lib/logger"

export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } },
) {
  try {
    const { clinicId } = await getClinicId(req)
    const provider = params.provider

    const credentials = await getCredentials(clinicId, provider)

    if (provider === "google" && credentials?.accessToken) {
      await revokeGoogleToken(credentials.accessToken)
    }

    if (provider === "telegram" && credentials?.accessToken) {
      await deleteTelegramWebhook(credentials.accessToken)
    }

    if (provider === "whatsapp") {
      const meta = credentials?.metadata ?? {}
      if (meta.wabaId && credentials?.accessToken) {
        await unsubscribeWebhook({
          accessToken: credentials.accessToken,
          phoneNumberId: meta.phoneNumberId || "",
          wabaId: meta.wabaId,
          businessId: meta.businessId || "",
        })
      }

      await prisma.whatsAppPhoneNumber.deleteMany({ where: { clinicId } })
      await prisma.whatsAppBusinessAccount.deleteMany({ where: { clinicId } })
    }

    const integration = await prisma.integration.findUnique({
      where: { clinicId_platform: { clinicId, platform: provider } },
    })
    if (integration) {
      await deleteCredentials(clinicId, provider)
    }

    logger.info("Integration disconnected", { clinicId, provider })
    return NextResponse.json({ success: true, platform: provider, status: "disconnected" })
  } catch (error: any) {
    if (error?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    logger.error("Failed to disconnect integration", { provider: params.provider, reason: error?.message })
    return NextResponse.json({ error: `Failed to disconnect ${params.provider}` }, { status: 500 })
  }
}
