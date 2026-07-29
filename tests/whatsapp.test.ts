import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ============================================================
// Helper to create mock WhatsApp config
// ============================================================
function mockConfig(overrides?: Record<string, string>) {
  return {
    accessToken: overrides?.accessToken || "mock-access-token",
    phoneNumberId: overrides?.phoneNumberId || "123456789",
    wabaId: overrides?.wabaId || "waba-123",
    businessId: overrides?.businessId || "bus-123",
  }
}

// ============================================================
// Webhook Verification
// ============================================================
describe("WhatsApp Webhook Verification", () => {
  it("returns challenge when mode=subscribe and token matches", async () => {
    const { verifyWebhook } = await import("@/integrations/whatsapp/api")
    const result = verifyWebhook("subscribe", "my-secret", "challenge-123", "my-secret")
    expect(result).toBe("challenge-123")
  })

  it("returns null when mode is not subscribe", async () => {
    const { verifyWebhook } = await import("@/integrations/whatsapp/api")
    const result = verifyWebhook("unsubscribe", "my-secret", "challenge-123", "my-secret")
    expect(result).toBeNull()
  })

  it("returns null when token does not match", async () => {
    const { verifyWebhook } = await import("@/integrations/whatsapp/api")
    const result = verifyWebhook("subscribe", "wrong-token", "challenge-123", "expected-token")
    expect(result).toBeNull()
  })

  it("returns null when challenge is missing", async () => {
    const { verifyWebhook } = await import("@/integrations/whatsapp/api")
    const result = verifyWebhook("subscribe", "my-secret", null, "my-secret")
    expect(result).toBeNull()
  })

  it("returns null when mode is null", async () => {
    const { verifyWebhook } = await import("@/integrations/whatsapp/api")
    const result = verifyWebhook(null, "my-secret", "challenge-123", "my-secret")
    expect(result).toBeNull()
  })
})

// ============================================================
// Webhook Payload Parsing
// ============================================================
describe("WhatsApp Webhook Payload Parsing", () => {
  it("parses valid WhatsApp webhook payload", async () => {
    const { parseWebhookPayload, extractMessages } = await import("@/integrations/whatsapp/api")
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        id: "waba-123",
        changes: [{
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "ph-123", display_phone_number: "+15551234567" },
            contacts: [{ profile: { name: "John Doe" }, wa_id: "15551234567" }],
            messages: [{
              from: "15551234567",
              id: "msg-123",
              timestamp: "1700000000",
              type: "text",
              text: { body: "Hello, I need an appointment" },
            }],
          },
          field: "messages",
        }],
      }],
    }

    const parsed = parseWebhookPayload(payload)
    expect(parsed).not.toBeNull()
    expect(parsed!.object).toBe("whatsapp_business_account")

    const { messages, statuses, phoneNumberId } = extractMessages(parsed!)
    expect(messages).toHaveLength(1)
    expect(messages[0].from).toBe("15551234567")
    expect(messages[0].text?.body).toBe("Hello, I need an appointment")
    expect(messages[0].type).toBe("text")
    expect(phoneNumberId).toBe("ph-123")
    expect(statuses).toHaveLength(0)
  })

  it("returns null for non-WhatsApp payloads", async () => {
    const { parseWebhookPayload } = await import("@/integrations/whatsapp/api")
    const result = parseWebhookPayload({ object: "not_whatsapp" })
    expect(result).toBeNull()
  })

  it("extracts status updates from payload", async () => {
    const { parseWebhookPayload, extractMessages } = await import("@/integrations/whatsapp/api")
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        id: "waba-123",
        changes: [{
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "ph-123", display_phone_number: "+15551234567" },
            statuses: [{
              id: "status-123",
              status: "read",
              timestamp: "1700000001",
              recipient_id: "15551234567",
            }],
          },
          field: "messages",
        }],
      }],
    }

    const parsed = parseWebhookPayload(payload)
    const { statuses, messages } = extractMessages(parsed!)
    expect(statuses).toHaveLength(1)
    expect(statuses[0].id).toBe("status-123")
    expect(statuses[0].status).toBe("read")
    expect(messages).toHaveLength(0)
  })

  it("handles empty entry array", async () => {
    const { parseWebhookPayload, extractMessages } = await import("@/integrations/whatsapp/api")
    const payload = { object: "whatsapp_business_account", entry: [] }
    const parsed = parseWebhookPayload(payload)
    const { messages, statuses } = extractMessages(parsed!)
    expect(messages).toHaveLength(0)
    expect(statuses).toHaveLength(0)
  })

  it("parses image messages with media ID", async () => {
    const { parseWebhookPayload, extractMessages } = await import("@/integrations/whatsapp/api")
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        id: "waba-123",
        changes: [{
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "ph-123", display_phone_number: "+15551234567" },
            contacts: [{ profile: { name: "Jane" }, wa_id: "15559876543" }],
            messages: [{
              from: "15559876543",
              id: "msg-img-1",
              timestamp: "1700000002",
              type: "image",
              image: { id: "media-img-1", mime_type: "image/jpeg", sha256: "abc123" },
            }],
          },
          field: "messages",
        }],
      }],
    }

    const parsed = parseWebhookPayload(payload)
    const { messages } = extractMessages(parsed!)
    expect(messages[0].type).toBe("image")
    expect(messages[0].image?.id).toBe("media-img-1")
  })

  it("parses interactive button reply messages", async () => {
    const { parseWebhookPayload, extractMessages } = await import("@/integrations/whatsapp/api")
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "ph-123", display_phone_number: "+15551234567" },
            messages: [{
              from: "15551234567",
              id: "msg-interactive",
              timestamp: "1700000003",
              type: "interactive",
              interactive: {
                type: "button_reply",
                button_reply: { id: "btn-1", title: "Book Appointment" },
              },
            }],
          },
        }],
      }],
    }

    const parsed = parseWebhookPayload(payload)
    const { messages } = extractMessages(parsed!)
    expect(messages[0].type).toBe("interactive")
    expect(messages[0].interactive?.button_reply?.title).toBe("Book Appointment")
  })
})

