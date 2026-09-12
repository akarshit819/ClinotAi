/**
 * Typo-tolerant semantic health routing tests (Groups A–I).
 *
 * Proves Clinot understands real-human symptom messages despite
 * spelling mistakes — WITHOUT weakening the strict allowlist:
 * genuinely outside-domain requests still get the deterministic
 * redirect with EXACTLY zero provider calls.
 *
 * The matcher is general (normalized tokens + capped Levenshtein
 * against a clinical vocabulary + symptom-framing gate) — nothing
 * here is hardcoded to "headache".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { processIncomingMessage } from "../src/messaging/pipeline"
import type { IncomingMessage } from "../src/messaging/types"
import {
  CLINOT_REDIRECT,
  isClinotAllowedText,
  classifyClinotDomainText,
  normalizeClinotText,
  levenshteinDistance,
  fuzzyHealthSignal,
} from "../src/lib/ai/clinot-domain"
import { classifyRoute } from "../src/messaging/ai/route-classifier"

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
// Unit: normalization + edit distance primitives
// ===========================================================================
describe("typo primitives", () => {
  it("normalizes for routing only (original text untouched by callers)", () => {
    expect(normalizeClinotText("  I have HEADACHE!!! ")).toBe("i have headache")
    expect(normalizeClinotText("head,pain")).toBe("head pain")
    expect(normalizeClinotText("headaaache")).toBe("headache")
  })

  it("capped Levenshtein matches the regression spellings", () => {
    expect(levenshteinDistance("headche", "headache")).toBe(1)
    expect(levenshteinDistance("heache", "headache")).toBe(2)
    expect(levenshteinDistance("hedache", "headache")).toBeLessThanOrEqual(2)
    expect(levenshteinDistance("headachee", "headache")).toBe(1)
    expect(levenshteinDistance("calculator", "headache")).toBeGreaterThan(2)
  })

  it("fuzzy signal carries confidence + match detail", () => {
    const s = fuzzyHealthSignal("i have headche")
    expect(s.matched).toBe(true)
    expect(s.matchType).toBe("typo_framed")
    expect(s.confidence).toBeGreaterThanOrEqual(0.85)
    expect(s.token).toBe("headche")
    expect(s.vocabWord).toBe("headache")
  })
})

// ===========================================================================
// TEST GROUP A — exact symptom
// ===========================================================================
describe("A — exact symptom", () => {
  it('"i have headache" routes MEDICAL_SYMPTOM via the allowed domain', async () => {
    expect(isClinotAllowedText("i have headache")).toBe(true)
    expect(classifyClinotDomainText("i have headache").allowed).toBe(true)
    expect(classifyRoute("i have headache", null).route).toBe("MEDICAL_SYMPTOM")
    const { outbound } = await turn("i have headache", 1)
    expect(outbound).not.toBe(CLINOT_REDIRECT)
    expect(outbound).toBeTruthy()
  })
})

// ===========================================================================
// TEST GROUP B — typo variations (routing result, not wording)
// ===========================================================================
describe("B — typo variations", () => {
  const typos = ["i have headche", "i have heache", "i have hedache", "i have headachee"]
  for (const input of typos) {
    it(`"${input}" routes MEDICAL_SYMPTOM (typo-tolerant), never outside`, async () => {
      expect(isClinotAllowedText(input)).toBe(true)
      const decision = classifyRoute(input, null)
      expect(decision.route).toBe("MEDICAL_SYMPTOM")
      expect(decision.reason).toBe("symptom_typo_tolerant_match")
      const { outbound } = await turn(input, 1)
      expect(outbound).not.toBe(CLINOT_REDIRECT)
      expect(outbound).toBeTruthy()
    })
  }
})

// ===========================================================================
// TEST GROUP C — natural symptom language
// ===========================================================================
describe("C — natural symptom language", () => {
  const natural = [
    "my head hurts",
    "my head is paining",
    "i have headache for 5 days",
    "i have very headache",
    "i have very headache for about 5 days regularly",
    "head pain",
  ]
  for (const input of natural) {
    it(`"${input}" routes to health/symptom handling`, async () => {
      expect(classifyRoute(input, null).route).toBe("MEDICAL_SYMPTOM")
      const { outbound } = await turn(input, 1)
      expect(outbound).not.toBe(CLINOT_REDIRECT)
      expect(outbound).toBeTruthy()
    })
  }
})

// ===========================================================================
// TEST GROUP D — other symptoms still work
// ===========================================================================
describe("D — other symptoms", () => {
  for (const input of ["i have knee pain", "i have back pain", "my back hurts", "i have pain in my knee"]) {
    it(`"${input}" routes MEDICAL_SYMPTOM`, () => {
      expect(classifyRoute(input, null).route).toBe("MEDICAL_SYMPTOM")
    })
  }
})

// ===========================================================================
// TEST GROUP E — outside-domain regression intact
// ===========================================================================
describe("E — outside domain regression", () => {
  it('"Tell me how to make calculator using python" stays OUTSIDE with 0 provider calls', async () => {
    const input = "Tell me how to make calculator using python"
    expect(isClinotAllowedText(input)).toBe(false)
    expect(classifyClinotDomainText(input)).toMatchObject({ allowed: false, domain: "outside" })
    expect(classifyRoute(input, null).route).toBe("OFF_TOPIC")
    const { outbound, aiCallsBefore } = await turn(input, 1)
    expect(aiCallsDuringTurn(aiCallsBefore)).toBe(0)
    expect(outbound).toBe(CLINOT_REDIRECT)
    expect(outbound).not.toContain("def ")
    expect(outbound).not.toContain("```")
  })
})

// ===========================================================================
// TEST GROUP F — random unrelated requests stay outside
// ===========================================================================
describe("F — unrelated requests", () => {
  const unrelated = [
    "What is the capital of France?",
    "How do I bake a cake?",
    "Can you explain photosynthesis?",
    "I like mathematics",
    "Tell me a joke",
  ]
  for (const input of unrelated) {
    it(`"${input}" gets the redirect with 0 provider calls`, async () => {
      expect(isClinotAllowedText(input)).toBe(false)
      const { outbound, aiCallsBefore } = await turn(input, 1)
      expect(aiCallsDuringTurn(aiCallsBefore)).toBe(0)
      expect(outbound).toBe(CLINOT_REDIRECT)
    })
  }
})

// ===========================================================================
// TEST GROUP G — appointment context unaffected
// ===========================================================================
describe("G — appointment context", () => {
  it('date, time, "yes" and "change the time" keep working around a typo-safe flow', async () => {
    let seq = 1
    await turn("I want to book an appointment", seq++)
    await turn("Akarshit", seq++)
    await turn("I have tooth pain", seq++)
    const t4 = await turn("12 September 2026", seq++)
    expect(aiCallsDuringTurn(t4.aiCallsBefore)).toBe(0)
    const t5 = await turn("4 PM", seq++)
    expect(aiCallsDuringTurn(t5.aiCallsBefore)).toBe(0)
    expect(t5.outbound).toContain("confirm")
    const t6 = await turn("change the time", seq++)
    expect(aiCallsDuringTurn(t6.aiCallsBefore)).toBe(0)
    expect(t6.outbound).not.toBe(CLINOT_REDIRECT)
    const before = openrouterState.calls.length
    const t7 = await turn("4 PM", seq++)
    expect(aiCallsDuringTurn(before)).toBe(0)
    const t8 = await turn("yes", seq++)
    expect(aiCallsDuringTurn(t8.aiCallsBefore)).toBe(0)
    expect(vi.mocked(prisma.appointment.create)).toHaveBeenCalledTimes(1)
  })
})

// ===========================================================================
// TEST GROUP H — typo health side question during a draft
// ===========================================================================
describe("H — typo health side question preserves the draft", () => {
  it('"i have headche" is handled safely, then booking continues', async () => {
    await turn("I want to book an appointment", 1)
    await turn("Akarshit", 2)
    await turn("I have tooth pain", 3)
    await turn("12 September 2026", 4)

    const snapshot = JSON.stringify(readDraft())
    expect(readDraft()?.preferredDate).toBeTruthy()

    const { outbound, aiCallsBefore } = await turn("i have headche", 5)
    expect(outbound).not.toBe(CLINOT_REDIRECT)
    expect(vi.mocked(prisma.appointment.create)).not.toHaveBeenCalled()
    // Draft preserved byte-for-byte: no date/time/name/reason change,
    // no confirmation, no creation.
    expect(JSON.stringify(readDraft())).toBe(snapshot)

    const t6 = await turn("4 PM", 6)
    expect(aiCallsDuringTurn(t6.aiCallsBefore)).toBe(0)
    expect(readDraft()?.preferredTime).toBeTruthy()
  })
})

// ===========================================================================
// TEST GROUP I — false-positive protection
// ===========================================================================
describe("I — false positives", () => {
  const notHealth = [
    "I have a meeting soon",
    "I like mathematics",
    "Tell me a joke",
    "My car needs repair",
  ]
  for (const input of notHealth) {
    it(`"${input}" is NOT a health request (stays outside)`, async () => {
      expect(fuzzyHealthSignal(input).matched).toBe(false)
      expect(isClinotAllowedText(input)).toBe(false)
      expect(classifyRoute(input, null).route).toBe("OFF_TOPIC")
    })
  }

  it('"My car needs repair" gets the redirect with 0 provider calls', async () => {
    const { outbound, aiCallsBefore } = await turn("My car needs repair", 1)
    expect(aiCallsDuringTurn(aiCallsBefore)).toBe(0)
    expect(outbound).toBe(CLINOT_REDIRECT)
  })

  it('framing alone is not enough ("My car needs repair" has "my" but no clinical token)', () => {
    expect(fuzzyHealthSignal("My car needs repair").matched).toBe(false)
  })
})
