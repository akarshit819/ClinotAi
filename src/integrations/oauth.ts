import crypto from "crypto"
import { prisma } from "@/lib/db"
import { storeCredentials, getCredentials, deleteCredentials } from "./token-store"
import { getMessengerProfile, subscribePageToWebhook, sendMessengerMessage } from "./messenger"
import { getPhoneNumbers, getWABAs, getBusinesses } from "./whatsapp/api"
import { registerWebhook } from "./whatsapp/api"
import { listCalendars } from "./google-calendar"
import { getEnv } from "@/lib/env"
import { getEncryptionKey } from "@/lib/env"
import { logger } from "@/lib/logger"
import type { Platform } from "@/messaging/types"
import type { StoredCredentials } from "./types"

const STATE_EXPIRY = 10 * 60 * 1000
const OAUTH_STATE_COOKIE = "oauth_state"

function stateHmac(base64: string): string {
  return crypto.createHmac("sha256", getEncryptionKey()).update(base64).digest("hex")
}

export function generateState(clinicId: string, provider: string): { state: string; cookie: string } {
  const nonce = crypto.randomBytes(16).toString("hex")
  const payload = JSON.stringify({ clinicId, provider, nonce, exp: Date.now() + STATE_EXPIRY })
  const base64 = Buffer.from(payload).toString("base64url")
  const hmac = stateHmac(base64)
  const state = `${base64}.${hmac}`
  const cookie = `${OAUTH_STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${STATE_EXPIRY / 1000}`
  return { state, cookie }
}

export function verifyState(state: string): { clinicId: string; provider: string } | null {
  try {
    const parts = state.split(".")
    if (parts.length !== 2) return null
    const [base64, hmac] = parts

    const expectedHmac = stateHmac(base64)
    if (hmac !== expectedHmac) return null

    const payload = JSON.parse(Buffer.from(base64, "base64url").toString("utf8"))

    if (!payload.clinicId || !payload.provider) return null
    if (payload.exp < Date.now()) return null

    return { clinicId: payload.clinicId, provider: payload.provider }
  } catch {
    return null
  }
}

export function verifyStateCookie(state: string, cookieHeader: string | null): boolean {
  if (!cookieHeader) return false
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${OAUTH_STATE_COOKIE}=([^;]+)`))
  if (!match) return false
  const a = Buffer.from(match[1])
  const b = Buffer.from(state)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function getMetaAuthUrl(
  scopes: string[],
  state: string,
  redirectUri: string,
  configId?: string,
): string {
  const clientId = getEnv("META_APP_ID")
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: scopes.join(","),
  })

  // WhatsApp uses Meta's config-based Embedded Signup when a config ID is
  // configured. That flow redirects back to `redirect_uri?code=...&state=...`
  // exactly like the standard dialog, but the plain dialog does not return a
  // usable code for Embedded Signup apps.
  if (configId) {
    params.set("config_id", configId)
    return `https://www.facebook.com/oauth/embedded_signup/select_business?${params.toString()}`
  }

  return `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`
}

/**
 * Safe diagnostics for the WhatsApp/Meta configuration. Logged server-side only.
 * Never returns secret values.
 */
export function getWhatsAppConfigDiagnostics(): Record<string, string> {
  const present = (name: string) => (!!process.env[name] && process.env[name]!.trim() !== "" ? "set" : "missing")
  return {
    clientId: getBool(process.env.META_APP_ID),
    metaAppSecret: getBool(process.env.META_APP_SECRET),
    webhookSecret: getBool(process.env.WA_WEBHOOK_SECRET),
    appUrl: getBool(process.env.NEXT_PUBLIC_APP_URL),
    appUrlValueSafe: process.env.NEXT_PUBLIC_APP_URL ? "configured" : "missing",
    encryptionKey: getBool(process.env.ENCRYPTION_KEY),
    waConfigId: getBool(process.env.META_WA_CONFIG_ID),
    graphApi: process.env.META_GRAPH_API || "https://graph.facebook.com/v20.0",
  }
}

function getBool(v: string | undefined): "set" | "missing" {
  return v && v.trim() !== "" ? "set" : "missing"
}

function getGoogleAuthUrl(
  scopes: string[],
  state: string,
  redirectUri: string,
): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

function getMicrosoftAuthUrl(
  scopes: string[],
  state: string,
  redirectUri: string,
): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID || "",
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: scopes.join(" "),
  })
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