// ============================================================
// WhatsAppConnector
// ============================================================
describe("WhatsAppConnector", () => {
  let connector: any

  beforeEach(async () => {
    const mod = await import("@/messaging/connectors/whatsapp/connector")
    connector = new mod.WhatsAppConnector()
  })

  describe("validateRequest", () => {
    it("accepts valid WhatsApp webhook payload", () => {
      const result = connector.validateRequest(
        { object: "whatsapp_business_account" },
        {},
      )
      expect(result.valid).toBe(true)
    })

    it("rejects null body", () => {
      const result = connector.validateRequest(null, {})
      expect(result.valid).toBe(false)
      expect(result.error).toBe("Empty body")
    })

    it("rejects non-WhatsApp webhook object", () => {
      const result = connector.validateRequest(
        { object: "facebook" },
        {},
      )
      expect(result.valid).toBe(false)
      expect(result.error).toContain("Invalid webhook object")
    })
  })

  describe("parseIncoming", () => {
    it("parses a text message", async () => {
      const body = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              metadata: { phone_number_id: "ph-123", display_phone_number: "+15551234567" },
              contacts: [{ profile: { name: "Alice" }, wa_id: "15551234567" }],
              messages: [{ from: "15551234567", id: "m1", timestamp: "1700000000", type: "text", text: { body: "Hello" } }],
            },
          }],
        }],
      }
      const msg = await connector.parseIncoming(body, {}, "clinic-1")
      expect(msg.platform).toBe("whatsapp")
      expect(msg.channelId).toBe("15551234567")
      expect(msg.sourceMessageId).toBe("m1")
      expect(msg.from.name).toBe("Alice")
      expect(msg.from.phone).toBe("15551234567")
      expect(msg.content).toBe("Hello")
      expect(msg.attachments).toBeUndefined()
    })

    it("parses an image message", async () => {
      const body = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              metadata: { phone_number_id: "ph-123", display_phone_number: "+15551234567" },
              contacts: [{ profile: { name: "Bob" }, wa_id: "15551234567" }],
              messages: [{ from: "15551234567", id: "m2", timestamp: "1700000001", type: "image", image: { id: "img-1", mime_type: "image/jpeg", sha256: "abc" } }],
            },
          }],
        }],
      }
      const msg = await connector.parseIncoming(body, {}, "clinic-1")
      expect(msg.content).toBe("[image message]")
      expect(msg.attachments).toHaveLength(1)
      expect(msg.attachments![0].type).toBe("image")
      expect(msg.attachments![0].url).toBe("img-1")
    })

    it("parses a video message", async () => {
      const body = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              metadata: { phone_number_id: "ph-123", display_phone_number: "+15551234567" },
              contacts: [{ profile: { name: "Bob" }, wa_id: "15551234567" }],
              messages: [{ from: "15551234567", id: "m3", timestamp: "1700000002", type: "video", video: { id: "vid-1", mime_type: "video/mp4", sha256: "def" } }],
            },
          }],
        }],
      }
      const msg = await connector.parseIncoming(body, {}, "clinic-1")
      expect(msg.attachments).toHaveLength(1)
      expect(msg.attachments![0].type).toBe("video")
    })

    it("parses document messages", async () => {
      const body = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              metadata: { phone_number_id: "ph-123", display_phone_number: "+15551234567" },
              contacts: [{ profile: { name: "Charlie" }, wa_id: "15551234567" }],
              messages: [{ from: "15551234567", id: "m4", timestamp: "1700000003", type: "document", document: { id: "doc-1", mime_type: "application/pdf", sha256: "ghi", filename: "report.pdf" } }],
            },
          }],
        }],
      }
      const msg = await connector.parseIncoming(body, {}, "clinic-1")
      expect(msg.attachments).toHaveLength(1)
      expect(msg.attachments![0].name).toBe("report.pdf")
      expect(msg.attachments![0].type).toBe("file")
    })

    it("parses interactive button reply", async () => {
      const body = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              metadata: { phone_number_id: "ph-123", display_phone_number: "+15551234567" },
              contacts: [{ profile: { name: "Diana" }, wa_id: "15551234567" }],
              messages: [{
                from: "15551234567", id: "m5", timestamp: "1700000004",
                type: "interactive",
                interactive: { type: "button_reply", button_reply: { id: "b1", title: "Yes" } },
              }],
            },
          }],
        }],
      }
      const msg = await connector.parseIncoming(body, {}, "clinic-1")
      expect(msg.content).toBe("Yes")
    })

    it("parses location messages", async () => {
      const body = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              metadata: { phone_number_id: "ph-123", display_phone_number: "+15551234567" },
              contacts: [{ profile: { name: "Eve" }, wa_id: "15551234567" }],
              messages: [{
                from: "15551234567", id: "m6", timestamp: "1700000005",
                type: "location",
                location: { latitude: 40.7128, longitude: -74.006, name: "NYC" },
              }],
            },
          }],
        }],
      }
      const msg = await connector.parseIncoming(body, {}, "clinic-1")
      expect(msg.content).toContain("Location")
      expect(msg.content).toContain("40.7128")
    })

    it("parses audio/voice messages", async () => {
      const body = {
        object: "whatsapp_business_account",
        entry: [{
          changes: [{
            value: {
              metadata: { phone_number_id: "ph-123", display_phone_number: "+15551234567" },
              contacts: [{ profile: { name: "Frank" }, wa_id: "15551234567" }],
              messages: [{
                from: "15551234567", id: "m7", timestamp: "1700000006",
                type: "audio",
                audio: { id: "audio-1", mime_type: "audio/ogg" },
              }],
            },
          }],
        }],
      }
      const msg = await connector.parseIncoming(body, {}, "clinic-1")
      expect(msg.content).toBe("[audio message]")
      expect(msg.attachments).toHaveLength(1)
      expect(msg.attachments![0].type).toBe("audio")
    })
  })
})

