import type { Platform } from "@/messaging/types"

export type IntegrationStatusValue = "disconnected" | "connecting" | "connected" | "error" | "expired"

export interface OAuthConfig {
  clientId: string
  clientSecret: string
  scopes: string[]
  authUrl: string
  tokenUrl: string
  redirectPath: string
  extraParams?: Record<string, string>
}

export interface StoredCredentials {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  scopes: string[]
  providerUserId?: string
  providerAccountName?: string
  metadata?: Record<string, any>
}

export interface IntegrationStatus {
  platform: Platform
  enabled: boolean
  connected: boolean
  status: IntegrationStatusValue
  lastSyncAt: string | null
  lastErrorAt: string | null
  lastErrorMessage: string | null
  permissions: string[]
  webhookConfigured: boolean
  webhookUrl: string | null
  tokenExpiresAt: string | null
  providerName: string | null
  providerAvatar: string | null
}

export interface WebhookEvent {
  provider: Platform
  source: "whatsapp" | "instagram" | "messenger" | "telegram"
  raw: any
  type: "message" | "echo" | "read" | "delivery" | "unknown"
  timestamp: Date
}

export interface CalendarSlot {
  start: Date
  end: Date
  available: boolean
}

export interface SendMessageResult {
  success: boolean
  messageId?: string
  error?: string
}

export const META_OAUTH_CONFIG: OAuthConfig = {
  clientId: process.env.META_APP_ID || "",
  clientSecret: process.env.META_APP_SECRET || "",
  scopes: [
    "whatsapp_business_messaging",
    "whatsapp_business_management",
    "pages_messaging",
    "pages_manage_metadata",
    "instagram_basic",
    "instagram_manage_messages",
    "business_management",
  ],
  authUrl: "https://www.facebook.com/v20.0/dialog/oauth",
  tokenUrl: "https://graph.facebook.com/v20.0/oauth/access_token",
  redirectPath: "/api/integrations/meta/callback",
  extraParams: { config_id: process.env.META_WA_CONFIG_ID || "" },
}

export const GOOGLE_OAUTH_CONFIG: OAuthConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  scopes: [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ],
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  redirectPath: "/api/integrations/google/callback",
}

export const MICROSOFT_OAUTH_CONFIG: OAuthConfig = {
  clientId: process.env.MICROSOFT_CLIENT_ID || "",
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
  scopes: [
    "https://outlook.office.com/mail.send",
    "https://outlook.office.com/mail.read",
    "offline_access",
    "User.Read",
  ],
  authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  redirectPath: "/api/integrations/microsoft/callback",
}
