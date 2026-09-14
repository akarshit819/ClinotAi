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
