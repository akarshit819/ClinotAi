import { prisma } from "@/lib/db"
import { storeCredentials, getCredentials, deleteCredentials, updateCredentials } from "./token-store"
import { getEnv } from "@/lib/env"
import { getPlanBySlug } from "@/lib/billing/plans"
import { ACTIVE_INTEGRATION_PLATFORMS } from "@/config/constants"
import type { IntegrationStatus, IntegrationStatusValue, StoredCredentials } from "./types"
import type { Platform } from "@/messaging/types"

// Only platforms listed here are surfaced to users. WhatsApp is the only
// active integration today; re-enable others by adding them back.
const CONNECTABLE_PLATFORMS: Platform[] = [...ACTIVE_INTEGRATION_PLATFORMS] as unknown as Platform[]

/**
 * Allows connecting integrations unless the clinic explicitly has a plan that
 * disables both the `integrations` and `whatsapp` features. Clinics without a
 * subscription (e.g. freshly onboarded or demo clinics) are allowed so the
 * core WhatsApp flow is never blocked by an unrelated billing state.
 */
export async function requireIntegrationsConnectable(clinicId: string): Promise<void> {
  const sub = await prisma.subscription.findFirst({
    where: { clinicId },
    orderBy: { createdAt: "desc" },
  })
  if (!sub) return

  const plan = await getPlanBySlug(sub.plan)
  if (!plan) return

  if (plan.features.integrations || plan.features.whatsapp) return

  throw new Error(`Integrations are not enabled on your current plan`)
}

export async function getAllIntegrationStatuses(clinicId: string): Promise<IntegrationStatus[]> {
  const integrations = await prisma.integration.findMany({
    where: { clinicId },
  })

  return Promise.all(
    CONNECTABLE_PLATFORMS.map(async (platform) => {
      const db = integrations.find((i) => i.platform === platform)
      const creds = db?.credentials ? await getCredentials(clinicId, platform).catch(() => null) : null
      return buildStatus(platform, db, creds)
    }),
  )
}

export async function getIntegrationStatus(
  clinicId: string,
  platform: Platform,
): Promise<IntegrationStatus> {
  const db = await prisma.integration.findUnique({
    where: { clinicId_platform: { clinicId, platform } },
  })
  const creds = db?.credentials ? await getCredentials(clinicId, platform).catch(() => null) : null
  return buildStatus(platform, db, creds)
}

function buildStatus(
  platform: Platform,
  db: any,
  creds: StoredCredentials | null,
): IntegrationStatus {
  const tokenExpired = creds?.expiresAt ? Date.now() > creds.expiresAt : false
  const hasError = db?.status === "error"
  const isExpired = db?.status === "expired" || tokenExpired

  let status: IntegrationStatusValue = "disconnected"
  if (db?.status === "connected" && creds && !tokenExpired) {
    status = "connected"
  } else if (db?.status === "connected" && tokenExpired) {
    status = "expired"
  } else if (hasError) {
    status = "error"
  }

  return {
    platform,
    enabled: db?.enabled ?? false,
    connected: status === "connected",
    status,
    lastSyncAt: db?.lastSyncAt?.toISOString() ?? null,
    lastErrorAt: null,
    lastErrorMessage: null,
    permissions: creds?.scopes ?? [],
    webhookConfigured: !!db?.webhookSecret,
    webhookUrl: db?.settings ? getWebhookUrl(platform) : null,
    tokenExpiresAt: creds?.expiresAt ? new Date(creds.expiresAt).toISOString() : null,
    providerName: creds?.providerAccountName ?? null,
    providerAvatar: creds?.metadata?.avatar ?? null,
  }
}

function getWebhookUrl(platform: string): string {
  const baseUrl = getEnv("NEXT_PUBLIC_APP_URL")
  return `${baseUrl}/api/webhooks/${platform}`
}

export async function setIntegrationError(
  clinicId: string,
  platform: Platform,
  errorMessage: string,
): Promise<void> {
  await prisma.integration.update({
    where: { clinicId_platform: { clinicId, platform } },
    data: { status: "error" },
  })
}

export async function checkAndRefreshToken(
  clinicId: string,
  platform: Platform,
): Promise<boolean> {
  const creds = await getCredentials(clinicId, platform)
  if (!creds) return false

  if (!creds.expiresAt || Date.now() < creds.expiresAt - 300000) {
    return true
  }

  if (creds.refreshToken) {
    return refreshOAuthToken(clinicId, platform, creds)
  }

  await updateCredentials(clinicId, platform, { expiresAt: undefined })
  return true
}

async function refreshOAuthToken(
  clinicId: string,
  platform: Platform,
  creds: StoredCredentials,
): Promise<boolean> {
  const provider = getProviderConfig(platform)
  if (!provider) return false

  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: creds.refreshToken!,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
    })

    const res = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })

    if (!res.ok) {
      await setIntegrationError(clinicId, platform, "Token refresh failed")
      return false
    }

    const data = await res.json()
    await storeCredentials(clinicId, platform, {
      ...creds,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || creds.refreshToken,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    })
    return true
  } catch {
    await setIntegrationError(clinicId, platform, "Token refresh network error")
    return false
  }
}

function getProviderConfig(platform: Platform) {
  const metaClientId = getEnv("META_APP_ID")
  const metaClientSecret = getEnv("META_APP_SECRET")
  const configs: Record<string, { clientId: string; clientSecret: string; tokenUrl: string }> = {
    whatsapp: {
      clientId: metaClientId,
      clientSecret: metaClientSecret,
      tokenUrl: "https://graph.facebook.com/v20.0/oauth/access_token",
    },
    instagram: {
      clientId: metaClientId,
      clientSecret: metaClientSecret,
      tokenUrl: "https://graph.facebook.com/v20.0/oauth/access_token",
    },
    facebook: {
      clientId: metaClientId,
      clientSecret: metaClientSecret,
      tokenUrl: "https://graph.facebook.com/v20.0/oauth/access_token",
    },
    email: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      tokenUrl: "https://oauth2.googleapis.com/token",
    },
  }
  return configs[platform] || null
}

export const connectablePlatforms: Platform[] = CONNECTABLE_PLATFORMS