export function getAuthorizationUrl(
  provider: string,
  clinicId: string,
  baseUrl: string,
): { url: string; cookie: string } {
  const { state, cookie } = generateState(clinicId, provider)

  const redirectUri = `${baseUrl.replace(/\/+$/, "")}/api/integrations/${provider}/callback`

  switch (provider) {
    case "whatsapp": {
      const configId = process.env.META_WA_CONFIG_ID?.trim() || undefined
      logger.info("Starting WhatsApp OAuth", {
        clinicId,
        redirectUri,
        config: getWhatsAppConfigDiagnostics(),
        embeddedSignup: configId ? "configured" : "not configured",
      })
      const url = getMetaAuthUrl(
        ["whatsapp_business_management", "whatsapp_business_messaging", "business_management"],
        state,
        redirectUri,
        configId,
      )
      return { url, cookie }
    }
    case "instagram": {
      const url = getMetaAuthUrl(
        ["instagram_basic", "instagram_manage_messages", "business_management"],
        state,
        redirectUri,
      )
      return { url, cookie }
    }
    case "facebook": {
      const url = getMetaAuthUrl(
        ["pages_messaging", "pages_manage_metadata", "business_management"],
        state,
        redirectUri,
      )
      return { url, cookie }
    }
    case "google": {
      const url = getGoogleAuthUrl(
        [
          "https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/calendar.events",
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
        ],
        state,
        redirectUri,
      )
      return { url, cookie }
    }
    case "microsoft": {
      const url = getMicrosoftAuthUrl(
        ["https://outlook.office.com/mail.send", "offline_access", "User.Read"],
        state,
        redirectUri,
      )
      return { url, cookie }
    }
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

export async function exchangeCodeForToken(
  provider: string,
  code: string,
  baseUrl: string,
): Promise<StoredCredentials> {
  const redirectUri = `${baseUrl}/api/integrations/${provider}/callback`

  switch (provider) {
    case "whatsapp":
    case "instagram":
    case "facebook": {
      const clientId = getEnv("META_APP_ID")
      const clientSecret = getEnv("META_APP_SECRET")
      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      })

      const res = await fetch("https://graph.facebook.com/v20.0/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || "Failed to exchange code")

      const longLivedRes = await fetch(
        `https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${data.access_token}`,
      )
      const longLived = await longLivedRes.json()
      if (!longLivedRes.ok) throw new Error(longLived.error?.message || "Failed to extend token")

      return {
        accessToken: longLived.access_token || data.access_token,
        refreshToken: undefined,
        expiresAt: longLived.expires_in ? Date.now() + longLived.expires_in * 1000 : Date.now() + 86400000 * 60,
        scopes: (data.scope || "").split(","),
        metadata: {},
      }
    }
    case "google": {
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        code,
        grant_type: "authorization_code",
      })

      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error_description || data.error || "Failed to exchange code")

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
        scopes: (data.scope || "").split(" "),
        metadata: {},
      }
    }
    case "microsoft": {
      const params = new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID || "",
        client_secret: process.env.MICROSOFT_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        code,
        grant_type: "authorization_code",
      })

      const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error_description || data.error || "Failed to exchange code")

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
        scopes: (data.scope || "").split(" "),
        metadata: {},
      }
    }
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