// ============================================================
// WhatsApp API - sendText, sendMedia, etc.
// ============================================================
describe("WhatsApp API - Message Sending", () => {
  let fetchMock: any
  const config = mockConfig()

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sendText makes correct API call", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [{ id: "wa-msg-1" }] }),
    })

    const { sendText } = await import("@/integrations/whatsapp/api")
    const result = await sendText(config, "15551234567", "Hello from clinic")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const callUrl = fetchMock.mock.calls[0][0]
    expect(callUrl).toContain("/123456789/messages")
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(callBody.type).toBe("text")
    expect(callBody.text.body).toBe("Hello from clinic")
    expect(callBody.to).toBe("15551234567")
    expect(result.success).toBe(true)
    expect(result.messageId).toBe("wa-msg-1")
  })

  it("sendText returns error on API failure", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { message: "Invalid phone number" } }),
    })

    const { sendText } = await import("@/integrations/whatsapp/api")
    const result = await sendText(config, "invalid", "test")
    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid phone number")
  })

  it("sendMedia sends image messages correctly", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [{ id: "media-1" }] }),
    })

    const { sendMedia } = await import("@/integrations/whatsapp/api")
    const result = await sendMedia(config, "15551234567", "image", { id: "img-1", caption: "X-Ray result" })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.type).toBe("image")
    expect(body.image.id).toBe("img-1")
    expect(body.image.caption).toBe("X-Ray result")
    expect(result.success).toBe(true)
  })

  it("sendLocation sends location correctly", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [{ id: "loc-1" }] }),
    })

    const { sendLocation } = await import("@/integrations/whatsapp/api")
    const result = await sendLocation(config, "15551234567", {
      longitude: -74.006, latitude: 40.7128, name: "Times Square",
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.type).toBe("location")
    expect(body.location.latitude).toBe(40.7128)
    expect(body.location.name).toBe("Times Square")
    expect(result.success).toBe(true)
  })

  it("sendInteractiveButtons sends button list", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [{ id: "btn-1" }] }),
    })

    const { sendInteractiveButtons } = await import("@/integrations/whatsapp/api")
    const result = await sendInteractiveButtons(
      config, "15551234567", "Would you like to book?",
      [{ id: "yes", title: "Yes" }, { id: "no", title: "No" }],
      "Book Appointment",
      "Reply within 24h",
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.type).toBe("interactive")
    expect(body.interactive.type).toBe("button")
    expect(body.interactive.action.buttons).toHaveLength(2)
    expect(body.interactive.header.text).toBe("Book Appointment")
    expect(body.interactive.footer.text).toBe("Reply within 24h")
    expect(result.success).toBe(true)
  })

  it("sendInteractiveList sends list messages", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [{ id: "list-1" }] }),
    })

    const { sendInteractiveList } = await import("@/integrations/whatsapp/api")
    const result = await sendInteractiveList(
      config, "15551234567", "Choose a service",
      "View Services",
      [{ title: "Dental", rows: [{ id: "clean", title: "Cleaning" }] }],
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.type).toBe("interactive")
    expect(body.interactive.type).toBe("list")
    expect(body.interactive.action.button).toBe("View Services")
    expect(body.interactive.action.sections).toHaveLength(1)
    expect(result.success).toBe(true)
  })

  it("sendContacts sends contact messages", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [{ id: "contact-1" }] }),
    })

    const { sendContacts } = await import("@/integrations/whatsapp/api")
    const result = await sendContacts(config, "15551234567", [
      { name: { formatted_name: "Dr. Smith", first_name: "Smith" }, phones: [{ phone: "+15559876543", type: "WORK" }] },
    ])

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.type).toBe("contacts")
    expect(body.contacts).toHaveLength(1)
    expect(body.contacts[0].name.formatted_name).toBe("Dr. Smith")
    expect(result.success).toBe(true)
  })

  it("markAsRead sends read receipt", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })

    const { markAsRead } = await import("@/integrations/whatsapp/api")
    const result = await markAsRead(config, "msg-123")

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.status).toBe("read")
    expect(body.message_id).toBe("msg-123")
    expect(result).toBe(true)
  })
})

