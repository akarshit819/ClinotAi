import { NextRequest, NextResponse } from "next/server"
import { getClinicId, AuthError } from "@/lib/api"
import { requireIntegrationsConnectable } from "@/integrations/service"
import { getAuthorizationUrl, getWhatsAppConfigDiagnostics } from "@/integrations/oauth"
import { getTelegramBotInfo, setTelegramWebhook } from "@/integrations/telegram"
import { checkEmailConfig } from "@/integrations/email"
import { storeCredentials } from "@/integrations/token-store"
import { prisma } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { logger } from "@/lib/logger"
import { validateManualConfig, getBusinesses, registerWebhook } from "@/integrations/whatsapp/api"
import type { EmailConfig } from "@/integrations/email"

const TOKEN_PROVIDERS = ["telegram", "email-smtp"]
// Providers that connect with existing credentials/configuration instead of an
// OAuth redirect. WhatsApp Cloud API supports this "manual setup" flow using a
// system user access token plus the WABA/phone number IDs from the dashboard.
const CREDENTIAL_PROVIDERS = ["whatsapp"]

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

    if (!TOKEN_PROVIDERS.includes(provider) && !CREDENTIAL_PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: "Use GET for OAuth providers" }, { status: 400 })
    }

    const body = await req.json()

    if (provider === "whatsapp") {
      const { accessToken, phoneNumberId, wabaId, businessId } = body
      if (!accessToken || !phoneNumberId || !wabaId) {
        return NextResponse.json(
          { error: "Access token, Phone Number ID and WABA ID are required" },
          { status: 400 },
        )
      }

      const config = {
        accessToken: String(accessToken).trim(),
        phoneNumberId: String(phoneNumberId).trim(),
        wabaId: String(wabaId).trim(),
        businessId: businessId ? String(businessId).trim() : "",
      }

      if (!config.phoneNumberId || !config.wabaId) {
        return NextResponse.json({ error: "Phone Number ID and WABA ID must not be empty" }, { status: 400 })
      }

      // Validate the supplied credentials against the Graph API before saving
      // anything. This is the real Meta Cloud API check - not a mock.
      const validation = await validateManualConfig(config)
      if (!validation.ok || !validation.phoneNumber || !validation.waba) {
        logger.warn("WhatsApp manual connect rejected", {
          clinicId,
          reason: validation.error,
          phoneNumberId: config.phoneNumberId,
        })
        return NextResponse.json(
          { error: validation.error || "WhatsApp credentials could not be validated" },
          { status: 400 },
        )
      }

      const phone = validation.phoneNumber
      const waba = validation.waba

      // Resolve the business ID from the token when not supplied so webhook
      // subscription and future flows have a complete config.
      let resolvedBusinessId = config.businessId
      if (!resolvedBusinessId) {
        const businesses = await getBusinesses(config.accessToken).catch(() => [])
        resolvedBusinessId = businesses[0]?.id || ""
      }

      const wabaRecord = await prisma.whatsAppBusinessAccount.upsert({
        where: { clinicId_wabaId: { clinicId, wabaId: config.wabaId } },
        update: {
          businessId: resolvedBusinessId,
          verifiedName: waba.name || "",
          currency: waba.currency || "USD",
          timezoneId: waba.timezoneId || "America/New_York",
          messageTemplateNamespace: waba.messageTemplateNamespace || null,
          status: "connected",
        },
        create: {
          clinicId,
          wabaId: config.wabaId,
          businessId: resolvedBusinessId,
          verifiedName: waba.name || "",
          currency: waba.currency || "USD",
          timezoneId: waba.timezoneId || "America/New_York",
          messageTemplateNamespace: waba.messageTemplateNamespace || null,
          status: "connected",
        },
      })

      await prisma.whatsAppPhoneNumber.upsert({
        where: { clinicId_phoneNumberId: { clinicId, phoneNumberId: config.phoneNumberId } },
        update: {
          displayPhoneNumber: phone.displayPhoneNumber,
          verifiedName: phone.verifiedName,
          qualityRating: phone.qualityRating,
          status: "connected",
        },
        create: {
          wabaId: wabaRecord.id,
          clinicId,
          phoneNumberId: config.phoneNumberId,
          displayPhoneNumber: phone.displayPhoneNumber,
          verifiedName: phone.verifiedName,
          qualityRating: phone.qualityRating,
          status: "connected",
        },
      })

      const providerName = phone.displayPhoneNumber || phone.verifiedName || config.phoneNumberId

      await storeCredentials(clinicId, "whatsapp", {
        accessToken: config.accessToken,
        scopes: [],
        providerAccountName: providerName,
        metadata: {
          businessId: resolvedBusinessId,
          wabaId: config.wabaId,
          phoneNumberId: config.phoneNumberId,
          displayPhoneNumber: phone.displayPhoneNumber,
          verifiedName: phone.verifiedName,
        },
      })

      const baseUrl = getEnv("NEXT_PUBLIC_APP_URL").replace(/\/+$/, "")
      const subscribed = await registerWebhook(config, `${baseUrl}/api/webhooks/whatsapp`)

      await prisma.whatsAppPhoneNumber.updateMany({
        where: { clinicId, phoneNumberId: config.phoneNumberId },
        data: { webhookConfigured: subscribed },
      })

      if (!subscribed) {
        logger.warn("WhatsApp manual connect: webhook subscription failed", { clinicId, wabaId: config.wabaId })
      }

      logger.info("WhatsApp connected via manual credentials", {
        clinicId,
        wabaId: config.wabaId,
        phoneNumberId: config.phoneNumberId,
        webhookSubscribed: subscribed,
      })

      return NextResponse.json({
        success: true,
        platform: "whatsapp",
        providerName,
        webhookConfigured: subscribed,
      })
    }

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