export async function postProcessConnection(
  provider: string,
  clinicId: string,
  credentials: StoredCredentials,
): Promise<void> {
  switch (provider) {
    case "whatsapp": {
      const accessToken = credentials.accessToken
      if (!accessToken) {
        logger.error("WhatsApp postProcess: missing access token")
        break
      }

      const businesses = await getBusinesses(accessToken)
      if (businesses.length === 0) {
        logger.warn("WhatsApp postProcess: no businesses found for token", { clinicId })
        break
      }

      const businessId = businesses[0].id
      const wabas = await getWABAs(accessToken, businessId)

      if (wabas.length === 0) {
        logger.warn("WhatsApp postProcess: no WhatsApp Business Accounts found", { clinicId, businessId })
        break
      }

      const waba = wabas[0]
      const phoneNumbers = await getPhoneNumbers(accessToken, waba.id)
      const phoneNumber = phoneNumbers.find((pn) => pn.status === "connected") || phoneNumbers[0]

      if (!phoneNumber) {
        logger.warn("WhatsApp postProcess: no phone numbers found on WABA", { clinicId, wabaId: waba.id })
        break
      }

      credentials.metadata = {
        ...credentials.metadata,
        businessId,
        wabaId: waba.id,
        phoneNumberId: phoneNumber.id,
        displayPhoneNumber: phoneNumber.displayPhoneNumber,
        verifiedName: phoneNumber.verifiedName,
      }

      const wabaRecord = await prisma.whatsAppBusinessAccount.upsert({
        where: { clinicId_wabaId: { clinicId, wabaId: waba.id } },
        update: {
          businessId,
          verifiedName: waba.name || "",
          currency: waba.currency || "USD",
          timezoneId: waba.timezoneId || "America/New_York",
          messageTemplateNamespace: waba.messageTemplateNamespace || null,
          status: "connected",
        },
        create: {
          clinicId,
          wabaId: waba.id,
          businessId,
          verifiedName: waba.name || "",
          currency: waba.currency || "USD",
          timezoneId: waba.timezoneId || "America/New_York",
          messageTemplateNamespace: waba.messageTemplateNamespace || null,
          status: "connected",
        },
      })

      await prisma.whatsAppPhoneNumber.upsert({
        where: { clinicId_phoneNumberId: { clinicId, phoneNumberId: phoneNumber.id } },
        update: {
          displayPhoneNumber: phoneNumber.displayPhoneNumber,
          verifiedName: phoneNumber.verifiedName,
          qualityRating: phoneNumber.qualityRating,
          status: "connected",
        },
        create: {
          wabaId: wabaRecord.id,
          clinicId,
          phoneNumberId: phoneNumber.id,
          displayPhoneNumber: phoneNumber.displayPhoneNumber,
          verifiedName: phoneNumber.verifiedName,
          qualityRating: phoneNumber.qualityRating,
          status: "connected",
        },
      })

      const baseUrl = getEnv("NEXT_PUBLIC_APP_URL").replace(/\/+$/, "")
      const waConfig = { accessToken, phoneNumberId: phoneNumber.id, wabaId: waba.id, businessId }

      const subscribed = await registerWebhook(waConfig, `${baseUrl}/api/webhooks/whatsapp`)
      if (!subscribed) {
        logger.warn("WhatsApp postProcess: failed to subscribe app to WABA webhook", { clinicId, wabaId: waba.id })
      }

      await prisma.whatsAppPhoneNumber.updateMany({
        where: { clinicId, phoneNumberId: phoneNumber.id },
        data: { webhookConfigured: subscribed },
      })

      logger.info("WhatsApp postProcess completed", {
        clinicId,
        wabaId: waba.id,
        phoneNumberId: phoneNumber.id,
        webhookSubscribed: subscribed,
      })
      break
    }
    case "facebook": {
      const pagesRes = await fetch(
        "https://graph.facebook.com/v20.0/me/accounts",
        { headers: { Authorization: `Bearer ${credentials.accessToken}` } },
      )
      const pagesData = await pagesRes.json()
      const pages = pagesData.data || []
      if (pages.length > 0) {
        const page = pages[0]
        credentials.metadata = {
          ...credentials.metadata,
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.access_token,
        }

        const baseUrl = getEnv("NEXT_PUBLIC_APP_URL")
        await subscribePageToWebhook(
          page.access_token,
          page.id,
          `${baseUrl}/api/webhooks/messenger`,
          clinicId,
          ["messages", "messaging_postbacks", "message_deliveries", "message_reads"],
        )
      }
      break
    }
    case "instagram": {
      const pagesRes = await fetch(
        "https://graph.facebook.com/v20.0/me/accounts?fields=id,name,instagram_business_account",
        { headers: { Authorization: `Bearer ${credentials.accessToken}` } },
      )
      const pagesData = await pagesRes.json()
      const pages = pagesData.data || []
      for (const page of pages) {
        if (page.instagram_business_account) {
          credentials.metadata = {
            ...credentials.metadata,
            igBusinessAccountId: page.instagram_business_account.id,
            pageId: page.id,
            pageName: page.name,
          }
          break
        }
      }
      break
    }
    case "google": {
      const calRes = await listCalendars(credentials.accessToken)
      const primary = calRes.find((c) => c.primary)
      if (primary) {
        credentials.metadata = { ...credentials.metadata, calendarId: primary.id, calendarName: primary.summary }
      }

      const userRes = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${credentials.accessToken}` } },
      )
      const userData = await userRes.json()
      if (userData.email) {
        credentials.metadata = {
          ...credentials.metadata,
          email: userData.email,
          name: userData.name,
          avatar: userData.picture,
        }
      }
      break
    }
    case "microsoft": {
      const userRes = await fetch(
        "https://graph.microsoft.com/v1.0/me",
        { headers: { Authorization: `Bearer ${credentials.accessToken}` } },
      )
      const userData = await userRes.json()
      if (userData.mail || userData.userPrincipalName) {
        credentials.metadata = {
          ...credentials.metadata,
          email: userData.mail || userData.userPrincipalName,
          name: userData.displayName,
        }
      }
      break
    }
  }

  if (credentials.metadata?.email) {
    credentials.providerAccountName = credentials.metadata.email
  } else if (credentials.metadata?.pageName) {
    credentials.providerAccountName = credentials.metadata.pageName
  } else if (credentials.metadata?.displayPhoneNumber) {
    credentials.providerAccountName = credentials.metadata.displayPhoneNumber
  } else if (credentials.metadata?.verifiedName) {
    credentials.providerAccountName = credentials.metadata.verifiedName
  }

  await storeCredentials(clinicId, provider, credentials)
}
