/**
 * Pipeline-level replay of the two production appointment incidents:
 *
 *   INCIDENT 1: "Confirm" → became NAME, "Book" → became REASON,
 *   "Done" → became NAME, then "Yes" confirmed corrupted data.
 *
 *   INCIDENT 2: "I want another appointment" + all details in ONE
 *   message → generic fallback; "Book this" → generic fallback again.
 *
 * Full chain per turn: processIncomingMessage → receptionist →
 * deterministic appointment engine → outbound WhatsApp payload.
 * Booking itself is mocked at the booking-module boundary (its own
 * write-verify logic is covered elsewhere); what is proven here is
 * that control words never corrupt the draft and structured bundles
 * always enter the deterministic flow with zero AI calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { processIncomingMessage } from "../src/messaging/pipeline"
import { CLINOT_REDIRECT } from "../src/lib/ai/clinot-domain"
import type { IncomingMessage } from "../src/messaging/types"

const bookingState = vi.hoisted(() => ({
  calls: [] as Array<{ draft: Record<string, unknown> }>,
}))

vi.mock("@/lib/appointment/booking", () => ({
  bookAppointmentFromDraft: vi.fn(async (req: { draft: Record<string, unknown> }) => {
    bookingState.calls.push({ draft: req.draft })
    return { ok: true, appointmentId: "appt-1", patientId: "pat-1", providerName: "Dr. Smith", duplicate: false }
  }),
  findNearestAvailableSlot: vi.fn(async () => null),
}))

const openrouterState = vi.hoisted(() => ({
  calls: [] as Array<{ url: string }>,
}))

vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
  openrouterState.calls.push({ url: String(url) })
  throw new Error("Unexpected fetch in test (provider must not be called): " + String(url))
}))

const db = vi.hoisted(() => {
  return {
    conversation: null as null | Record<string, unknown>,
    messages: [] as Array<{ id: string; role: string; content: string }>,
    outboundJobs: [] as Array<Record<string, any>>,
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
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: "pat-9", ...args.data })),
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
      findUnique: vi.fn(async () => null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: "appt-1", ...args.data })),
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

async function turn(content: string, seq: number): Promise<{ outbound: string | null; aiCalls: number }> {
  const before = openrouterState.calls.length
  await processIncomingMessage("clinic-1", makeMessage(content, seq))
  const lastJob = db.outboundJobs[db.outboundJobs.length - 1]
  return {
    outbound: lastJob?.payload?.payload?.text?.body ?? null,
    aiCalls: openrouterState.calls.length - before,
  }
}

function draft(): Record<string, any> {
  const metadata = (db.conversation?.metadata as string | null) ?? null
  if (!metadata) return {}
  try {
    return (JSON.parse(metadata) as { appointmentDraft?: Record<string, any> }).appointmentDraft ?? {}
  } catch {
    return {}
  }
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-or-key"
  process.env.OPENROUTER_MODEL = "test-primary-model"
  delete process.env.OPENROUTER_FALLBACK_MODELS
  db.conversation = null
  db.messages = []
  db.outboundJobs = []
  openrouterState.calls = []
  bookingState.calls = []
})

// ============================================================================
// INCIDENT 1 — control words never corrupt the draft, end to end
// ============================================================================
describe("INCIDENT 1: Confirm/Book/Done never become slot data", () => {
  it("control words leave collected fields intact across turns", async () => {
    let r = await turn("I want to book an appointment", 1)
    expect(r.aiCalls).toBe(0)
    expect(r.outbound).toMatch(/full name/i)

    r = await turn("Confirm", 2)
    expect(r.aiCalls).toBe(0)
    expect(draft().patientName ?? null).toBeNull()
    expect(r.outbound).toMatch(/still need/i)

    r = await turn("Akarshit", 3)
    expect(r.aiCalls).toBe(0)
    expect(draft().patientName).toBe("Akarshit")

    r = await turn("Book", 4)
    expect(r.aiCalls).toBe(0)
    expect(draft().reason ?? null).toBeNull()
    expect(r.outbound).toMatch(/reason/i)

    r = await turn("Done", 5)
    expect(r.aiCalls).toBe(0)
    expect(draft().patientName).toBe("Akarshit")
    expect(draft().reason ?? null).toBeNull()
  })
})

// ============================================================================
// INCIDENT 2 — another appointment + bundle + "Book this" books cleanly
// ============================================================================
describe("INCIDENT 2: another appointment → bundle → Book this", () => {
  it("books the new appointment with uncorrupted data, then starts clean", async () => {
    let r = await turn("I want another appointment", 1)
    expect(r.aiCalls).toBe(0)
    expect(r.outbound).toMatch(/full name/i)

    r = await turn("Akarshit Rajput\n9643070673\nHeadache\n20 September 2026 at 4pm", 2)
    expect(r.aiCalls).toBe(0)
    expect(r.outbound).toMatch(/20 September 2026/)
    expect(r.outbound).toMatch(/4:00 PM/)
    expect(r.outbound).toMatch(/Akarshit Rajput/)
    expect(r.outbound).toMatch(/9643070673/)
    expect(r.outbound).toMatch(/Headache/)

    r = await turn("Book this", 3)
    expect(r.aiCalls).toBe(0)
    expect(r.outbound).toMatch(/confirmed/i)
    expect(bookingState.calls.length).toBe(1)
    expect(bookingState.calls[0].draft.patientName).toBe("Akarshit Rajput")
    expect(bookingState.calls[0].draft.reason).toBe("Headache")
    expect(bookingState.calls[0].draft.preferredDate).toBe("2026-09-20")
    expect(bookingState.calls[0].draft.preferredTime).toBe("16:00")

    // After BOOKED the draft is cleared: a new request starts clean.
    expect(draft().active ?? false).toBe(false)
    r = await turn("I want another appointment", 4)
    expect(r.aiCalls).toBe(0)
    expect(r.outbound).toMatch(/full name/i)
  })
})

// ============================================================================
// TEST 1/2/3 — each READY confirmation word books with uncorrupted data
// ============================================================================
describe("TEST 1/2/3: Confirm/Book/Done/Yes while READY books cleanly", () => {
  const BUNDLE = "Akarshit Rajput\n9643070673\nHeadache\n20 September 2026 at 4pm"

  async function collectToReady(seqStart: number): Promise<number> {
    let seq = seqStart
    let r = await turn("I want to book an appointment", seq++)
    expect(r.outbound).toMatch(/full name/i)
    r = await turn(BUNDLE, seq++)
    expect(r.outbound).toMatch(/Would you like me to confirm/i)
    return seq
  }

  for (const word of ["Confirm", "Book", "Done", "Yes"]) {
    it(`"${word}" while READY books without touching any field`, async () => {
      const seq = await collectToReady(1)
      const r = await turn(word, seq)
      expect(r.aiCalls).toBe(0)
      expect(r.outbound).toMatch(/confirmed/i)
      expect(bookingState.calls.length).toBe(1)
      const booked = bookingState.calls[0].draft as Record<string, unknown>
      expect(booked.patientName).toBe("Akarshit Rajput")
      expect(booked.reason).toBe("Headache")
      expect(booked.preferredDate).toBe("2026-09-20")
      expect(booked.preferredTime).toBe("16:00")
    })
  }
})

// ============================================================================
// TEST 4 (pipeline) — "Yes" while waiting for a name re-asks, never books
// ============================================================================
describe("TEST 4 (pipeline): 'Yes' while collecting a name", () => {
  it("does not become the name and does not book", async () => {
    let r = await turn("I want to book an appointment", 1)
    expect(r.outbound).toMatch(/full name/i)
    r = await turn("Yes", 2)
    expect(r.aiCalls).toBe(0)
    expect(draft().patientName ?? null).toBeNull()
    expect(r.outbound).toMatch(/full name/i)
    expect(bookingState.calls.length).toBe(0)
  })
})

// ============================================================================
// TEST 6 (pipeline) — "How are you?" preserves the draft
// ============================================================================
describe("TEST 6 (pipeline): unrelated chatter preserves collected fields", () => {
  it("'How are you?' leaves the name intact", async () => {
    await turn("I want to book an appointment", 1)
    await turn("Akarshit", 2)
    expect(draft().patientName).toBe("Akarshit")
    const r = await turn("How are you?", 3)
    expect(draft().patientName).toBe("Akarshit")
    expect(r.outbound).toBe(CLINOT_REDIRECT)
  })
})

// ============================================================================
// TEST 7/8 (pipeline) — READY corrections change exactly one field
// ============================================================================
describe("TEST 7/8 (pipeline): READY corrections are surgical", () => {
  const BUNDLE = "Akarshit Rajput\n9643070673\nHeadache\n20 September 2026 at 2pm"

  it("time, then date, then booking carry the corrected values", async () => {
    await turn("I want to book an appointment", 1)
    await turn(BUNDLE, 2)
    expect(draft().preferredTime).toBe("14:00")

    let r = await turn("Actually make it 4 PM", 3)
    expect(r.aiCalls).toBe(0)
    expect(bookingState.calls.length).toBe(0)
    expect(draft().preferredTime).toBe("16:00")
    expect(draft().preferredDate).toBe("2026-09-20")
    expect(draft().patientName).toBe("Akarshit Rajput")
    expect(r.outbound).toMatch(/4:00 PM/)

    r = await turn("Change date to 30 September 2026", 4)
    expect(r.aiCalls).toBe(0)
    expect(bookingState.calls.length).toBe(0)
    expect(draft().preferredDate).toBe("2026-09-30")
    expect(draft().preferredTime).toBe("16:00")

    r = await turn("Yes", 5)
    expect(r.aiCalls).toBe(0)
    expect(r.outbound).toMatch(/confirmed/i)
    expect(bookingState.calls.length).toBe(1)
    const booked = bookingState.calls[0].draft as Record<string, unknown>
    expect(booked.preferredDate).toBe("2026-09-30")
    expect(booked.preferredTime).toBe("16:00")
  })
})

// ============================================================================
// TEST 15 (pipeline) — repeated confirmations never re-book
// ============================================================================
describe("TEST 15 (pipeline): repeated 'Yes' after BOOKED books once", () => {
  it("second confirmation touches no booking", async () => {
    await turn("I want to book an appointment", 1)
    await turn("Akarshit Rajput\n9643070673\nHeadache\n20 September 2026 at 4pm", 2)
    const r1 = await turn("Yes", 3)
    expect(r1.outbound).toMatch(/confirmed/i)
    expect(bookingState.calls.length).toBe(1)
    const r2 = await turn("Yes", 4)
    expect(bookingState.calls.length).toBe(1)
    expect(r2.outbound).not.toMatch(/Your appointment (has been|is already) confirmed/)
  })
})

// ============================================================================
// TEST 16 (pipeline) — out-of-topic code request is redirected, no code
// ============================================================================
describe("TEST 16 (pipeline): Python request gets the clinic redirect", () => {
  it("returns the redirect with zero provider calls", async () => {
    const r = await turn("Tell me how to code Python", 1)
    expect(r.aiCalls).toBe(0)
    expect(r.outbound).toBe(CLINOT_REDIRECT)
  })
})

// ============================================================================
// TEST 17 (pipeline) — symptom gets an empathetic clinic response
// ============================================================================
describe("TEST 17 (pipeline): natural symptom message is handled kindly", () => {
  it("responds empathetically and offers clinic help", async () => {
    // Provider is stubbed to fail here, so the deterministic medical
    // sympathy fallback answers — no diagnosis, no redirect spam.
    const r = await turn("I'm feeling very bad and having headache", 1)
    expect(r.outbound).toMatch(/sorry to hear/i)
    expect(r.outbound).toMatch(/appointment/i)
  })
})
