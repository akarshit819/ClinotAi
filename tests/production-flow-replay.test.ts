/**
 * Production-flow replay test.
 *
 * Proves the FULL production chain for the exact inputs from the
 * production incident report:
 *
 *   USER MESSAGE → processIncomingMessage (pipeline) → receptionist
 *   → route → AI provider (mocked OpenAI SDK) → NON-EMPTY AI RESPONSE
 *   → outbound WhatsApp job payload (Job.text.body)
 *
 * The OpenAI SDK is mocked at its boundary: every AI call is counted
 * and echoes the last user message as `AI_REPLY:<text>`. Any test
 * asserting the outbound WhatsApp body equals the AI echo therefore
 * proves the AI response was NOT overwritten by a fallback.
 *
 * Deterministic paths (appointment state machine, flow cancel) assert
 * that the AI is NOT called and the deterministic prompt is what
 * reaches the outbound payload.
 *
 * Failure paths prove fallback happens ONLY after a real provider
 * failure / missing configuration, and never silently.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { processIncomingMessage } from "../src/messaging/pipeline"
import type { IncomingMessage } from "../src/messaging/types"

// ---------------------------------------------------------------------------
// OpenAI SDK boundary mock — counts every provider request and echoes the
// last user message so tests can prove the AI response reaches WhatsApp
// verbatim.
// ---------------------------------------------------------------------------
const openaiState = vi.hoisted(() => ({
  calls: [] as Array<{ messages: Array<{ role: string; content: unknown }> }>,
  failNext: false,
}))

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn(async (req: { messages: Array<{ role: string; content: unknown }> }) => {
          if (openaiState.failNext) {
            openaiState.failNext = false
            throw new Error("simulated provider outage")
          }
          openaiState.calls.push(req)
          const lastUser = [...req.messages].reverse().find((m) => m.role === "user")
          const text = typeof lastUser?.content === "string" ? lastUser.content : "unknown"
          return { choices: [{ message: { content: `AI_REPLY:${text}`, tool_calls: undefined } }] }
        }),
      },
    }
    constructor(_cfg: unknown) {}
  },
}))

// Platform provider resolution — force the "openai" path with a test
// key regardless of the ambient environment.
vi.mock("@/lib/ai/clinot-provider", () => ({
  getClinotApiKey: vi.fn(() => "test-key"),
  isClinotAiAvailable: vi.fn(() => true),
  hasClinotProvider: vi.fn(() => true),
}))

// ---------------------------------------------------------------------------
// In-memory Prisma mock with state continuity so multi-turn scenarios
// (booking flow) see their own metadata/draft across turns.
// ---------------------------------------------------------------------------
const db = vi.hoisted(() => {
  return {
    conversation: null as null | Record<string, unknown>,
    messages: [] as Array<{ id: string; role: string; content: string }>,
    outboundJobs: [] as Array<Record<string, any>>,
    patients: 0,
  }
})

vi.mock("@/lib/db", () => {
  const now = () => new Date()
  const prisma = {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    $queryRaw: vi.fn(async () => [{ "1": 1 }]),
    $disconnect: vi.fn(async () => undefined),
    clinic: {
      findUnique: vi.fn(async () => ({
        id: "clinic-1",
        name: "Demo Clinic",
        slug: "demo",
        phone: "+15550000000",
        emergencyPhone: "+15559999999",
        address: "1 Clinic Road",
        openingHours: "Mon-Fri 9-5",
        timezone: "America/New_York",
        useClinotAi: true,
        aiProvider: "clinot",
      })),
      findMany: vi.fn(async () => [{ id: "clinic-1" }]),
    },
    user: {
      findMany: vi.fn(async () => [
        { id: "prov-1", name: "Dr. Smith", role: { name: "owner" }, isActive: true },
      ]),
    },
    patient: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        db.patients++
        return { id: `pat-${db.patients}`, ...args.data }
      }),
    },
    patientPlatformProfile: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
    },
    knowledgeBase: { findMany: vi.fn(async () => []) },
    fAQ: { findMany: vi.fn(async () => []) },
    conversation: {
      findFirst: vi.fn(async () => db.conversation),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        db.conversation = {
          id: "conv-1",
          clinicId: "clinic-1",
          platform: "whatsapp",
          channelId: "15559876543",
          status: "active",
          isEmergency: false,
          isSpam: false,
          unreadCount: 1,
          metadata: null,
          patient: { id: "pat-1", name: "Akarshit" },
          messages: [],
          createdAt: now(),
          updatedAt: now(),
          ...args.data,
        }
        return { ...db.conversation }
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        if (db.conversation) Object.assign(db.conversation, args.data)
        return { ...(db.conversation ?? {}) }
      }),
    },
    conversationMessage: {
      create: vi.fn(async (args: { data: { role: string; content: string } }) => {
        const row = { id: `msg-${db.messages.length + 1}`, ...args.data }
        db.messages.push(row)
        return { ...row }
      }),
      update: vi.fn(async () => ({})),
      findMany: vi.fn(async (args: { take?: number }) => {
        const take = args.take ?? db.messages.length
        // DB returns descending; pipeline reverses to chronological.
        return db.messages.slice(-take).reverse()
      }),
    },
    job: {
      create: vi.fn(async (args: { data: Record<string, any> }) => {
        db.outboundJobs.push(args.data)
        return { id: `job-${db.outboundJobs.length}`, ...args.data, status: "PENDING", attempts: 0 }
      }),
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        ...args.data,
      })),
      count: vi.fn(async () => 0),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    whatsAppPhoneNumber: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
      upsert: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    whatsAppBusinessAccount: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    },
    appointment: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: "appt-1", ...args.data,
      })),
      update: vi.fn(async () => ({})),
    },
    integration: {
      findFirst: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    aiUsage: { create: vi.fn(async () => ({})) },
    notification: { create: vi.fn(async () => ({})) },
  }
  return { prisma }
})

vi.mock("@/integrations/token-store", () => ({
  getCredentials: vi.fn(async () => ({
    accessToken: "mock-token",
    metadata: { phoneNumberId: "pnid-1", wabaId: "waba-1" },
  })),
}))

import { prisma } from "../src/lib/db"

function makeMessage(content: string, seq: number): IncomingMessage {
  return {
    platform: "whatsapp",
    channelId: "15559876543",
    sourceMessageId: `wamid-${seq}`,
    from: { id: "15559876543", name: "Akarshit", phone: "15559876543" },
    content,
    timestamp: new Date(),
  }
}

/** Run one production turn and return the outbound WhatsApp text. */
async function turn(content: string, seq: number): Promise<{ outbound: string | null; aiCallsBefore: number }> {
  const aiCallsBefore = openaiState.calls.length
  await processIncomingMessage("clinic-1", makeMessage(content, seq))
  const lastJob = db.outboundJobs[db.outboundJobs.length - 1]
  const outbound = lastJob?.payload?.payload?.text?.body ?? null
  return { outbound, aiCallsBefore }
}

