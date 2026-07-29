import type { SendMessageResult } from "./types"

const GRAPH_API = "https://graph.facebook.com/v20.0"

export interface MessengerConfig {
  accessToken: string
  pageId: string
  pageName: string
  businessId: string
}

export interface MessengerWebhookPayload {
  object: "page"
  entry: Array<{
    id: string
    time: number
    messaging: Array<{
      sender: { id: string }
      recipient: { id: string }
      timestamp: number
      message?: {
        mid: string
        text?: string
        is_echo?: boolean
        attachments?: Array<{
          type: string
          payload: { url: string; sticker_id?: number }
        }>
        quick_reply?: { payload: string }
      }
      postback?: {
        title: string
        payload: string
        mid: string
      }
      read?: {
        watermark: number
        seq: number
      }
      delivery?: {
        mids: string[]
        watermark: number
        seq: number
      }
    }>
  }>
}

export function verifyMessengerWebhook(
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

export function parseMessengerIncoming(payload: MessengerWebhookPayload): Array<{
  messageId: string
  senderId: string
  content: string
  timestamp: Date
  isEcho: boolean
  postback: boolean
  postbackPayload: string
  attachmentUrls: string[]
}> {
  const messages: Array<{
    messageId: string
    senderId: string
    content: string
    timestamp: Date
    isEcho: boolean
    postback: boolean
    postbackPayload: string
    attachmentUrls: string[]
  }> = []

  for (const entry of payload.entry || []) {
    for (const event of entry.messaging || []) {
      if (event.message && !event.message.is_echo) {
        messages.push({
          messageId: event.message.mid,
          senderId: event.sender.id,
          content: event.message.text || "",
          timestamp: new Date(event.timestamp),
          isEcho: false,
          postback: false,
          postbackPayload: "",
          attachmentUrls: (event.message.attachments || []).map((a) => a.payload.url),
        })
      }
      if (event.postback) {
        messages.push({
          messageId: event.postback.mid,
          senderId: event.sender.id,
          content: event.postback.title,
          timestamp: new Date(event.timestamp),
          isEcho: false,
          postback: true,
          postbackPayload: event.postback.payload,
          attachmentUrls: [],
        })
      }
    }
  }

  return messages
}

export async function sendMessengerMessage(
  config: MessengerConfig,
  recipientId: string,
  text: string,
): Promise<SendMessageResult> {
  try {
    const res = await fetch(
      `${GRAPH_API}/me/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
          messaging_type: "RESPONSE",
        }),
      },
    )

    const data = await res.json()

    if (!res.ok) {
      return { success: false, error: data.error?.message || `HTTP ${res.status}` }
    }

    return { success: true, messageId: data.message_id }
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" }
  }
}

export async function sendMessengerAction(
  config: MessengerConfig,
  recipientId: string,
  action: "mark_seen" | "typing_on" | "typing_off",
): Promise<boolean> {
  try {
    const res = await fetch(
      `${GRAPH_API}/me/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          sender_action: action,
        }),
      },
    )
    return res.ok
  } catch {
    return false
  }
}

export async function subscribePageToWebhook(
  accessToken: string,
  pageId: string,
  webhookUrl: string,
  verifyToken: string,
  fields: string[],
): Promise<boolean> {
  try {
    const res = await fetch(
      `${GRAPH_API}/${pageId}/subscribed_apps`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscribed_fields: fields,
        }),
      },
    )
    return res.ok
  } catch {
    return false
  }
}

export async function getMessengerProfile(
  accessToken: string,
  pageId: string,
): Promise<{ name: string; picture: string } | null> {
  try {
    const res = await fetch(
      `${GRAPH_API}/${pageId}?fields=name,picture`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    const data = await res.json()
    if (!res.ok) return null
    return {
      name: data.name || "",
      picture: data.picture?.data?.url || "",
    }
  } catch {
    return null
  }
}
