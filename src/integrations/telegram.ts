import type { SendMessageResult } from "./types"

const TELEGRAM_API = "https://api.telegram.org/bot"

export interface TelegramConfig {
  botToken: string
  botUsername?: string
}

export interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: {
      id: number
      is_bot: boolean
      first_name: string
      last_name?: string
      username?: string
      language_code?: string
    }
    chat: {
      id: number
      type: "private" | "group" | "supergroup" | "channel"
      first_name?: string
      last_name?: string
      username?: string
      title?: string
    }
    date: number
    text?: string
    entities?: Array<{
      type: string
      offset: number
      length: number
    }>
  }
  callback_query?: {
    id: string
    from: { id: number; first_name: string; username?: string }
    message: { message_id: number; chat: { id: number } }
    data: string
  }
}

export function parseTelegramUpdate(update: TelegramUpdate): {
  type: "message" | "callback_query"
  messageId: string
  chatId: number
  fromId: number
  fromName: string
  text: string
  timestamp: Date
  callbackData?: string
} | null {
  if (update.message) {
    return {
      type: "message",
      messageId: update.message.message_id.toString(),
      chatId: update.message.chat.id,
      fromId: update.message.from?.id || 0,
      fromName: update.message.from?.first_name || "Unknown",
      text: update.message.text || "",
      timestamp: new Date(update.message.date * 1000),
    }
  }

  if (update.callback_query) {
    return {
      type: "callback_query",
      messageId: update.callback_query.id,
      chatId: update.callback_query.message.chat.id,
      fromId: update.callback_query.from.id,
      fromName: update.callback_query.from.first_name,
      text: update.callback_query.data || "",
      timestamp: new Date(),
      callbackData: update.callback_query.data,
    }
  }

  return null
}

function getApiUrl(botToken: string, method: string): string {
  return `${TELEGRAM_API}${botToken}/${method}`
}

export async function setTelegramWebhook(
  botToken: string,
  webhookUrl: string,
  secretToken?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const body: any = { url: webhookUrl, drop_pending_updates: true }
    if (secretToken) body.secret_token = secretToken

    const res = await fetch(getApiUrl(botToken, "setWebhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const data = await res.json()

    if (!data.ok) {
      return { success: false, error: data.description || "Unknown error" }
    }

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" }
  }
}

export async function getTelegramWebhookInfo(
  botToken: string,
): Promise<{ url: string; hasCustomCertificate: boolean; pendingUpdateCount: number } | null> {
  try {
    const res = await fetch(getApiUrl(botToken, "getWebhookInfo"))
    const data = await res.json()
    if (!data.ok) return null
    return {
      url: data.result.url || "",
      hasCustomCertificate: data.result.has_custom_certificate || false,
      pendingUpdateCount: data.result.pending_update_count || 0,
    }
  } catch {
    return null
  }
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
): Promise<SendMessageResult> {
  try {
    const res = await fetch(getApiUrl(botToken, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    })

    const data = await res.json()

    if (!data.ok) {
      return { success: false, error: data.description || `HTTP ${res.status}` }
    }

    return { success: true, messageId: data.result?.message_id?.toString() }
  } catch (err: any) {
    return { success: false, error: err.message || "Network error" }
  }
}

export async function getTelegramBotInfo(
  botToken: string,
): Promise<{ id: number; username: string; firstName: string; canJoinGroups: boolean } | null> {
  try {
    const res = await fetch(getApiUrl(botToken, "getMe"))
    const data = await res.json()
    if (!data.ok) return null
    return {
      id: data.result.id,
      username: data.result.username || "",
      firstName: data.result.first_name || "",
      canJoinGroups: data.result.can_join_groups || false,
    }
  } catch {
    return null
  }
}

export async function deleteTelegramWebhook(
  botToken: string,
): Promise<boolean> {
  try {
    const res = await fetch(getApiUrl(botToken, "deleteWebhook"), {
      method: "POST",
    })
    const data = await res.json()
    return data.ok
  } catch {
    return false
  }
}
