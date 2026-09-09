/**
 * Appointment booking flow — functional regression tests for the
 * production incident (JSON leak to WhatsApp, fake confirmations,
 * year-handling failures, missing confirmation step).
 *
 * Covers mission TEST 1–10:
 *   1. booking intent starts collection
 *   2. yearless dates use the dynamic current year (no hardcoded year)
 *   3. year corrections update the draft (no generic fallback)
 *   4. explicit dates parse correctly
 *   5. natural times parse to 24h
 *   6. "yes confirm" creates a REAL database appointment
 *   7. created appointment carries dashboard-ready real values
 *   8. confirmation text shows real values, never placeholders
 *   9. internal JSON/tool payloads never reach WhatsApp
 *   10. duplicate confirmations never duplicate appointments
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  extractDate,
  extractTime,
  extractYearCorrection,
  applyYearToDate,
  isConfirmationMessage,
  isDenialMessage,
  formatDateHuman,
  formatTimeHuman,
  buildConfirmationSummary,
  buildBookingConfirmation,
  isDraftReady,
  type AppointmentDraft,
} from "../src/messaging/ai/appointment-state"
import { sanitizeOutboundText } from "../src/messaging/sanitize"

// ---------------------------------------------------------------------------
// Date handling (dynamic server date — never hardcoded)
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function isoOf(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

describe("TEST 2/4: intelligent date parsing", () => {
  it("yearless future date uses the dynamic current year", () => {
    const now = new Date()
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60_000)
    const label = `${future.getDate()} ${MONTH_NAMES[future.getMonth()]}`
    expect(extractDate(label, now)).toBe(isoOf(future))
  })

  it("yearless past date rolls to next year (never books the past)", () => {
    const now = new Date()
    const past = new Date(now.getTime() - 30 * 24 * 60 * 60_000)
    const label = `${past.getDate()} ${MONTH_NAMES[past.getMonth()]}`
    const expected = new Date(past)
    expected.setFullYear(expected.getFullYear() + 1)
    expect(extractDate(label, now)).toBe(isoOf(expected))
  })

  it("supports ordinals: '12th September' and 'September 12th'", () => {
    const now = new Date(2026, 0, 15) // fixed reference: 15 Jan 2026
    expect(extractDate("12th September", now)).toBe("2026-09-12")
    expect(extractDate("September 12th", now)).toBe("2026-09-12")
    expect(extractDate("12 September", now)).toBe("2026-09-12")
    expect(extractDate("September 12", now)).toBe("2026-09-12")
    expect(extractDate("12 Sep", now)).toBe("2026-09-12")
  })

  it("explicit year always wins and is never shifted", () => {
    const now = new Date(2026, 10, 1) // 1 Nov 2026
    expect(extractDate("12 September 2026", now)).toBe("2026-09-12")
    expect(extractDate("12 September 2027", now)).toBe("2027-09-12")
  })

  it("impossible dates are rejected (no silent rollover)", () => {
    const now = new Date(2026, 0, 15)
    expect(extractDate("30 February", now)).toBeUndefined()
    expect(extractDate("31 February 2026", now)).toBeUndefined()
  })

  it("relative dates still work", () => {
    const now = new Date(2026, 5, 10, 12, 0, 0) // Wed 10 Jun 2026 noon
    expect(extractDate("tomorrow", now)).toBe("2026-06-11")
    expect(extractDate("next Monday", now)).toBe("2026-06-22")
  })
})

describe("TEST 3: year corrections", () => {
  it("'not 2027, 2026' targets the last year", () => {
    expect(extractYearCorrection("bro its not 2027 bro its 2026 so")).toBe(2026)
  })

  it("'it's 2026' is a correction", () => {
    expect(extractYearCorrection("it's 2026")).toBe(2026)
  })

  it("bare year is a correction", () => {
    expect(extractYearCorrection("2026")).toBe(2026)
  })

  it("no year → no correction", () => {
    expect(extractYearCorrection("12 september right")).toBeUndefined()
    expect(extractYearCorrection("hello")).toBeUndefined()
  })

  it("applyYearToDate rewrites the year and validates", () => {
    expect(applyYearToDate("2027-09-12", 2026)).toBe("2026-09-12")
    expect(applyYearToDate("2027-02-29", 2026)).toBeUndefined() // not a leap year
    expect(applyYearToDate("garbage", 2026)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// TEST 5: natural time parsing
// ---------------------------------------------------------------------------

describe("TEST 5: natural time parsing", () => {
  it("parses common forms to 24h HH:MM", () => {
    expect(extractTime("4pm")).toBe("16:00")
    expect(extractTime("4 PM")).toBe("16:00")
    expect(extractTime("16:00")).toBe("16:00")
    expect(extractTime("4:30pm")).toBe("16:30")
    expect(extractTime("half past four")).toBe("04:30")
    expect(extractTime("noon")).toBe("12:00")
    expect(extractTime("morning")).toBe("09:00")
  })
})

// ---------------------------------------------------------------------------
// Confirmation / denial intents
// ---------------------------------------------------------------------------

describe("confirmation and denial intents", () => {
  it.each(["yes", "confirm", "yes confirm", "confirm appointment", "book it", "that's correct", "sure", "go ahead"])(
    "confirmation: %s",
    (text) => expect(isConfirmationMessage(text)).toBe(true),
  )

  it.each(["no", "nope", "don't book", "never mind"])(
    "denial: %s",
    (text) => expect(isDenialMessage(text)).toBe(true),
  )

  it("long unrelated messages are not confirmations", () => {
    expect(isConfirmationMessage("yes I have a headache and I want to know about cleaning")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Human formatting + confirmation summaries (TEST 8)
// ---------------------------------------------------------------------------

function readyDraft(): AppointmentDraft {
  return {
    active: true,
    status: "ready",
    expectedField: null,
    patientName: "Akarshit",
    patientPhone: "8700879404",
    reason: "Leg pain",
    preferredDate: "2026-09-12",
    preferredTime: "16:00",
    history: [],
  }
}

describe("TEST 8: human summaries carry real values", () => {
  it("formats date and time for humans", () => {
    expect(formatDateHuman("2026-09-12")).toBe("12 September 2026")
    expect(formatTimeHuman("16:00")).toBe("4:00 PM")
    expect(formatTimeHuman("09:30")).toBe("9:30 AM")
  })

  it("confirmation summary shows real values and asks to confirm", () => {
    const summary = buildConfirmationSummary(readyDraft())
    expect(summary).toContain("12 September 2026")
    expect(summary).toContain("4:00 PM")
    expect(summary).toContain("Akarshit")
    expect(summary).toContain("Leg pain")
    expect(summary).toMatch(/confirm/i)
    expect(summary).not.toContain("phone set")
    expect(summary).not.toContain("reason set")
  })

  it("booking confirmation is sent only with real values", () => {
    const text = buildBookingConfirmation(readyDraft())
    expect(text).toContain("12 September 2026")
    expect(text).toContain("4:00 PM")
    expect(text).toMatch(/confirm/i)
    expect(text).not.toContain("phone set")
  })

  it("draft readiness requires every field", () => {
    expect(isDraftReady(readyDraft())).toBe(true)
    expect(isDraftReady({ ...readyDraft(), preferredTime: undefined })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TEST 7/8: dashboard presentation — stored rows map to UI fields
// ---------------------------------------------------------------------------

describe("TEST 7/8: dashboard shows real stored values", () => {
  it("maps schema columns to the dashboard UI shape (date/time/phone)", async () => {
    const { toDashboardAppointment } = await import("../src/lib/appointment/present")
    const mapped = toDashboardAppointment({
      id: "appt-1",
      patientName: "Akarshit",
      phone: "8700879404",
      email: null,
      reason: "Leg pain",
      preferredDate: "2026-09-12",
      preferredTime: "16:00",
      isEmergency: false,
      status: "confirmed",
      createdAt: "2026-09-09T00:00:00.000Z",
    })
    // What the dashboard renders:
    expect(mapped.patientName).toBe("Akarshit")
    expect(mapped.patientPhone).toBe("8700879404")
    expect(mapped.date).toBe("2026-09-12")
    expect(mapped.time).toBe("16:00")
    expect(mapped.reason).toBe("Leg pain")
    expect(mapped.status).toBe("confirmed")
    // Raw columns preserved for every other consumer:
    expect(mapped.phone).toBe("8700879404")
    expect(mapped.preferredDate).toBe("2026-09-12")
    expect(mapped.preferredTime).toBe("16:00")
  })
})

// ---------------------------------------------------------------------------
// TEST 9: outbound safeguard — internal JSON never reaches WhatsApp
// ---------------------------------------------------------------------------

describe("TEST 9: outbound JSON-leak safeguard", () => {
  // The EXACT payload shape from the production incident.
  const leaked =
    '{"appointment":{"date":"2026-09-12","time":"16:00","name":"Akarshit","phone":"phone set","reason":"reason set"}}'

  it("blocks the incident payload", () => {
    const r = sanitizeOutboundText(`Please confirm?\n${leaked}`, {
      conversationId: "conv-1",
      clinicId: "clinic-1",
    })
    expect(r.blocked).toBe(true)
    expect(r.text).not.toContain('"appointment"')
    expect(r.text).not.toContain("phone set")
    expect(r.text.length).toBeGreaterThan(10)
  })

  it("blocks fenced JSON payloads", () => {
    const r = sanitizeOutboundText('Here you go:\n```json\n{"appointment":{"date":"2026-09-12"}}\n```', {})
    expect(r.blocked).toBe(true)
    expect(r.text).not.toContain("{")
  })

  it("blocks placeholder-token echoes", () => {
    const r = sanitizeOutboundText("Appointment for Akarshit, phone set, reason set.", {})
    expect(r.blocked).toBe(true)
  })

  it("passes normal human text untouched", () => {
    const clean =
      "Perfect. I have:\nDate: 12 September 2026\nTime: 4:00 PM\n\nShall I confirm this appointment?"
    const r = sanitizeOutboundText(clean, {})
    expect(r.blocked).toBe(false)
    expect(r.text).toBe(clean)
  })

  it("passes tool-free AI chatter untouched", () => {
    const clean = "Sure, I can help you book an appointment. What's your full name?"
    expect(sanitizeOutboundText(clean, {}).blocked).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TEST 6/7/10: deterministic booking against a mocked database
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => {
  const users = [{ id: "prov-1", name: "Dr. Smith" }]
  const tx = {
    clinic: { findUnique: vi.fn(async () => ({ timezone: "America/New_York" })) },
    appointment: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: "appt-1",
        ...args.data,
      })),
    },
  }
  return {
    prisma: {
      appointment: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => ({ id: "appt-1" })),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
          id: "appt-1",
          ...args.data,
        })),
      },
      patient: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
          id: "pat-1",
          ...args.data,
        })),
        update: vi.fn(async (args: { where: { id: string } }) => ({ id: args.where.id })),
      },
      user: {
        findMany: vi.fn(async () => users),
        findUnique: vi.fn(async () => ({ name: "Dr. Smith" })),
      },
      clinic: {
        findUnique: vi.fn(async () => ({
          id: "clinic-1",
          name: "Demo Clinic",
          timezone: "America/New_York",
          phone: "+15550000000",
          openingHours: "Mon-Fri 9-5",
          address: "1 Clinic Road",
          emergencyPhone: "+15559999999",
        })),
      },
      fAQ: { findMany: vi.fn(async () => []) },
      knowledgeBase: { findMany: vi.fn(async () => []) },
      conversation: { update: vi.fn(async () => ({})) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    },
  }
})

describe(
  "TEST 6/7: confirmation creates a REAL database appointment",
  () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

  it("books with real patient/appointment values (dashboard-ready)", async () => {
    const { prisma } = await import("../src/lib/db")
    const { bookAppointmentFromDraft } = await import("../src/lib/appointment/booking")

    // No duplicate present.
    ;(prisma.appointment.findFirst as any).mockResolvedValue(null)

    const result = await bookAppointmentFromDraft({
      clinicId: "clinic-1",
      draft: readyDraft(),
      whatsappPhone: "8700879404",
      whatsappName: "Akarshit",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.duplicate).toBe(false)
    expect(result.appointmentId).toBe("appt-1")

    // Patient resolved by the REAL verified phone.
    expect(prisma.patient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clinicId: "clinic-1", phone: "8700879404" } }),
    )
    // Appointment persisted with REAL values (what the dashboard reads).
    const created = (prisma as any).$transaction
    expect(created).toHaveBeenCalled()
  })

  it("stores actual values — never 'phone set' / 'reason set' placeholders", async () => {
    const { prisma } = await import("../src/lib/db")
    const { bookAppointmentFromDraft } = await import("../src/lib/appointment/booking")
    ;(prisma.appointment.findFirst as any).mockResolvedValue(null)
    ;(prisma.patient.findFirst as any).mockResolvedValue(null)

    let createdData: Record<string, unknown> = {}
    ;(prisma as any).$transaction.mockImplementationOnce(
      async (cb: (tx: any) => unknown) =>
        cb({
          clinic: { findUnique: async () => ({ timezone: "America/New_York" }) },
          appointment: {
            findMany: async () => [],
            create: async (args: { data: Record<string, unknown> }) => {
              createdData = args.data
              return { id: "appt-2", ...args.data }
            },
          },
        }),
    )

    const result = await bookAppointmentFromDraft({
      clinicId: "clinic-1",
      draft: readyDraft(),
      whatsappPhone: "8700879404",
    })
    expect(result.ok).toBe(true)
    // TEST 7/8: dashboard-required real values.
    expect(createdData.patientName).toBe("Akarshit")
    expect(createdData.phone).toBe("8700879404")
    expect(createdData.preferredDate).toBe("2026-09-12")
    expect(createdData.preferredTime).toBe("16:00")
    expect(createdData.reason).toBe("Leg pain")
    expect(createdData.status).toBe("confirmed")
    expect(JSON.stringify(createdData)).not.toContain("phone set")
    expect(JSON.stringify(createdData)).not.toContain("reason set")
  })

  it("TEST 10: duplicate confirmation reuses the appointment (no duplicate row)", async () => {
    const { prisma } = await import("../src/lib/db")
    const { bookAppointmentFromDraft } = await import("../src/lib/appointment/booking")
    ;(prisma.appointment.findFirst as any).mockResolvedValue({
      id: "appt-existing",
      patientId: "pat-1",
      doctor: "prov-1",
    })

    const result = await bookAppointmentFromDraft({
      clinicId: "clinic-1",
      draft: readyDraft(),
      whatsappPhone: "8700879404",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.duplicate).toBe(true)
    expect(result.appointmentId).toBe("appt-existing")
    // No patient row and no appointment row may be created on this path.
    expect((prisma.patient.create as any).mock.calls.length).toBe(0)
  })

  it("missing fields refuse safely without a fake success", async () => {
    const { bookAppointmentFromDraft } = await import("../src/lib/appointment/booking")
    const result = await bookAppointmentFromDraft({
      clinicId: "clinic-1",
      draft: { ...readyDraft(), preferredTime: undefined },
      whatsappPhone: "8700879404",
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("missing_fields")
  })
  },
  30000,
)

// ---------------------------------------------------------------------------
// Receptionist-level: activation → correction → confirmation (no AI calls)
// ---------------------------------------------------------------------------

function receptionistContext(metadata: string | null) {
  return {
    message: {
      platform: "whatsapp",
      channelId: "15559876543",
      sourceMessageId: "wamid-9",
      from: { id: "15559876543", name: "Akarshit", phone: "15559876543" },
      content: "",
      timestamp: new Date(),
    },
    clinicId: "clinic-1",
    clinic: { id: "clinic-1", name: "Demo Clinic", timezone: "America/New_York" },
    conversation: { id: "conv-1", clinicId: "clinic-1", metadata } as any,
    patientId: "pat-1",
    knowledge: [],
    faqs: [],
    isEmergency: false,
  }
}

function draftMetadata(draft: object): string {
  return JSON.stringify({ appointmentDraft: draft })
}

describe("receptionist appointment flow (TEST 1/3/6 end-to-end, no LLM)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("TEST 1: 'I want to book an appointment' starts collection", async () => {
    const { prisma } = await import("../src/lib/db")
    const { runAiReceptionist } = await import("../src/messaging/ai/receptionist")
    const ctx = receptionistContext(null)
    ctx.message.content = "I want to book an appointment"

    const result = await runAiReceptionist(ctx, ctx.message, [])

    expect(result.response).toMatch(/full name/i)
    expect(result.responseSource).toBe("APPOINTMENT")
    expect(result.requiresClinic).toBe(false)
    const updateCalls = (prisma.conversation.update as any).mock.calls
    expect(updateCalls.length).toBeGreaterThan(0)
    const savedMetadata = updateCalls[0][0].data.metadata as string
    expect(savedMetadata).toContain('"appointmentDraft"')
    expect(savedMetadata).toContain('"active":true')
  })

  it("TEST 3: 'not 2027, 2026' corrects the draft year (no generic fallback)", async () => {
    const { prisma } = await import("../src/lib/db")
    const { runAiReceptionist } = await import("../src/messaging/ai/receptionist")
    const ctx = receptionistContext(
      draftMetadata({
        ...readyDraft(),
        preferredDate: "2027-09-12",
        history: [],
      }),
    )
    ctx.message.content = "bro its not 2027 bro its 2026 so"

    const result = await runAiReceptionist(ctx, ctx.message, [])

    expect(result.response).toContain("2026")
    expect(result.response).not.toContain("not sure I have the exact information")
    expect(result.responseSource).toBe("APPOINTMENT")
    const updateCalls = (prisma.conversation.update as any).mock.calls
    const savedMetadata = updateCalls[updateCalls.length - 1][0].data.metadata as string
    expect(savedMetadata).toContain("2026-09-12")
    expect(savedMetadata).not.toContain("2027-09-12")
  })

  it("TEST 6: 'yes confirm' creates the appointment deterministically", async () => {
    const { prisma } = await import("../src/lib/db")
    const { runAiReceptionist } = await import("../src/messaging/ai/receptionist")
    ;(prisma.appointment.findFirst as any).mockResolvedValue(null)
    ;(prisma.patient.findFirst as any).mockResolvedValue(null)

    const ctx = receptionistContext(draftMetadata({ ...readyDraft(), history: [] }))
    ctx.message.content = "yes confirm this appointment"

    const result = await runAiReceptionist(ctx, ctx.message, [])

    expect(result.response).toMatch(/confirmed/i)
    expect(result.response).toContain("12 September 2026")
    expect(result.response).toContain("4:00 PM")
    expect(result.response).not.toContain("{")
    expect(result.requiresClinic).toBe(false)
    expect(result.responseSource).toBe("APPOINTMENT")
  })

  it("ready draft + side question falls through without losing the draft", async () => {
    const { prisma } = await import("../src/lib/db")
    const { runAiReceptionist } = await import("../src/messaging/ai/receptionist")
    // Force the AI path to fail loudly if reached: no fetch stub here, so
    // any provider attempt throws and the fallback engages — the draft
    // must still survive in metadata.
    const ctx = receptionistContext(draftMetadata({ ...readyDraft(), history: [] }))
    ctx.message.content = "where are you located?"

    const result = await runAiReceptionist(ctx, ctx.message, [])
    expect(result.requiresClinic).toBe(false)
    // Draft must NOT have been cleared AND must NOT be corrupted by the
    // permissive reason extractor ("Located" must not become the name).
    const updateCalls = (prisma.conversation.update as any).mock.calls
    const lastMetadata = updateCalls[updateCalls.length - 1][0].data.metadata as string
    expect(lastMetadata).toContain('"appointmentDraft"')
    const saved = JSON.parse(lastMetadata).appointmentDraft
    expect(saved.patientName).toBe("Akarshit")
    expect(saved.reason).toBe("Leg pain")
    expect(saved.preferredDate).toBe("2026-09-12")
    expect(saved.preferredTime).toBe("16:00")
  })

  it("ready draft + genuine correction applies ('actually 5pm')", async () => {
    const { prisma } = await import("../src/lib/db")
    const { runAiReceptionist } = await import("../src/messaging/ai/receptionist")
    const ctx = receptionistContext(draftMetadata({ ...readyDraft(), history: [] }))
    ctx.message.content = "actually make it 5pm"

    const result = await runAiReceptionist(ctx, ctx.message, [])
    expect(result.response).toContain("5:00 PM")
    expect(result.responseSource).toBe("APPOINTMENT")
    const updateCalls = (prisma.conversation.update as any).mock.calls
    const lastMetadata = updateCalls[updateCalls.length - 1][0].data.metadata as string
    const saved = JSON.parse(lastMetadata).appointmentDraft
    expect(saved.preferredTime).toBe("17:00")
    expect(saved.patientName).toBe("Akarshit")
  })
})
