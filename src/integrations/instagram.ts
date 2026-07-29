import type { SendMessageResult } from "./types"

const GRAPH_API = "https://graph.facebook.com/v20.0"

export interface InstagramConfig {
  accessToken: string
  igBusinessAccountId: string
  businessId: string
}

export interface InstagramWebhookPayload {
  object: "instagram"
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
        attachments?: Array<{
          type: string
          payload: { url: string }
        }>
      }
    }>
  }>
}

export function parseInstagramIncoming(payload: InstagramWebhookPayload): Array<{
  messageId: string
  fromId: string
  content: string
  timestamp: Date
  attachmentUrls: string[]
}> {
  const messages: Array<{
    messageId: string
    fromId: string
    content: string
    timestamp: Date
    attachmentUrls: string[]
  }> = []

  for (const entry of payload.entry || []) {
    for (const event of entry.messaging || []) {
      if (!event.message) continue
      const msg = event.message
      messages.push({
        messageId: msg.mid,
        fromId: event.sender.id,
        content: msg.text || "",
        timestamp: new Date(event.timestamp),
        attachmentUrls: (msg.attachments || []).map((a) => a.payload.url),
      })
    }
  }

  return messages
}

export async function sendInstagramMessage(
  config: InstagramConfig,
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

export async function getInstagramConversations(
  config: InstagramConfig,
): Promise<Array<{ id: string; participantId: string; updatedAt: string }>> {
  try {
    const res = await fetch(
      `${GRAPH_API}/${config.igBusinessAccountId}/conversations?fields=id,participants,updated_time`,
      { headers: { Authorization: `Bearer ${config.accessToken}` } },
    )
    const data = await res.json()
    if (!res.ok) return []
    return (data.data || []).map((c: any) => ({
      id: c.id,
      participantId: c.participants?.data?.[0]?.id || "",
      updatedAt: c.updated_time || "",
    }))
  } catch {
    return []
  }
}

export async function getInstagramUserProfile(
  accessToken: string,
  igUserId: string,
): Promise<{ id: string; username: string; name: string; profilePic: string } | null> {
  try {
    const res = await fetch(
      `${GRAPH_API}/${igUserId}?fields=id,username,name,profile_pic`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    const data = await res.json()
    if (!res.ok) return null
    return {
      id: data.id,
      username: data.username || "",
      name: data.name || data.username || "",
      profilePic: data.profile_pic || "",
    }
  } catch {
    return null
  }
}
