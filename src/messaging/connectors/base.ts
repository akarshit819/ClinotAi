import type { IncomingMessage, Platform, ProcessedMessage } from "../types"

export interface PlatformConnector {
  platform: Platform
  validateRequest(body: any, headers: Record<string, string>): { valid: boolean; error?: string }
  parseIncoming(body: any, headers: Record<string, string>, clinicId: string): Promise<IncomingMessage>
  formatOutgoing(message: ProcessedMessage): Promise<{ body: any; headers: Record<string, string>; endpoint: string }>
  sendMessage(message: ProcessedMessage, credentials: Record<string, string>): Promise<boolean>
}

export abstract class BaseConnector implements PlatformConnector {
  abstract platform: Platform

  abstract validateRequest(body: any, headers: Record<string, string>): { valid: boolean; error?: string }

  abstract parseIncoming(body: any, headers: Record<string, string>, clinicId: string): Promise<IncomingMessage>

  abstract formatOutgoing(message: ProcessedMessage): Promise<{ body: any; headers: Record<string, string>; endpoint: string }>

  abstract sendMessage(message: ProcessedMessage, credentials: Record<string, string>): Promise<boolean>

  protected extractText(body: any, ...paths: string[]): string {
    for (const path of paths) {
      const parts = path.split(".")
      let val = body
      for (const part of parts) {
        if (val == null || typeof val !== "object") { val = undefined; break }
        val = val[part]
      }
      if (typeof val === "string" && val.trim()) return val.trim()
    }
    return ""
  }

  protected extractTimestamp(body: any, ...paths: string[]): Date {
    for (const path of paths) {
      const val = this.extractText(body, path)
      if (val) {
        const ts = new Date(val)
        if (!isNaN(ts.getTime())) return ts
      }
    }
    return new Date()
  }
}
