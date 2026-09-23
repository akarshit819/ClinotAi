import { BaseConnector } from "../base"
import type { IncomingMessage, Platform, ProcessedMessage } from "../../types"
import type { WhatsAppWebhookPayload, WhatsAppIncomingMessage, WhatsAppConfig } from "@/integrations/whatsapp/types"
import { parseWebhookPayload, extractMessages } from "@/integrations/whatsapp/api"
import { sendWithRateLimit } from "@/integrations/whatsapp/delivery"
import { createTextPayload, createMediaPayload, sendMessage } from "@/integrations/whatsapp/api"
import { getCredentials } from "@/integrations/token-store"
import { evaluateMessagingPolicy, getTemplateForScenario } from "@/lib/messaging/policy"
import { prisma } from "@/lib/db"

export class WhatsAppConnector extends BaseConnector {
  platform: Platform = "whatsapp"

  validateRequest(body: any, headers: Record<string, string>): { valid: boolean; error?: string } {
    if (!body) return { valid: false, error: "Empty body" }
    if (body.object && body.object !== "whatsapp_business_account") {
      return { valid: false, error: "Invalid webhook object" }
    }
    return { valid: true }
  }

  async parseIncoming(body: any, _headers: Record<string, string>, clinicId: string): Promise<IncomingMessage> {
    const payload = parseWebhookPayload(body)
    if (!payload) throw new Error("Invalid WhatsApp webhook payload")

    const { messages } = extractMessages(payload)
    if (messages.length === 0) throw new Error("No messages in payload")

    const msg = messages[0]
    const rawContactName = body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name
    const contactName = rawContactName && rawContactName.trim().length > 0 && rawContactName.trim().toLowerCase() !== "unknown"
      ? rawContactName.trim()
      : undefined

    return {
      platform: "whatsapp",
      channelId: msg.from,
      sourceMessageId: msg.id,
      from: {
        id: msg.from,
        name: contactName,
        phone: msg.from,
      },
      content: this.extractContent(msg),
      timestamp: new Date(parseInt(msg.timestamp) * 1000),
      attachments: this.extractAttachments(msg),
      metadata: {
        rawType: msg.type,
        context: msg.context,
        replyTo: msg.context?.message_id,
        reaction: msg.reaction,
        location: msg.location,
        contacts: msg.contacts,
      },
    }
  }

  async formatOutgoing(message: ProcessedMessage): Promise<{ body: any; headers: Record<string, string>; endpoint: string }> {
    const to = message.metadata?.channelId || message.metadata?.from || ""
    const payload = this.buildPayload(message, to)
    return {
      body: payload,
      headers: { "Content-Type": "application/json" },
      endpoint: "", // resolved at send time
    }
  }

  async sendMessage(message: ProcessedMessage, credentials: Record<string, string>): Promise<boolean> {
    // Determine message type and template if applicable
    const isAppointmentRelated = message.metadata?.isAppointmentRelated === true
    const templateName = message.metadata?.templateName
    const templateLanguage = message.metadata?.templateLanguage
    const templateComponents = message.metadata?.templateComponents

    // Evaluate messaging policy
    const policyDecision = await evaluateMessagingPolicy({
      clinicId: message.clinicId,
      phoneNumberId: credentials.phoneNumberId,
      platform: "whatsapp",
      messageType: templateName ? "template" : "freeform",
      templateName,
      templateLanguage,
      templateComponents,
      isAppointmentRelated,
    })

    if (!policyDecision.allowed) {
      // Log and fail gracefully
      return false
    }

    const to = message.metadata?.channelId || message.metadata?.from || ""
    if (!to) return false

    let payload: any

    if (policyDecision.type === "template") {
      // Send template message
      const templateName = policyDecision.templateName
      const languageCode = policyDecision.languageCode || "en_US"
      const components = message.metadata?.templateComponents
      
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components: templateComponents,
        },
      }
    } else {
      // Send freeform message
      payload = this.buildPayload(message, to)
    }

    if (!payload) return false

    const config: WhatsAppConfig = {
      accessToken: credentials.accessToken,
      phoneNumberId: credentials.phoneNumberId,
      wabaId: credentials.wabaId,
      businessId: credentials.businessId,
    }

    const result = await sendWithRateLimit(config, to, payload)
    return result.success
  }

  private extractContent(msg: WhatsAppIncomingMessage): string {
    if (msg.text?.body) return msg.text.body
    if (msg.interactive?.button_reply?.title) return msg.interactive.button_reply.title
    if (msg.interactive?.list_reply?.title) return msg.interactive.list_reply.title
    if (msg.button?.text) return msg.button.text
    if (msg.image?.caption) return msg.image.caption
    if (msg.video?.caption) return msg.video.caption
    if (msg.document?.caption) return msg.document.caption
    if (msg.location) return `Location: ${msg.location.latitude},${msg.location.longitude}`
    if (msg.contacts?.length) return `Contact: ${msg.contacts[0]?.name?.formatted_name || "shared"}`
    if (msg.system?.body) return msg.system.body
    return `[${msg.type || "unknown"} message]`
  }

  private extractAttachments(msg: WhatsAppIncomingMessage) {
    const attachments: { type: "image" | "file" | "audio" | "video"; url: string; name: string; mimeType?: string }[] = []
    if (msg.image?.id) attachments.push({ type: "image", url: msg.image.id, name: "image", mimeType: msg.image.mime_type })
    if (msg.video?.id) attachments.push({ type: "video", url: msg.video.id, name: "video", mimeType: msg.video.mime_type })
    if (msg.audio?.id) attachments.push({ type: "audio", url: msg.audio.id, name: "audio", mimeType: msg.audio.mime_type })
    if (msg.voice?.id) attachments.push({ type: "audio", url: msg.voice.id, name: "voice", mimeType: msg.voice.mime_type })
    if (msg.document?.id) attachments.push({ type: "file", url: msg.document.id, name: msg.document.filename || "document", mimeType: msg.document.mime_type })
    if (msg.sticker?.id) attachments.push({ type: "image", url: msg.sticker.id, name: "sticker", mimeType: msg.sticker.mime_type })
    return attachments.length > 0 ? attachments : undefined
  }

  private buildPayload(message: ProcessedMessage, to: string) {
    const attachments = message.attachments || []
    if (attachments.length > 0) {
      const att = attachments[0]
      const typeMap: Record<string, "image" | "video" | "audio" | "document" | "sticker"> = {
        image: "image", video: "video", audio: "audio", file: "document",
      }
      const mediaType = typeMap[att.type] || "document"
      return createMediaPayload(to, mediaType, { id: att.url, caption: message.content, filename: att.name })
    }
    return createTextPayload(to, message.content)
  }
}