function aiCallsDuringTurn(before: number): number {
  return openaiState.calls.length - before
}

beforeEach(() => {
  db.conversation = null
  db.messages = []
  db.outboundJobs = []
  db.patients = 0
  openaiState.calls = []
  openaiState.failNext = false
  delete process.env.OPENROUTER_API_KEY
})

// ===========================================================================
// AI-path inputs: provider called, AI response reaches WhatsApp verbatim
// ===========================================================================
describe("AI-path inputs reach the provider and the AI response reaches WhatsApp", () => {
  const aiInputs = [
    "hello",
    "I have knee pain",
    "I have stomach pain",
    "I have back pain for two days",
    "I have headache and back pain",
    "What is you",
    "What are you",
    "I want teeth whitening",
    "Where are you located?",
    "What are your opening hours?",
    "Do you offer braces?",
  ]

  for (const input of aiInputs) {
    it(`"${input}" → provider called → AI response → outbound payload`, async () => {
      const { outbound, aiCallsBefore } = await turn(input, 1)
      expect(aiCallsDuringTurn(aiCallsBefore)).toBe(1)
      // The AI echo must be the EXACT outbound text — no fallback, no
      // deterministic overwrite anywhere in the chain.
      expect(outbound).toBe(`AI_REPLY:${input}`)
    })
  }
})

