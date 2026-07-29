import { NextRequest, NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { prisma } from "@/lib/db"
import { requireFeatureAccess } from "@/lib/billing"
import { getCredentials } from "@/integrations/token-store"
import { testConnection } from "@/integrations/whatsapp/api"

export async function GET(req: NextRequest) {
  try {
    const { clinicId } = await getClinicId(req)

    const integration = await prisma.integration.findUnique({
      where: { clinicId_platform: { clinicId, platform: "whatsapp" } },
    })

    if (!integration || integration.status === "disconnected") {
      return NextResponse.json({
        connected: false,
        status: "disconnected",
        phoneNumber: null,
        businessName: null,
        webhookStatus: null,
        lastSyncAt: null,
      })
    }

    const credentials = await getCredentials(clinicId, "whatsapp")
    if (!credentials) {
      return NextResponse.json({
        connected: false,
        status: "error",
        error: "No credentials found",
      })
    }

    const meta = credentials.metadata || {}
    const health = await testConnection({
      accessToken: credentials.accessToken,
      phoneNumberId: meta.phoneNumberId || "",
      wabaId: meta.wabaId || "",
      businessId: meta.businessId || "",
    }).catch(() => ({ success: false, latencyMs: 0, error: "Connection test failed" }))

    const waba = await prisma.whatsAppBusinessAccount.findFirst({
      where: { clinicId },
    })

    const phone = await prisma.whatsAppPhoneNumber.findFirst({
      where: { clinicId },
    })

    return NextResponse.json({
      connected: integration.status === "connected",
      status: integration.status,
      enabled: integration.enabled,
      phoneNumber: phone?.displayPhoneNumber || meta.displayPhoneNumber || null,
      verifiedName: phone?.verifiedName || meta.verifiedName || null,
      businessName: waba?.verifiedName || null,
      businessAccountId: waba?.wabaId || meta.wabaId || null,
      webhookStatus: phone?.webhookConfigured ? "configured" : "not_configured",
      qualityRating: phone?.qualityRating || null,
      apiHealth: health.success ? "healthy" : "unhealthy",
      apiLatencyMs: health.latencyMs,
      apiError: health.error || null,
      lastSyncAt: integration.lastSyncAt,
    })
  } catch (error: any) {
    if (error?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    return NextResponse.json({ error: error.message || "Failed to get WhatsApp status" }, { status: 500 })
  }
}
