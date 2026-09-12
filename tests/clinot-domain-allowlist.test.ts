/**
 * Clinot strict positive-allowlist tests (Sections A–J).
 *
 * Proves the architecture, not a blacklist:
 *   - Allowed Clinot domains (reception, appointment, clinic info,
 *     doctors, services, patient-clinic communication, health
 *     receptionist) are handled.
 *   - Anything else is OUTSIDE: deterministic redirect, provider
 *     call count EXACTLY zero.
 *   - Active appointment drafts survive unrelated messages.
 *   - The real production regression
 *     ("Tell me how to make calculator using python") is impossible
 *     by construction: it matches NO allowlist domain.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { processIncomingMessage } from "../src/messaging/pipeline"
import type { IncomingMessage } from "../src/messaging/types"
import {
  CLINOT_REDIRECT,
  isClinotAllowedText,
  classifyClinotDomainText,
} from "../src/lib/ai/clinot-domain"
import { classifyRoute } from "../src/messaging/ai/route-classifier"
import { validateInput } from "../src/lib/ai/guardrails"

// ---------------------------------------------------------------------------
// OpenRouter HTTP boundary stub — counts every provider request.
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
// In-memory Prisma mock with state continuity.
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

function readDraft(): Record<string, unknown> | null {
  const metadata = db.conversation?.metadata
  if (typeof metadata !== "string" || !metadata) return null
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>
    return (parsed.appointmentDraft as Record<string, unknown>) ?? null
  } catch {
    return null
  }
}

beforeEach(() => {
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

afterEach(() => {
  vi.clearAllMocks()
})

// ===========================================================================
// TEST GROUP A — normal Clinot conversation stays natural
// ===========================================================================
describe("A — natural receptionist conversation", () => {
  const natural = ["Hi", "Hello", "Thanks", "Okay", "Alright", "Bye"]
  for (const input of natural) {
    it(`"${input}" is inside the domain (never redirected)`, async () => {
      const { outbound } = await turn(input, 1)
      expect(outbound).not.toBe(CLINOT_REDIRECT)
      expect(outbound).toBeTruthy()
    })
  }
})

// ===========================================================================
// TEST GROUP B — appointment workflows end-to-end
// ===========================================================================
describe("B — appointment booking workflow", () => {
  it("books: start → name → reason → date → time → confirm writes the appointment", async () => {
    let seq = 1
    const t1 = await turn("I want to book an appointment", seq++)
    expect(t1.outbound).toContain("full name")
    expect(aiCallsDuringTurn(t1.aiCallsBefore)).toBe(0)

    const t2 = await turn("Akarshit", seq++)
    expect(aiCallsDuringTurn(t2.aiCallsBefore)).toBe(0)

    const t3 = await turn("I have tooth pain", seq++)
    expect(aiCallsDuringTurn(t3.aiCallsBefore)).toBe(0)
    expect(t3.outbound).toContain("date")

    const t4 = await turn("12 September 2026", seq++)
    expect(aiCallsDuringTurn(t4.aiCallsBefore)).toBe(0)

    const t5 = await turn("4 PM", seq++)
    expect(aiCallsDuringTurn(t5.aiCallsBefore)).toBe(0)
    expect(t5.outbound).toContain("confirm")

    const before = openrouterState.calls.length
    const t6 = await turn("Yes", seq++)
    expect(aiCallsDuringTurn(before)).toBe(0)
    expect(vi.mocked(prisma.appointment.create)).toHaveBeenCalledTimes(1)
    expect(t6.outbound).not.toContain("{")
    expect(t6.outbound).not.toBe(CLINOT_REDIRECT)
  })
})

// ===========================================================================
// TEST GROUP C — short contextual answers follow appointment state
// ===========================================================================
describe("C — appointment context answers", () => {
  it("'tomorrow' fills the date slot deterministically", async () => {
    await turn("I want to book an appointment", 1)
    await turn("Akarshit", 2)
    await turn("I have tooth pain", 3)
    const { outbound, aiCallsBefore } = await turn("tomorrow", 4)
    expect(aiCallsDuringTurn(aiCallsBefore)).toBe(0)
    expect(outbound).not.toBe(CLINOT_REDIRECT)
    const draft = readDraft()
    expect(draft).toBeTruthy()
    expect(draft?.preferredDate).toBeTruthy()
  })

  it("'4 PM' fills the time slot deterministically", async () => {
    await turn("I want to book an appointment", 1)
    await turn("Akarshit", 2)
    await turn("I have tooth pain", 3)
    await turn("tomorrow", 4)
    const { outbound, aiCallsBefore } = await turn("4 PM", 5)
    expect(aiCallsDuringTurn(aiCallsBefore)).toBe(0)
    expect(outbound).toContain("confirm")
  })

  it("'no' declines a ready booking without creating an appointment", async () => {
    await turn("I want to book an appointment", 1)
    await turn("Akarshit", 2)
    await turn("I have tooth pain", 3)
    await turn("tomorrow", 4)
    await turn("4 PM", 5)
    const { outbound, aiCallsBefore } = await turn("no", 6)
    expect(aiCallsDuringTurn(aiCallsBefore)).toBe(0)
    expect(vi.mocked(prisma.appointment.create)).not.toHaveBeenCalled()
    expect(outbound).not.toBe(CLINOT_REDIRECT)
  })

  it("'change the time' never triggers the outside redirect", async () => {
    await turn("I want to book an appointment", 1)
    await turn("Akarshit", 2)
    await turn("I have tooth pain", 3)
    await turn("tomorrow", 4)
    await turn("4 PM", 5)
    const { outbound, aiCallsBefore } = await turn("change the time", 6)
    expect(aiCallsDuringTurn(aiCallsBefore)).toBe(0)
    expect(outbound).not.toBe(CLINOT_REDIRECT)
  })
})

// ===========================================================================
// TEST GROUP D — clinic information stays working
// ===========================================================================
describe("D — clinic information", () => {
  const queries = [
    "What are your opening hours?",
    "Where is the clinic located?",
    "Which doctors are available?",
    "Do you offer braces?",
    "What is your phone number?",
  ]
  for (const input of queries) {
    it(`"${input}" is inside the domain`, async () => {
      const { outbound } = await turn(input, 1)
      expect(outbound).not.toBe(CLINOT_REDIRECT)
      expect(outbound).toBeTruthy()
    })
  }
})

// ===========================================================================
// TEST GROUP E — health receptionist policy intact
// ===========================================================================
describe("E — health receptionist policy", () => {
  for (const input of ["I have tooth pain", "My back hurts"]) {
    it(`"${input}" flows to receptionist handling, never the outside redirect`, async () => {
      const { outbound } = await turn(input, 1)
      expect(outbound).not.toBe(CLINOT_REDIRECT)
      expect(outbound).toBeTruthy()
    })
  }
})

// ===========================================================================
// TEST GROUP F — the real production regression
// ===========================================================================
describe("F — real production regression", () => {
  const input = "Tell me how to make calculator using python"

  it("classifies OUTSIDE the Clinot domain (positive allowlist, no blacklist)", () => {
    expect(isClinotAllowedText(input)).toBe(false)
    expect(classifyClinotDomainText(input)).toMatchObject({ allowed: false, domain: "outside" })
    expect(classifyRoute(input, null).route).toBe("OFF_TOPIC")
    expect(validateInput(input).action).toBe("off_topic")
  })

  it("redirects with ZERO provider calls and no code in the response", async () => {
    const { outbound, aiCallsBefore } = await turn(input, 1)
    expect(aiCallsDuringTurn(aiCallsBefore)).toBe(0)
    expect(outbound).toBe(CLINOT_REDIRECT)
    expect(outbound).not.toContain("def ")
    expect(outbound).not.toContain("```")
    expect(outbound).not.toContain("calculate(")
  })
})

// ===========================================================================
// TEST GROUP G — paraphrased outside-domain requests (fail closed)
// ===========================================================================
describe("G — paraphrased outside-domain requests", () => {
  const paraphrased = [
    "Can you explain photosynthesis?",
    "Write a poem about rain",
    "What is the capital of France?",
    "How do I bake a cake?",
  ]
  for (const input of paraphrased) {
    it(`"${input}" stays outside: redirect + zero provider calls`, async () => {
      expect(isClinotAllowedText(input)).toBe(false)
      const { outbound, aiCallsBefore } = await turn(input, 1)
      expect(aiCallsDuringTurn(aiCallsBefore)).toBe(0)
      expect(outbound).toBe(CLINOT_REDIRECT)
    })
  }
})

// ===========================================================================
// TEST GROUP H — active draft protection
// ===========================================================================
describe("H — unrelated message never corrupts the draft", () => {
  it("preserves every field, creates nothing, then booking continues", async () => {
    await turn("I want to book an appointment", 1)
    await turn("Akarshit", 2)
    await turn("I have tooth pain", 3)

    const beforeDraft = readDraft()
    expect(beforeDraft?.patientName).toBe("Akarshit")
    expect(beforeDraft?.reason).toBe("I have tooth pain")

    const snapshot = JSON.stringify(beforeDraft)
    const { outbound, aiCallsBefore } = await turn(
      "Tell me how to make calculator using python",
      4,
    )
    expect(aiCallsDuringTurn(aiCallsBefore)).toBe(0)
    expect(outbound).toBe(CLINOT_REDIRECT)
    expect(vi.mocked(prisma.appointment.create)).not.toHaveBeenCalled()

    const afterDraft = readDraft()
    expect(afterDraft).toBeTruthy()
    expect(JSON.stringify(afterDraft)).toBe(snapshot)

    // Booking continues normally afterwards.
    const t5 = await turn("12 September 2026", 5)
    expect(aiCallsDuringTurn(t5.aiCallsBefore)).toBe(0)
    expect(readDraft()?.preferredDate).toBeTruthy()
  })
})

// ===========================================================================
// TEST GROUP I — clinic side question during a draft
// ===========================================================================
describe("I — clinic side question preserves the draft", () => {
  it("answers the clinic question and lets booking continue", async () => {
    await turn("I want to book an appointment", 1)
    await turn("Akarshit", 2)

    const { outbound } = await turn("What time does the clinic close?", 3)
    expect(outbound).not.toBe(CLINOT_REDIRECT)
    expect(readDraft()?.patientName).toBe("Akarshit")

    const t4 = await turn("I have tooth pain", 4)
    expect(aiCallsDuringTurn(t4.aiCallsBefore)).toBe(0)
  })
})

// ===========================================================================
// TEST GROUP J — provider failure respects the boundary
// ===========================================================================
describe("J — provider failure", () => {
  it("allowed request may fall back; outside request never touches the provider", async () => {
    openrouterState.failAll = true

    const allowed = await turn("What are your hours?", 1)
    expect(allowed.outbound).not.toBe(CLINOT_REDIRECT)
    expect(allowed.outbound).not.toContain("AI_REPLY:")

    const before = openrouterState.calls.length
    const outside = await turn("Tell me how to make calculator using python", 2)
    expect(openrouterState.calls.length - before).toBe(0)
    expect(outside.outbound).toBe(CLINOT_REDIRECT)
  })
})
