import { NextRequest, NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { getIntegrationStatus, checkAndRefreshToken } from "@/integrations/service"
import { getCredentials } from "@/integrations/token-store"
import { getTelegramWebhookInfo } from "@/integrations/telegram"
import type { Platform } from "@/messaging/types"

export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } },
) {
  try {
    const { clinicId } = await getClinicId(req)
    const provider = params.provider as Platform

    await checkAndRefreshToken(clinicId, provider)

    const status = await getIntegrationStatus(clinicId, provider)

    if (provider === "telegram" && status.connected) {
      const creds = await getCredentials(clinicId, "telegram")
      if (creds) {
        const webhookInfo = await getTelegramWebhookInfo(creds.accessToken)
        if (webhookInfo) {
          status.webhookConfigured = webhookInfo.url !== ""
          status.lastSyncAt = new Date().toISOString()
        }
      }
    }

    return NextResponse.json(status)
  } catch (error: any) {
    if (error?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    return NextResponse.json({
      platform: params.provider,
      connected: false,
      status: "error",
      lastErrorMessage: "Status check failed",
    })
  }
}