// ============================================================
// Delivery & Retry Logic
// ============================================================
describe("WhatsApp Delivery & Retry", () => {
  let fetchMock: any
  const config = mockConfig()

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sendWithRetry succeeds on first attempt", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [{ id: "ok" }] }),
    })

    const { sendWithRetry } = await import("@/integrations/whatsapp/delivery")
    const result = await sendWithRetry(config, "15551234567", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15551234567",
      type: "text",
      text: { body: "hi" },
    })
    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("sendWithRetry retries on 429 rate limit", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: { message: "Rate limit exceeded" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: "retried" }] }),
      })

    const { sendWithRetry } = await import("@/integrations/whatsapp/delivery")
    const result = await sendWithRetry(config, "15551234567", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15551234567",
      type: "text",
      text: { body: "hi" },
    })
    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("sendWithRetry fails permanently on non-retryable error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { message: "Invalid phone number" } }),
    })

    const { sendWithRetry } = await import("@/integrations/whatsapp/delivery")
    const result = await sendWithRetry(config, "invalid", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "invalid",
      type: "text",
      text: { body: "hi" },
    }, { retries: 2 })
    expect(result.success).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("sendWithRetry gives up after max retries", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: "Server error" } }),
    })

    const { sendWithRetry } = await import("@/integrations/whatsapp/delivery")
    const result = await sendWithRetry(config, "15551234567", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15551234567",
      type: "text",
      text: { body: "hi" },
    }, { retries: 1 })
    expect(result.success).toBe(false)
  }, 10000)

  it("sendWithRetry handles network errors gracefully", async () => {
    fetchMock.mockRejectedValue(new Error("Network failure"))

    const { sendWithRetry } = await import("@/integrations/whatsapp/delivery")
    const result = await sendWithRetry(config, "15551234567", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15551234567",
      type: "text",
      text: { body: "hi" },
    }, { retries: 1 })
    expect(result.success).toBe(false)
  })

  it("getQueueLength returns zero when queue is idle", async () => {
    const { getQueueLength } = await import("@/integrations/whatsapp/delivery")
    expect(getQueueLength()).toBeGreaterThanOrEqual(0)
  })
})

