import { GRAPH_API } from "./types"
import { logger } from "@/lib/logger"
import type {
  WhatsAppConfig, WhatsAppSendMessageRequest, SendMessageResult,
  WhatsAppWebhookPayload, WhatsAppIncomingMessage, WhatsAppStatus,
  PhoneNumberInfo, WABAInfo, BusinessProfile, WhatsAppMessageType, WhatsAppContact,
} from "./types"

async function graphRequest(
  path: string,
  options: {
    method?: string
    body?: any
    accessToken: string
    params?: Record<string, string>
  },
): Promise<{ data: any; ok: boolean; status: number }> {
  const { method = "GET", body, accessToken, params } = options
  const url = new URL(`${GRAPH_API}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { data, ok: res.ok, status: res.status }
}

export async function sendMessage(
  config: WhatsAppConfig,
  to: string,
  payload: WhatsAppSendMessageRequest,
): Promise<SendMessageResult> {
  const { data, ok, status } = await graphRequest(
    `/${config.phoneNumberId}/messages`,
    { method: "POST", body: payload, accessToken: config.accessToken },
  )
  if (!ok) {
    return {
      success: false,
      error: data.error?.message || data.error?.error_data?.details || `HTTP ${status}`,
      statusCode: status,
    }
  }
  return { success: true, messageId: data.messages?.[0]?.id, statusCode: status }
}

export async function sendText(
  config: WhatsAppConfig,
  to: string,
  text: string,
  previewUrl = false,
): Promise<SendMessageResult> {
  return sendMessage(config, to, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: text, preview_url: previewUrl },
  })
}

export async function sendMedia(
  config: WhatsAppConfig,
  to: string,
  type: "image" | "video" | "audio" | "document" | "sticker",
  media: { id?: string; link?: string; caption?: string; filename?: string },
): Promise<SendMessageResult> {
  const body: WhatsAppSendMessageRequest = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type,
    [type]: media,
  }
  return sendMessage(config, to, body)
}

export async function sendLocation(
  config: WhatsAppConfig,
  to: string,
  location: { longitude: number; latitude: number; name?: string; address?: string },
): Promise<SendMessageResult> {
  return sendMessage(config, to, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "location",
    location,
  })
}

export async function sendContacts(
  config: WhatsAppConfig,
  to: string,
  contacts: WhatsAppContact[],
): Promise<SendMessageResult> {
  return sendMessage(config, to, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "contacts",
    contacts,
  })
}

export async function sendInteractiveButtons(
  config: WhatsAppConfig,
  to: string,
  bodyText: string,
  buttons: { id: string; title: string }[],
  headerText?: string,
  footerText?: string,
): Promise<SendMessageResult> {
  return sendMessage(config, to, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      ...(headerText ? { header: { type: "text", text: headerText } } : {}),
      body: { text: bodyText },
      ...(footerText ? { footer: { text: footerText } } : {}),
      action: {
        buttons: buttons.map((b) => ({ type: "reply" as const, reply: b })),
      },
    },
  })
}

export async function sendInteractiveList(
  config: WhatsAppConfig,
  to: string,
  bodyText: string,
  buttonText: string,
  sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[],
  headerText?: string,
  footerText?: string,
): Promise<SendMessageResult> {
  return sendMessage(config, to, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      ...(headerText ? { header: { type: "text", text: headerText } } : {}),
      body: { text: bodyText },
      ...(footerText ? { footer: { text: footerText } } : {}),
      action: {
        button: buttonText,
        sections,
      },
    },
  })
}

export async function sendTemplate(
  config: WhatsAppConfig,
  to: string,
  templateName: string,
  languageCode: string,
  components?: any[],
): Promise<SendMessageResult> {
  return sendMessage(config, to, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: { name: templateName, language: { code: languageCode }, components },
  })
}

export async function markAsRead(
  config: WhatsAppConfig,
  messageId: string,
): Promise<boolean> {
  const { ok } = await graphRequest(
    `/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      body: { messaging_product: "whatsapp", status: "read", message_id: messageId },
      accessToken: config.accessToken,
    },
  )
  return ok
}

