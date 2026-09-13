/**
 * Production-flow replay test.
 *
 * Proves the FULL production chain for the exact inputs from the
 * production incident report:
 *
 *   USER MESSAGE → processIncomingMessage (pipeline) → receptionist
 *   → route → OpenRouter (global fetch stubbed at the HTTP boundary)
 *   → NON-EMPTY AI RESPONSE → outbound WhatsApp job payload
 *   (Job.text.body)
 *
 * OpenRouter is the SINGLE provider. The fetch stub counts every
 * provider request and echoes the last user message as
 * `AI_REPLY:<text>`. Any test asserting the outbound WhatsApp body
 * equals the AI echo therefore proves the AI response was NOT
 * overwritten by a fallback.
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
// OpenRouter HTTP boundary stub — counts every provider request and
// echoes the last user message so tests can prove the AI response
// reaches WhatsApp verbatim. OpenRouter is the SINGLE provider; its
// requests all go through global fetch.
// ---------------------------------------------------------------------------
const openrouterState = vi.hoisted(() => ({
  calls: [] as Array<{ url: string; body: { model: string; messages: Array<{ role: string; content: unknown }>; tools?: unknown } }>,
  failNext: false,
  failAll: false,
}))

const openRouterStubResponse = (body: { messages: Array<{ role: string; content: unknown }> }) => {
  const lastUser = [...body.messages].reverse().find((m) => m.role === "user")
  const text = typeof lastUser?.content === "string" ? lastUser.content : "unknown"
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: `AI_REPLY:${text}`, tool_calls: undefined } }] }),
  }
}

vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: { method?: string; body?: string }) => {
  const body = init?.body ? JSON.parse(init.body) : {}
  openrouterState.calls.push({ url: String(url), body })
  if (openrouterState.failAll) {
    throw new Error("simulated provider outage (all models)")
  }
  if (openrouterState.failNext) {
    openrouterState.failNext = false
    throw new Error("simulated provider outage")
  }
  if (String(url).includes("openrouter.ai")) {
    return openRouterStubResponse(body)
  }
  throw new Error("Unexpected fetch in test: " + String(url))
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
  const aiCallsBefore = openrouterState.calls.length
  await processIncomingMessage("clinic-1", makeMessage(content, seq))
  const lastJob = db.outboundJobs[db.outboundJobs.length - 1]
  const outbound = lastJob?.payload?.payload?.text?.body ?? null
  return { outbound, aiCallsBefore }
}

function aiCallsDuringTurn(before: number): number {
  return openrouterState.calls.length - before
}

beforeEach(() => {
  // Pin the provider environment: this file verifies the single
  // OpenRouter path (fetch stubbed) + WhatsApp chain. OpenRouter is
  // the ONLY provider; force-ASSIGN the test key and an explicit test
  // PRIMARY model (never delete — vitest re-applies .env values
  // lazily, so an assignment always wins over a later resurrection).
  // Models come ONLY from env — the stub accepts any model ID.
  process.env.OPENROUTER_API_KEY = "test-or-key"
  process.env.OPENROUTER_MODEL = "test-primary-model"
  delete process.env.OPENROUTER_FALLBACK_MODELS
  process.env.PICO_LLM_API_URL = ""
  db.conversation = null
  db.messages = []
  db.outboundJobs = []
  db.patients = 0
  openrouterState.calls = []
  openrouterState.failNext = false
  openrouterState.failAll = false
})

// ===========================================================================
// AI-path inputs: provider called, AI response reaches WhatsApp verbatim
// ===========================================================================
describe("AI-path inputs reach the provider and the AI response reaches WhatsApp", () => {
  const aiInputs = [
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

describe("Greeting handled deterministically (no AI call)", () => {
  it('"hello" → deterministic response, no AI call', async () => {
    const { outbound, aiCallsBefore } = await turn("hello", 1)
    expect(aiCallsDuringTurn(aiCallsBefore)).toBe(0)
    expect(outbound.length).toBeGreaterThan(0)
  })
})

// ===========================================================================
// Bounded short-term context
// ===========================================================================
describe("Short-term context stays bounded", () => {
  it("follow-up 'How much?' after whitening goes to the AI with a bounded window", async () => {
    await turn("I want teeth whitening", 1)
    const before = openrouterState.calls.length
    const { outbound } = await turn("How much?", 2)
    expect(aiCallsDuringTurn(before)).toBe(1)
    expect(outbound).toBe("AI_REPLY:How much?")
    // Bounded: system + [context header] + <=4 window + current message.
    const req = openrouterState.calls[openrouterState.calls.length - 1]
    // The request must carry the ENV-CONFIGURED primary model verbatim.
    expect(req.body.model).toBe("test-primary-model")
    expect(req.body.messages.length).toBeLessThanOrEqual(8)
    expect(req.body.messages[0].role).toBe("system")
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

  it("completed draft asks for confirmation WITHOUT any AI call (no LLM in booking loop)", async () => {
    await turn("I want to book appointment", 1)
    await turn("Akarshit\n870087940\nPain", 2)
    const before = openrouterState.calls.length
    const { outbound } = await turn("tomorrow at 4 PM", 3)
    // Draft completes → NO AI call. The deterministic confirmation
    // summary is sent instead (previously the AI was handed the booking
    // and leaked raw JSON without creating a record).
    expect(aiCallsDuringTurn(before)).toBe(0)
    expect(outbound).toContain("Would you like me to confirm this appointment?")
    expect(outbound).toContain("4:00 PM")
    expect(outbound).toContain("Akarshit")
    expect(outbound).not.toContain("{")
    expect(outbound).not.toContain("phone set")
  })
})

// ===========================================================================
// Failure paths: fallback happens ONLY after real failure, never silently
// ===========================================================================
describe("Fallback contract", () => {
  it("single-model outage → scripted fallback (observable), AI response absent", async () => {
    // TEMP SINGLE-MODEL TEST: only the pinned model exists, so one failed
    // attempt exhausts the chain and falls back.
    openrouterState.failNext = true
    const { outbound, aiCallsBefore } = await turn("I have stomach pain", 1)
    expect(aiCallsDuringTurn(aiCallsBefore)).toBe(1)
    expect(outbound).not.toContain("AI_REPLY:")
    expect(outbound).toContain("can't give medical advice")
    expect(outbound).toContain("book an appointment")
  })

  it("provider failure → scripted fallback (observable), AI response absent", async () => {
    openrouterState.failAll = true
    const { outbound, aiCallsBefore } = await turn("I have stomach pain", 1)
    // TEMP SINGLE-MODEL TEST: the pinned model is the only candidate.
    expect(aiCallsDuringTurn(aiCallsBefore)).toBe(1)
    // Response is the intentional symptom fallback — useful, safe, and
    // never an AI echo.
    expect(outbound).not.toContain("AI_REPLY:")
    expect(outbound).toContain("can't give medical advice")
    expect(outbound).toContain("book an appointment")
  })

  it("provider not configured → AI skipped, fallback used (OPENROUTER_NOT_CONFIGURED)", async () => {
    // Force-ASSIGN an empty key (never delete — vitest re-applies .env
    // values lazily): getOpenRouterConfig() then reports NOT_CONFIGURED.
    process.env.OPENROUTER_API_KEY = ""
    const { outbound } = await turn("I have stomach pain", 1)
    expect(openrouterState.calls.length).toBe(0)
    expect(outbound).not.toContain("AI_REPLY:")
    expect(outbound).toContain("can't give medical advice")
    expect(outbound).toContain("book an appointment")
  })
})