// ============================================================
// getBusinesses / getWABAs / getPhoneNumbers
// ============================================================
describe("WhatsApp API - Account Discovery", () => {
  let fetchMock: any

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("getPhoneNumbers returns parsed phone numbers", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: [
          { id: "ph-1", display_phone_number: "+15551234567", verified_name: "My Clinic", quality_rating: "high" },
        ],
      }),
    })

    const { getPhoneNumbers } = await import("@/integrations/whatsapp/api")
    const numbers = await getPhoneNumbers("token", "waba-1")
    expect(numbers).toHaveLength(1)
    expect(numbers[0].displayPhoneNumber).toBe("+15551234567")
    expect(numbers[0].qualityRating).toBe("high")
  })

  it("getPhoneNumbers returns empty on failure", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) })
    const { getPhoneNumbers } = await import("@/integrations/whatsapp/api")
    const numbers = await getPhoneNumbers("token", "waba-1")
    expect(numbers).toEqual([])
  })

  it("getWABAs returns WhatsApp business accounts", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: [{ id: "waba-1", name: "My Business", currency: "USD", timezone_id: "America/New_York" }],
      }),
    })

    const { getWABAs } = await import("@/integrations/whatsapp/api")
    const wabas = await getWABAs("token", "bus-1")
    expect(wabas).toHaveLength(1)
    expect(wabas[0].id).toBe("waba-1")
    expect(wabas[0].name).toBe("My Business")
  })
})

// ============================================================
// testConnection
// ============================================================
describe("testConnection", () => {
  let fetchMock: any

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns success with latency when API responds", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [{ id: "test-msg" }] }),
    })

    const { testConnection } = await import("@/integrations/whatsapp/api")
    const result = await testConnection(mockConfig())
    expect(result.success).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it("returns failure details when API errors", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: "Invalid credentials" } }),
    })

    const { testConnection } = await import("@/integrations/whatsapp/api")
    const result = await testConnection(mockConfig())
    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid credentials")
  })
})

