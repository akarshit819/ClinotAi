import { BaseConnector } from "../base"
import type { IncomingMessage, Platform, ProcessedMessage } from "../../types"

export class WebsiteConnector extends BaseConnector {
  platform: Platform = "website"

  validateRequest(body: any, headers: Record<string, string>): { valid: boolean; error?: string } {
    if (!body || !body.message) {
      return { valid: false, error: "Missing message field" }
    }
    if (typeof body.message !== "string" || body.message.length > 5000) {
      return { valid: false, error: "Invalid message length" }
    }
    return { valid: true }
  }

  async parseIncoming(body: any, headers: Record<string, string>, clinicId: string): Promise<IncomingMessage> {
    const visitorId = headers["x-visitor-id"] || body.visitorId || `web-${Date.now()}`
    const conversationId = headers["x-conversation-id"] || body.conversationId

    return {
      platform: "website",
      channelId: conversationId || visitorId,
      sourceMessageId: `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: {
        id: visitorId,
        name: body.patientName || body.name || undefined,
        phone: body.phone || undefined,
        email: body.email || undefined,
      },
      content: body.message,
      timestamp: new Date(),
      attachments: body.attachments || undefined,
      metadata: {
        conversationId,
        visitorId,
        userAgent: headers["user-agent"] || undefined,
        page: body.page || undefined,
      },
    }
  }

  async formatOutgoing(message: ProcessedMessage): Promise<{ body: any; headers: Record<string, string>; endpoint: string }> {
    return {
      body: { reply: message.content, conversationId: message.conversationId },
      headers: { "Content-Type": "application/json" },
      endpoint: "", // Website chat sends via WebSocket/SSE or direct response
    }
  }

  async sendMessage(message: ProcessedMessage, credentials: Record<string, string>): Promise<boolean> {
    return true
  }
}
