import { NextRequest, NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { deleteCredentials, getCredentials } from "@/integrations/token-store"
import { revokeGoogleToken } from "@/integrations/google-calendar"
import { deleteTelegramWebhook } from "@/integrations/telegram"

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

    await deleteCredentials(clinicId, provider)

    return NextResponse.json({ success: true, platform: provider, status: "disconnected" })
  } catch (error: any) {
    if (error?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    return NextResponse.json({ error: `Failed to disconnect ${params.provider}` }, { status: 500 })
  }
}
