import { NextRequest, NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { requireFeatureAccess } from "@/lib/billing"
import { getAllIntegrationStatuses, getIntegrationStatus } from "@/integrations/service"
import { prisma } from "@/lib/db"
import type { Platform } from "@/messaging/types"
import { getCredentials } from "@/integrations/token-store"
import { checkEmailConfig } from "@/integrations/email"
import { getTelegramBotInfo, setTelegramWebhook } from "@/integrations/telegram"
import { getEnv } from "@/lib/env"
import type { EmailConfig } from "@/integrations/email"

export async function GET(req: NextRequest) {
  try {
    const { clinicId } = await getClinicId(req)
    const platform = req.nextUrl.searchParams.get("platform") as Platform | null

    if (platform) {
      const status = await getIntegrationStatus(clinicId, platform)
      return NextResponse.json(status)
    }

    const statuses = await getAllIntegrationStatuses(clinicId)
    return NextResponse.json({ integrations: statuses })
  } catch (error: any) {
    if (error?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    return NextResponse.json({ error: "Failed to load integrations" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { clinicId } = await getClinicId(req)
    await requireFeatureAccess(clinicId, "integrations")
    const body = await req.json()

    if (!body.platform) {
      return NextResponse.json({ error: "Platform is required" }, { status: 400 })
    }

    const updateData: any = {}
    if (body.enabled !== undefined) updateData.enabled = body.enabled
    if (body.settings) updateData.settings = JSON.stringify(body.settings)
    if (body.status) updateData.status = body.status
    if (body.webhookSecret) updateData.webhookSecret = body.webhookSecret

    const integration = await prisma.integration.upsert({
      where: { clinicId_platform: { clinicId, platform: body.platform } },
      create: {
        clinicId,
        platform: body.platform,
        enabled: body.enabled ?? false,
        credentials: body.credentials ? JSON.stringify(body.credentials) : null,
        settings: body.settings ? JSON.stringify(body.settings) : null,
        status: body.status || "disconnected",
      },
      update: updateData,
    })

    return NextResponse.json({
      platform: integration.platform,
      enabled: integration.enabled,
      status: integration.status,
      lastSyncAt: integration.lastSyncAt,
    })
  } catch (error: any) {
    if (error?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    return NextResponse.json({ error: "Failed to update integration" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { clinicId } = await getClinicId(req)
    await requireFeatureAccess(clinicId, "integrations")
    const body = await req.json()
    const { platform } = body

    if (!platform) {
      return NextResponse.json({ error: "Platform is required" }, { status: 400 })
    }

    if (platform === "telegram") {
      const { botToken } = body
      if (!botToken) {
        return NextResponse.json({ error: "Bot token is required" }, { status: 400 })
      }

      const botInfo = await getTelegramBotInfo(botToken)
      if (!botInfo) {
        return NextResponse.json({ error: "Invalid bot token" }, { status: 400 })
      }

      const baseUrl = getEnv("NEXT_PUBLIC_APP_URL")
      await setTelegramWebhook(botToken, `${baseUrl}/api/webhooks/telegram`, clinicId)

      await prisma.integration.upsert({
        where: { clinicId_platform: { clinicId, platform: "telegram" } },
        create: {
          clinicId,
          platform: "telegram",
          enabled: true,
          credentials: botToken,
          status: "connected",
        },
        update: {
          credentials: botToken,
          status: "connected",
          enabled: true,
        },
      })

      return NextResponse.json({ success: true, platform: "telegram", botName: botInfo.username })
    }

    if (platform === "email-smtp") {
      const { host, port, username, password, secure, fromEmail, fromName } = body
      if (!host || !username || !password || !fromEmail) {
        return NextResponse.json({ error: "Missing required SMTP fields" }, { status: 400 })
      }

      const emailConfig: EmailConfig = {
        type: "smtp",
        config: { host, port: port || 587, username, password, secure: secure ?? false, fromEmail, fromName: fromName || fromEmail },
      }

      const validation = await checkEmailConfig(emailConfig)
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error || "SMTP validation failed" }, { status: 400 })
      }

      await prisma.integration.upsert({
        where: { clinicId_platform: { clinicId, platform: "email" } },
        create: { clinicId, platform: "email", enabled: true, credentials: JSON.stringify(body), status: "connected" },
        update: { credentials: JSON.stringify(body), status: "connected", enabled: true },
      })

      return NextResponse.json({ success: true, platform: "email", email: fromEmail })
    }

    return NextResponse.json({ error: "Unsupported platform" }, { status: 400 })
  } catch (error: any) {
    if (error?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    return NextResponse.json({ error: error.message || "Failed to connect integration" }, { status: 500 })
  }
}