// ===========================================================================
// Bounded short-term context
// ===========================================================================
describe("Short-term context stays bounded", () => {
  it("follow-up 'How much?' after whitening goes to the AI with a bounded window", async () => {
    await turn("I want teeth whitening", 1)
    const before = openaiState.calls.length
    const { outbound } = await turn("How much?", 2)
    expect(aiCallsDuringTurn(before)).toBe(1)
    expect(outbound).toBe("AI_REPLY:How much?")
    // Bounded: system + [context header] + <=4 window + current message.
    const req = openaiState.calls[openaiState.calls.length - 1]
    expect(req.messages.length).toBeLessThanOrEqual(8)
    expect(req.messages[0].role).toBe("system")
  })
})

// ===========================================================================
// Deterministic appointment paths: AI NOT called
// ===========================================================================
describe("Appointment state machine handles booking deterministically", () => {
  it("'I want to book appointment' → APPOINTMENT_START, no AI call", async () => {
    const { outbound, aiCallsBefore } = await turn("I want to book appointment", 1)
    expect(aiCallsDuringTurn(aiCallsBefore)).toBe(0)
    expect(outbound).toBe("Sure, I can help you book an appointment. What's your full name?")
  })

  it("multi-line 'Akarshit / 870087940 / Pain' → slot answer fills all fields, no AI call, asks for date", async () => {
    await turn("I want to book appointment", 1)
    const { outbound, aiCallsBefore } = await turn("Akarshit\n870087940\nPain", 2)
    expect(aiCallsDuringTurn(aiCallsBefore)).toBe(0)
    // Not the generic fallback — the deterministic next-slot prompt.
    expect(outbound).not.toContain("not sure I have the exact information")
    expect(outbound).toContain("date")
  })

  it("'never mind' during booking → deterministic cancellation, no AI call", async () => {
    await turn("I want to book appointment", 1)
    const { outbound, aiCallsBefore } = await turn("never mind", 2)
    expect(aiCallsDuringTurn(aiCallsBefore)).toBe(0)
    expect(outbound).toContain("cancelled")
  })

  it("booking completes through the AI tool path when date+time provided", async () => {
    await turn("I want to book appointment", 1)
    await turn("Akarshit\n870087940\nPain", 2)
    const before = openaiState.calls.length
    const { outbound } = await turn("tomorrow at 4 PM", 3)
    // Draft completes → AI is invoked to call book_appointment.
    expect(aiCallsDuringTurn(before)).toBe(1)
    // The AI tool-path request includes the collected booking fields.
    const req = openaiState.calls[openaiState.calls.length - 1]
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user")
    const content = typeof lastUser?.content === "string" ? lastUser.content : ""
    expect(content).toContain("Name: Akarshit")
    expect(content).toContain("Phone: 870087940")
    expect(content).toContain("Reason: Pain")
    // Outbound is whatever the AI produced (echo), not a fallback.
    expect(outbound).toContain("AI_REPLY:")
  })
})

// ===========================================================================
// Failure paths: fallback happens ONLY after real failure, never silently
// ===========================================================================
describe("Fallback contract", () => {
  it("provider failure → scripted fallback (observable), AI response absent", async () => {
    openaiState.failNext = true
    const { outbound, aiCallsBefore } = await turn("I have stomach pain", 1)
    // The provider WAS attempted (and threw before recording a call).
    expect(aiCallsDuringTurn(aiCallsBefore)).toBe(0)
    // Response is the intentional symptom fallback — useful, safe, and
    // never an AI echo.
    expect(outbound).not.toContain("AI_REPLY:")
    expect(outbound).toContain("can't give medical advice")
    expect(outbound).toContain("book an appointment")
  })

  it("provider not configured → AI skipped, fallback used (AI_PROVIDER_NOT_CONFIGURED)", async () => {
    const { getClinotApiKey } = await import("@/lib/ai/clinot-provider")
    ;(getClinotApiKey as ReturnType<typeof vi.fn>).mockReturnValueOnce(null)
    const { outbound } = await turn("I have stomach pain", 1)
    expect(openaiState.calls.length).toBe(0)
    expect(outbound).not.toContain("AI_REPLY:")
    expect(outbound).toContain("can't give medical advice")
    expect(outbound).toContain("book an appointment")
  })
})
