import { BaseConnector } from "../base"
import type { IncomingMessage, Platform, ProcessedMessage } from "../../types"
import { parseInstagramIncoming } from "@/integrations/instagram"
import { sendInstagramMessage } from "@/integrations/instagram"
import crypto from "crypto"

export class InstagramConnector extends BaseConnector {
  platform: Platform = "instagram"

  validateRequest(body: any, headers: Record<string, string>): { valid: boolean; error?: string } {
    if (!body) return { valid: false, error: "Empty body" }
    if (body.object && body.object !== "instagram") {
      return { valid: false, error: "Invalid webhook object" }
    }

    // Verify Meta signature
    const signatureHeader = headers["x-hub-signature-256"]
    const rawBody = JSON.stringify(body)
    const appSecret = process.env.META_APP_SECRET

    if (!appSecret) {
      return { valid: false, error: "META_APP_SECRET not configured" }
    }

    const isValid = this.verifySignature(rawBody, signatureHeader, appSecret)
    if (!isValid) {
      return { valid: false, error: "Invalid webhook signature" }
    }

    return { valid: true }
  }

  private verifySignature(rawBody: string, signatureHeader: string | undefined, appSecret: string): boolean {
    if (!signatureHeader) return false

    const prefix = "sha256="
    if (!signatureHeader.startsWith(prefix)) return false

    const receivedSig = signatureHeader.slice(prefix.length)
    if (!/^[a-f0-9]{64}$/i.test(receivedSig)) return false

    const expectedSig = crypto
      .createHmac("sha256", appSecret)
      .update(rawBody, "utf8")
      .digest("hex")

    try {
      const bufA = Buffer.from(expectedSig)
      const bufB = Buffer.from(receivedSig)
      if (bufA.length !== bufB.length) return false
      return crypto.timingSafeEqual(bufA, bufB)
    } catch {
      return false
    }
  }

  async parseIncoming(body: any, _headers: Record<string, string>, clinicId: string): Promise<IncomingMessage> {
    const messages = (await import("@/integrations/instagram")).parseInstagramIncoming(body)
    if (messages.length === 0) throw new Error("No messages in payload")

    const msg = messages[0]

    return {
      platform: "instagram",
      channelId: msg.fromId,
      sourceMessageId: msg.messageId,
      from: {
        id: msg.fromId,
        name: undefined,
      },
      content: msg.content,
      timestamp: msg.timestamp,
      attachments: msg.attachmentUrls?.length ? msg.attachmentUrls.map((url) => ({ type: "file" as const, url, name: "attachment" })) : undefined,
      metadata: {
        rawType: "message",
      },
    }
  }

  async formatOutgoing(message: ProcessedMessage): Promise<{ body: any; headers: Record<string, string>; endpoint: string }> {
    return {
      body: { text: message.content },
      headers: { "Content-Type": "application/json" },
      endpoint: "",
    }
  }

  async sendMessage(message: ProcessedMessage, credentials: Record<string, string>): Promise<boolean> {
    const config = {
      accessToken: credentials.accessToken,
      igBusinessAccountId: credentials.igBusinessAccountId,
      businessId: credentials.businessId || "",
    }

    const to = message.metadata?.channelId || message.metadata?.from || ""
    if (!to) return false

    const result = await sendInstagramMessage(config, to, message.content)
    return result.success
  }
}