export async function uploadMedia(
  config: WhatsAppConfig,
  fileBuffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  try {
    const formData = new FormData()
    const blob = new Blob([fileBuffer as unknown as BlobPart], { type: mimeType })
    formData.append("file", blob, filename)
    formData.append("type", mimeType)
    formData.append("messaging_product", "whatsapp")
    const res = await fetch(`${GRAPH_API}/${config.phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.accessToken}` },
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.error?.message || `HTTP ${res.status}` }
    return { success: true, mediaId: data.id }
  } catch (err: any) {
    return { success: false, error: err.message || "Upload failed" }
  }
}

export async function getMediaUrl(
  config: WhatsAppConfig,
  mediaId: string,
): Promise<string | null> {
  const { data, ok } = await graphRequest(
    `/${mediaId}`,
    { accessToken: config.accessToken },
  )
  return ok ? data.url || null : null
}

export async function downloadMedia(
  config: WhatsAppConfig,
  mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const url = await getMediaUrl(config, mediaId)
  if (!url) return null
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    })
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    return { buffer, mimeType: res.headers.get("content-type") || "application/octet-stream" }
  } catch {
    return null
  }
}

export async function getPhoneNumbers(
  accessToken: string,
  wabaId: string,
): Promise<PhoneNumberInfo[]> {
  const { data, ok } = await graphRequest(
    `/${wabaId}/phone_numbers`,
    { accessToken, params: { fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status,status" } },
  )
  if (!ok) return []
  return (data.data || []).map((pn: any) => ({
    id: pn.id,
    displayPhoneNumber: pn.display_phone_number,
    verifiedName: pn.verified_name,
    qualityRating: pn.quality_rating || "unknown",
    codeVerificationStatus: pn.code_verification_status,
    status: pn.status,
  }))
}

export async function getWABAs(
  accessToken: string,
  businessId: string,
): Promise<WABAInfo[]> {
  const { data, ok } = await graphRequest(
    `/${businessId}/client_whatsapp_business_accounts`,
    { accessToken, params: { fields: "id,name,currency,timezone_id,message_template_namespace" } },
  )
  if (!ok) return []
  return (data.data || []).map((w: any) => ({
    id: w.id,
    name: w.name,
    currency: w.currency,
    timezoneId: w.timezone_id,
    messageTemplateNamespace: w.message_template_namespace,
    businessId,
  }))
}

export async function getBusinesses(
  accessToken: string,
): Promise<{ id: string; name: string }[]> {
  const { data, ok } = await graphRequest("/me/businesses", { accessToken })
  if (!ok) return []
  return (data.data || []).map((b: any) => ({ id: b.id, name: b.name || "" }))
}

export async function registerWebhook(
  config: WhatsAppConfig,
  webhookUrl: string,
): Promise<boolean> {
  const { ok, data } = await graphRequest(
    `/${config.wabaId}/subscribed_apps`,
    {
      method: "POST",
      body: { subscribed_fields: ["messages", "message_template_status_update"] },
      accessToken: config.accessToken,
    },
  )
  if (!ok) {
    logger.error("WhatsApp webhook subscription failed", { error: data.error?.message })
    return false
  }
  return true
}

export async function unsubscribeWebhook(config: WhatsAppConfig): Promise<boolean> {
  const { ok } = await graphRequest(
    `/${config.wabaId}/subscribed_apps`,
    { method: "DELETE", accessToken: config.accessToken },
  )
  return ok
}

export async function setWebhookUrl(
  config: WhatsAppConfig,
  webhookUrl: string,
): Promise<boolean> {
  const { ok } = await graphRequest(
    `/${config.wabaId}/subscribed_apps`,
    {
      method: "POST",
      body: {
        override_webhook_url: webhookUrl,
        subscribed_fields: ["messages", "message_template_status_update"],
      },
      accessToken: config.accessToken,
    },
  )
  return ok
}

export async function getBusinessProfile(
  accessToken: string,
  phoneNumberId: string,
): Promise<BusinessProfile | null> {
  const { data, ok } = await graphRequest(
    `/${phoneNumberId}/whatsapp_business_profile`,
    { accessToken, params: { fields: "about,description,email,websites,address,vertical" } },
  )
  if (!ok) return null
  return {
    about: data.about || "",
    description: data.description || "",
    email: data.email,
    websites: data.websites,
    address: data.address,
    vertical: data.vertical,
  }
}

export async function updateBusinessProfile(
  config: WhatsAppConfig,
  profile: { about?: string; description?: string; email?: string; websites?: string[] },
): Promise<boolean> {
  const { ok } = await graphRequest(
    `/${config.phoneNumberId}/whatsapp_business_profile`,
    { method: "POST", body: { messaging_product: "whatsapp", ...profile }, accessToken: config.accessToken },
  )
  return ok
}

export async function testConnection(
  config: WhatsAppConfig,
): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  const start = Date.now()
  const { ok, data } = await graphRequest(
    `/${config.phoneNumberId}`,
    {
      accessToken: config.accessToken,
      params: { fields: "display_phone_number,verified_name" },
    },
  )
  const latencyMs = Date.now() - start
  if (!ok) {
    return { success: false, latencyMs, error: data.error?.message || "Connection test failed" }
  }
  return { success: true, latencyMs }
}

/**
 * Validates a manually supplied WhatsApp Cloud API configuration against the
 * Graph API. Confirms the access token can actually reach the given phone
 * number and WABA, and returns their display details for storage.
 */
export async function validateManualConfig(
  config: WhatsAppConfig,
): Promise<{ ok: boolean; error?: string; phoneNumber?: PhoneNumberInfo; waba?: WABAInfo }> {
  const [phoneRes, wabaRes] = await Promise.all([
    graphRequest(`/${config.phoneNumberId}`, {
      accessToken: config.accessToken,
      params: { fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status,status" },
    }),
    graphRequest(`/${config.wabaId}`, {
      accessToken: config.accessToken,
      params: { fields: "id,name,currency,timezone_id,message_template_namespace" },
    }),
  ])

  if (!phoneRes.ok) {
    return {
      ok: false,
      error: phoneRes.data.error?.message || `Phone Number ID ${config.phoneNumberId} is not accessible with this token`,
    }
  }
  if (!wabaRes.ok) {
    return {
      ok: false,
      error: wabaRes.data.error?.message || `WABA ID ${config.wabaId} is not accessible with this token`,
    }
  }

  return {
    ok: true,
    phoneNumber: {
      id: phoneRes.data.id || config.phoneNumberId,
      displayPhoneNumber: phoneRes.data.display_phone_number || "",
      verifiedName: phoneRes.data.verified_name || "",
      qualityRating: phoneRes.data.quality_rating || "unknown",
      codeVerificationStatus: phoneRes.data.code_verification_status,
      status: phoneRes.data.status,
    },
    waba: {
      id: wabaRes.data.id || config.wabaId,
      name: wabaRes.data.name,
      currency: wabaRes.data.currency,
      timezoneId: wabaRes.data.timezone_id,
      messageTemplateNamespace: wabaRes.data.message_template_namespace,
    },
  }
}

export function parseWebhookPayload(payload: any): WhatsAppWebhookPayload | null {
  if (!payload || payload.object !== "whatsapp_business_account") return null
  return payload as WhatsAppWebhookPayload
}

export function extractMessages(
  payload: WhatsAppWebhookPayload,
): { messages: WhatsAppIncomingMessage[]; statuses: WhatsAppStatus[]; phoneNumberId: string; clinicId?: string; errors: any[] } {
  const messages: WhatsAppIncomingMessage[] = []
  const statuses: WhatsAppStatus[] = []
  const errors: any[] = []
  let phoneNumberId = ""
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value
      phoneNumberId = value.metadata?.phone_number_id || phoneNumberId
      if (value.messages) messages.push(...value.messages)
      if (value.statuses) statuses.push(...value.statuses)
      if (value.errors) errors.push(...value.errors)
    }
  }
  return { messages, statuses, phoneNumberId, errors }
}

export function verifyWebhook(
  mode: string | null,
  token: string | null,
  challenge: string | null,
  expectedToken: string,
): string | null {
  if (mode === "subscribe" && token === expectedToken && challenge) {
    return challenge
  }
  return null
}

export function createTextPayload(to: string, text: string, previewUrl = false): WhatsAppSendMessageRequest {
  return { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: text, preview_url: previewUrl } }
}

export function createMediaPayload(
  to: string,
  type: "image" | "video" | "audio" | "document" | "sticker",
  media: { id?: string; link?: string; caption?: string; filename?: string },
): WhatsAppSendMessageRequest {
  return { messaging_product: "whatsapp", recipient_type: "individual", to, type, [type]: media }
}