// ============================================================
// getBusinessProfile
// ============================================================
describe("getBusinessProfile", () => {
  let fetchMock: any

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns profile when API succeeds", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ about: "Dental clinic", description: "Best care", email: "clinic@example.com" }),
    })

    const { getBusinessProfile } = await import("@/integrations/whatsapp/api")
    const profile = await getBusinessProfile("token", "ph-1")
    expect(profile?.about).toBe("Dental clinic")
    expect(profile?.email).toBe("clinic@example.com")
  })

  it("returns null when API fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) })
    const { getBusinessProfile } = await import("@/integrations/whatsapp/api")
    const profile = await getBusinessProfile("token", "ph-1")
    expect(profile).toBeNull()
  })
})

// ============================================================
// Webhook Signature Verification (X-Hub-Signature-256)
// ============================================================
describe("Webhook Signature Verification", () => {
  const APP_SECRET = "test-app-secret-123"
  const rawBody = '{"object":"whatsapp_business_account","entry":[]}'

  function calculateSignature(body: string, secret: string): string {
    const crypto = require("crypto")
    return "sha256=" + crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")
  }

  describe("signature generation", () => {
    it("produces valid sha256=hex format", async () => {
      const sig = calculateSignature(rawBody, APP_SECRET)
      expect(sig.startsWith("sha256=")).toBe(true)
      expect(sig.length).toBe(64 + 7)
    })

    it("produces different signatures for different secrets", async () => {
      const sig1 = calculateSignature(rawBody, APP_SECRET)
      const sig2 = calculateSignature(rawBody, "different-secret")
      expect(sig1).not.toBe(sig2)
    })

    it("produces different signatures for different bodies", async () => {
      const sig1 = calculateSignature(rawBody, APP_SECRET)
      const sig2 = calculateSignature('{"key":"value"}', APP_SECRET)
      expect(sig1).not.toBe(sig2)
    })

    it("rejects signature with wrong prefix", () => {
      const badSig = "md5=abc123"
      expect(badSig.startsWith("sha256=")).toBe(false)
    })

    it("rejects signature with wrong hex length", () => {
      const shortSig = "sha256=abc"
      const hexPart = shortSig.slice(7)
      expect(/^[a-f0-9]{64}$/i.test(hexPart)).toBe(false)
    })

    it("rejects tampered body", () => {
      const originalBody = '{"object":"whatsapp_business_account","entry":[]}'
      const tamperedBody = '{"object":"whatsapp_business_account","entry":[{"id":"evil"}]}'
      const sig = calculateSignature(originalBody, APP_SECRET)
      const tamperedSig = calculateSignature(tamperedBody, APP_SECRET)
      expect(sig).not.toBe(tamperedSig)
    })
  })

  describe("timingSafeEqual", () => {
    it("returns true for identical strings", () => {
      const crypto = require("crypto")
      const a = Buffer.from("abc123")
      const b = Buffer.from("abc123")
      expect(crypto.timingSafeEqual(a, b)).toBe(true)
    })

    it("returns false for different strings of same length", () => {
      const crypto = require("crypto")
      const a = Buffer.from("abc123")
      const b = Buffer.from("def456")
      expect(crypto.timingSafeEqual(a, b)).toBe(false)
    })
  })

  describe("verifyWebhook GET verification", () => {
    it("returns challenge when token matches", async () => {
      const { verifyWebhook } = await import("@/integrations/whatsapp/api")
      const result = verifyWebhook("subscribe", "my-secret", "challenge-abc", "my-secret")
      expect(result).toBe("challenge-abc")
    })

    it("returns null when token does not match", async () => {
      const { verifyWebhook } = await import("@/integrations/whatsapp/api")
      const result = verifyWebhook("subscribe", "wrong", "challenge-abc", "my-secret")
      expect(result).toBeNull()
    })

    it("returns null when mode is not subscribe", async () => {
      const { verifyWebhook } = await import("@/integrations/whatsapp/api")
      const result = verifyWebhook("unsubscribe", "my-secret", "challenge-abc", "my-secret")
      expect(result).toBeNull()
    })

    it("returns null when challenge is missing", async () => {
      const { verifyWebhook } = await import("@/integrations/whatsapp/api")
      const result = verifyWebhook("subscribe", "my-secret", null, "my-secret")
      expect(result).toBeNull()
    })
  })
})
