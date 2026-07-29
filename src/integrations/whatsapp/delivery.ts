import { sendMessage } from "./api"
import type { WhatsAppConfig, WhatsAppSendMessageRequest, SendMessageResult } from "./types"

interface QueuedMessage {
  id: string
  config: WhatsAppConfig
  to: string
  payload: WhatsAppSendMessageRequest
  retriesLeft: number
  priority: number
  createdAt: Date
}

const RATE_LIMIT_WINDOW = 1000
const MAX_MESSAGES_PER_WINDOW = 250
const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 5000, 30000]

const messageQueue: QueuedMessage[] = []
let processing = false
let windowCount = 0
let windowStart = Date.now()

export class DeliveryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = "DeliveryError"
  }
}

function isRetryable(error: string, statusCode?: number): boolean {
  if (statusCode) {
    if (statusCode === 429) return true
    if (statusCode >= 500) return true
    if (statusCode === 400 && error.includes("ratelimit")) return true
  }
  const retryableErrors = [
    "rate limit", "ratelimit", "too many", "timeout",
    "service unavailable", "internal error", "connection",
    "network", "temporary", "retry",
  ]
  return retryableErrors.some((e) => error.toLowerCase().includes(e))
}

export async function sendWithRetry(
  config: WhatsAppConfig,
  to: string,
  payload: WhatsAppSendMessageRequest,
  options?: { retries?: number; priority?: number },
): Promise<SendMessageResult> {
  const maxRetries = options?.retries ?? MAX_RETRIES
  let lastError: string | undefined
  let lastStatusCode: number | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)]
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
      const result = await sendMessage(config, to, payload)
      if (result.success) return result
      lastError = result.error
      lastStatusCode = result.statusCode
      if (!isRetryable(result.error ?? "", result.statusCode)) {
        return result
      }
    } catch (err: any) {
      lastError = err.message || "Unknown error"
      if (!isRetryable(lastError ?? "")) {
        return { success: false, error: lastError }
      }
    }
  }
  return { success: false, error: lastError || "Max retries exceeded", statusCode: lastStatusCode }
}

export async function sendWithRateLimit(
  config: WhatsAppConfig,
  to: string,
  payload: WhatsAppSendMessageRequest,
): Promise<SendMessageResult> {
  const now = Date.now()
  if (now - windowStart > RATE_LIMIT_WINDOW) {
    windowCount = 0
    windowStart = now
  }
  if (windowCount >= MAX_MESSAGES_PER_WINDOW) {
    const waitTime = RATE_LIMIT_WINDOW - (now - windowStart)
    await new Promise((resolve) => setTimeout(resolve, waitTime))
    windowCount = 0
    windowStart = Date.now()
  }
  windowCount++
  return sendWithRetry(config, to, payload)
}

export function enqueueMessage(
  config: WhatsAppConfig,
  to: string,
  payload: WhatsAppSendMessageRequest,
  options?: { retries?: number; priority?: number },
): string {
  const id = `wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const retriesLeft = options?.retries ?? MAX_RETRIES
  messageQueue.push({
    id,
    config,
    to,
    payload,
    retriesLeft,
    priority: options?.priority ?? 0,
    createdAt: new Date(),
  })
  messageQueue.sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime())
  if (!processing) processQueue()
  return id
}

export function getQueueLength(): number {
  return messageQueue.length
}

async function processQueue(): Promise<void> {
  if (processing) return
  processing = true
  try {
    while (messageQueue.length > 0) {
      const item = messageQueue.shift()
      if (!item) continue

      const result = await sendWithRateLimit(item.config, item.to, item.payload)

      if (!result.success && item.retriesLeft > 0 && isRetryable(result.error || "", result.statusCode)) {
        const delay = RETRY_DELAYS[MAX_RETRIES - item.retriesLeft] || 30000
        setTimeout(() => {
          messageQueue.push({ ...item, retriesLeft: item.retriesLeft - 1 })
        }, delay)
      }
    }
  } finally {
    processing = false
  }
}
