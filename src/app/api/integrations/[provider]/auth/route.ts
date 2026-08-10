import { NextRequest, NextResponse } from "next/server"
import { getClinicId, AuthError } from "@/lib/api"
import { requireIntegrationsConnectable } from "@/integrations/service"
import { getAuthorizationUrl, getWhatsAppConfigDiagnostics } from "@/integrations/oauth"
import { getTelegramBotInfo, setTelegramWebhook } from "@/integrations/telegram"
import { checkEmailConfig } from "@/integrations/email"
import { storeCredentials } from "@/integrations/token-store"
import { getEnv } from "@/lib/env"
import { logger } from "@/lib/logger"
import type { EmailConfig } from "@/integrations/email"

const TOKEN_PROVIDERS = ["telegram", "email-smtp"]

function getSafeMessage(provider: string): string {
  return provider === "whatsapp"
    ? "WhatsApp connection could not be started. Please try again."
    : "Connection could not be started. Please try again."
}

export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } },
) {
  const provider = params.provider
  const wantsJson = req.nextUrl.searchParams.get("json") === "1"

  try {
    const { clinicId } = await getClinicId(req)
    await requireIntegrationsConnectable(clinicId)

    const baseUrl = getEnv("NEXT_PUBLIC_APP_URL")
    const { url, cookie } = getAuthorizationUrl(provider, clinicId, baseUrl)

    if (wantsJson) {
      return NextResponse.json(
        { url },
        { status: 200, headers: { "Set-Cookie": cookie } },
      )
    }

    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: url,
        "Set-Cookie": cookie,
      },
    })
  } catch (error: any) {
    if (error instanceof AuthError || error?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const isWhatsApp = provider === "whatsapp"
    logger.error("Failed to start integration auth", {
      provider,
      reason: error?.message,
      ...(isWhatsApp ? { whatsapp: getWhatsAppConfigDiagnostics() } : {}),
    })

    return NextResponse.json({ error: getSafeMessage(provider) }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } },
) {
  const provider = params.provider
  try {
    const { clinicId } = await getClinicId(req)
    await requireIntegrationsConnectable(clinicId)

    if (!TOKEN_PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: "Use GET for OAuth providers" }, { status: 400 })
    }

    const body = await req.json()

    if (provider === "telegram") {
      const { botToken } = body
      if (!botToken) {
        return NextResponse.json({ error: "Bot token is required" }, { status: 400 })
      }

      const botInfo = await getTelegramBotInfo(botToken)
      if (!botInfo) {
        return NextResponse.json({ error: "Invalid bot token. Please check and try again." }, { status: 400 })
      }

      const baseUrl = getEnv("NEXT_PUBLIC_APP_URL")
      const webhookUrl = `${baseUrl}/api/webhooks/telegram`
      const webhookResult = await setTelegramWebhook(botToken, webhookUrl, clinicId)

      if (!webhookResult.success) {
        return NextResponse.json({ error: webhookResult.error || "Failed to set webhook" }, { status: 500 })
      }

      await storeCredentials(clinicId, "telegram", {
        accessToken: botToken,
        scopes: [],
        providerAccountName: `@${botInfo.username}`,
        metadata: {
          botId: botInfo.id,
          botUsername: botInfo.username,
          botFirstName: botInfo.firstName,
        },
      })

      return NextResponse.json({
        success: true,
        platform: "telegram",
        providerName: `@${botInfo.username}`,
      })
    }

    if (provider === "email-smtp") {
      const { host, port, username, password, secure, fromEmail, fromName } = body
      if (!host || !username || !password || !fromEmail) {
        return NextResponse.json({ error: "Missing required SMTP fields" }, { status: 400 })
      }

      const emailConfig: EmailConfig = {
        type: "smtp",
        config: {
          host,
          port: port || 587,
          username,
          password,
          secure: secure ?? false,
          fromEmail,
          fromName: fromName || fromEmail,
        },
      }

      const validation = await checkEmailConfig(emailConfig)
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error || "SMTP validation failed" }, { status: 400 })
      }

      await storeCredentials(clinicId, "email", {
        accessToken: "",
        scopes: [],
        providerAccountName: fromEmail,
        metadata: {
          type: "smtp",
          host,
          port: port || 587,
          username,
          secure: secure ?? false,
          fromEmail,
          fromName: fromName || fromEmail,
        },
      })

      return NextResponse.json({
        success: true,
        platform: "email",
        providerName: fromEmail,
      })
    }

    return NextResponse.json({ error: "Unknown provider" }, { status: 400 })
  } catch (error: any) {
    if (error instanceof AuthError || error?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    logger.error("Failed to connect integration", { provider, reason: error?.message })
    return NextResponse.json({ error: getSafeMessage(provider) }, { status: 500 })
  }
}
