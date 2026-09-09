/**
 * Appointment availability + dashboard + failure-path regression tests
 * for the LIVE "every slot taken" incident and related bugs.
 *
 * All datetimes are built with fromZonedTime in the clinic timezone so
 * these tests are correct on ANY server timezone (the incident class).
 *
 *   TEST 1: 4 PM available → confirm → appointment created
 *   TEST 2: 4 PM occupied → 2 PM can still be booked
 *   TEST 3: same date + same time → conflict
 *   TEST 4: same date + different time → NO conflict
 *   TEST 5: different date + same time → NO conflict
 *   TEST 6: "take according to yourself" → nearest real available slot
 *   TEST 7: created appointment is returned by the dashboard API
 *   TEST 8: dashboard API fields match the frontend contract
 *   TEST 9-11: name / phone / date+time displayed (via mapper contract)
 *   TEST 12: DB failure → no false success
 *   TEST 13: draft survives DB failure
 *   TEST 14: no confirmation text before a verified DB write
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { fromZonedTime } from "date-fns-tz"

const TZ = "America/New_York"
const BOOKED_DATE = "2026-10-05"
const BOOKED_TIME = "16:00"

function bookedRow(time: string, date: string = BOOKED_DATE, doctor = "prov-1") {
  return { id: `row-${date}-${time}`, preferredDate: date, preferredTime: time, endTime: null, doctor, clinicId: "clinic-1" }
}

vi.mock("@/lib/db", () => {
  const users = [{ id: "prov-1", name: "Dr. Smith" }]
  const tx = {
    clinic: { findUnique: vi.fn(async () => ({ timezone: TZ })) },
    appointment: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: "appt-1", ...args.data })),
    },
  }
  return {
    prisma: {
      appointment: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: "appt-1", ...args.data })),
      },
      patient: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: "pat-1", ...args.data })),
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
          timezone: TZ,
          phone: "+15550000000",
          openingHours: null,
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

vi.mock("@/lib/api", () => ({
  getClinicId: vi.fn(async () => ({ clinicId: "clinic-1", userId: "u-1" })),
  apiError: (message: string, status = 500, code?: string) =>
    new Response(JSON.stringify({ error: message, code }), { status }),
  handleApiError: (error: unknown, defaultMessage = "Internal server error") =>
    new Response(JSON.stringify({ error: defaultMessage }), { status: 500 }),
}))

function slot(date: string, time: string): { start: Date; end: Date } {
  const start = fromZonedTime(`${date} ${time}`, TZ)
  return { start, end: new Date(start.getTime() + 30 * 60_000) }
}

describe("Bug 5: slot equality (same/same conflicts; all else free)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("TEST 3: same date + same time + same provider → conflict", async () => {
    const { prisma } = await import("../src/lib/db")
    const { checkSlotAvailability } = await import("../src/lib/appointment/availability")
    ;(prisma.appointment.findMany as any).mockResolvedValue([bookedRow("16:00")])
    const { start, end } = slot(BOOKED_DATE, "16:00")
    await expect(checkSlotAvailability("clinic-1", start, end, "prov-1")).resolves.toBe(false)
  })

  it("TEST 4: same date + different time → NO conflict", async () => {
    const { prisma } = await import("../src/lib/db")
    const { checkSlotAvailability } = await import("../src/lib/appointment/availability")
    ;(prisma.appointment.findMany as any).mockResolvedValue([bookedRow("16:00")])
    const { start, end } = slot(BOOKED_DATE, "14:00")
    await expect(checkSlotAvailability("clinic-1", start, end, "prov-1")).resolves.toBe(true)
  })

  it("TEST 5: different date + same time → NO conflict", async () => {
    const { prisma } = await import("../src/lib/db")
    const { checkSlotAvailability } = await import("../src/lib/appointment/availability")
    ;(prisma.appointment.findMany as any).mockResolvedValue([bookedRow("16:00")])
    const { start, end } = slot("2026-10-06", "16:00")
    await expect(checkSlotAvailability("clinic-1", start, end, "prov-1")).resolves.toBe(true)
  })

  it("same slot on a different provider → NO conflict (per-provider isolation)", async () => {
    const { prisma } = await import("../src/lib/db")
    const { checkSlotAvailability } = await import("../src/lib/appointment/availability")
    ;(prisma.appointment.findMany as any).mockResolvedValue([bookedRow("16:00", BOOKED_DATE, "prov-1")])
    const { start, end } = slot(BOOKED_DATE, "16:00")
    await expect(checkSlotAvailability("clinic-1", start, end, "prov-2")).resolves.toBe(true)
  })

  it("malformed stored rows never fail the check", async () => {
    const { prisma } = await import("../src/lib/db")
    const { checkSlotAvailability } = await import("../src/lib/appointment/availability")
    ;(prisma.appointment.findMany as any).mockResolvedValue([
      { id: "bad-1", preferredDate: "not-a-date", preferredTime: "whenever", endTime: null, doctor: "prov-1", clinicId: "clinic-1" },
      { id: "bad-2", preferredDate: "2026-10-05", preferredTime: "4:00 PM", endTime: null, doctor: "prov-1", clinicId: "clinic-1" },
    ])
    const { start, end } = slot(BOOKED_DATE, "14:00")
    await expect(checkSlotAvailability("clinic-1", start, end, "prov-1")).resolves.toBe(true)
  })

  it("invalid clinic timezone falls back instead of throwing", async () => {
    const { resolveTimezone } = await import("../src/lib/appointment/availability")
    // "Not/AZone" is not resolvable by Intl and throws RangeError there.
    expect(resolveTimezone("Not/AZone")).toBe("America/New_York")
    expect(resolveTimezone("")).toBe("America/New_York")
    expect(resolveTimezone(null)).toBe("America/New_York")
    expect(resolveTimezone("America/New_York")).toBe("America/New_York")
    expect(resolveTimezone("Asia/Kolkata")).toBe("Asia/Kolkata")
  })
})

describe("Bug 1: booking honors real availability", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function readyDraft() {
    return {
      active: true,
      status: "ready" as const,
      expectedField: null,
      patientName: "Akarshit",
      patientPhone: "8700879404",
      reason: "Headache",
      preferredDate: BOOKED_DATE,
      preferredTime: "16:00",
      history: [],
    }
  }

  it("TEST 1: 4 PM available → confirm → appointment created", async () => {
    const { prisma } = await import("../src/lib/db")
    const { bookAppointmentFromDraft } = await import("../src/lib/appointment/booking")
    ;(prisma.appointment.findFirst as any).mockResolvedValue(null)
    ;(prisma.appointment.findMany as any).mockResolvedValue([])
    // Verify-write re-reads the created row.
    ;(prisma.appointment.findUnique as any).mockResolvedValue({ id: "appt-1" })
    const result = await bookAppointmentFromDraft({
      clinicId: "clinic-1",
      draft: readyDraft(),
      whatsappPhone: "8700879404",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.duplicate).toBe(false)
  })

  it("TEST 2: 4 PM occupied → 2 PM can still be booked", async () => {
    const { prisma } = await import("../src/lib/db")
    const { bookAppointmentFromDraft } = await import("../src/lib/appointment/booking")
    // One real booking at 16:00 exists (different patient — not a duplicate).
    ;(prisma.appointment.findMany as any).mockResolvedValue([bookedRow("16:00")])
    ;(prisma.appointment.findFirst as any).mockResolvedValue(null)
    ;(prisma.appointment.findUnique as any).mockResolvedValue({ id: "appt-1" })

    const taken = await bookAppointmentFromDraft({
      clinicId: "clinic-1",
      draft: readyDraft(),
      whatsappPhone: "8700879404",
    })
    expect(taken.ok).toBe(false)
    if (taken.ok) return
    expect(taken.reason).toBe("slot_taken")

    const free = await bookAppointmentFromDraft({
      clinicId: "clinic-1",
      draft: { ...readyDraft(), preferredTime: "14:00" },
      whatsappPhone: "8700879404",
    })
    expect(free.ok).toBe(true)
    if (!free.ok) return
    expect(free.duplicate).toBe(false)
  })

  it("genuine conflict never reports 'unverifiable' and vice versa", async () => {
    const { prisma } = await import("../src/lib/db")
    const { bookAppointmentFromDraft } = await import("../src/lib/appointment/booking")
    ;(prisma.appointment.findMany as any).mockResolvedValue([bookedRow("16:00")])
    ;(prisma.appointment.findFirst as any).mockResolvedValue(null)
    const result = await bookAppointmentFromDraft({
      clinicId: "clinic-1",
      draft: readyDraft(),
      whatsappPhone: "8700879404",
    })
    // A real conflicting row exists → honest slot_taken (not a crash path).
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("slot_taken")
  })
})

describe("Bug 2/TEST 6: delegated time choice finds a real slot", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function ctxWithReadyDraft() {
    return {
      message: {
        platform: "whatsapp",
        channelId: "15559876543",
        sourceMessageId: "wamid-9",
        from: { id: "15559876543", name: "Akarshit", phone: "15559876543" },
        content: "so take according to yourself",
        timestamp: new Date(),
      },
      clinicId: "clinic-1",
      clinic: { id: "clinic-1", name: "Demo Clinic", timezone: TZ },
      conversation: {
        id: "conv-1",
        clinicId: "clinic-1",
        metadata: JSON.stringify({
          appointmentDraft: {
            active: true,
            status: "ready",
            expectedField: null,
            patientName: "Akarshit",
            patientPhone: "15559876543",
            reason: "Headache",
            preferredDate: BOOKED_DATE,
            preferredTime: "16:00",
            history: [],
          },
        }),
      } as any,
      patientId: "pat-1",
      knowledge: [],
      faqs: [],
      isEmergency: false,
    }
  }

  it("TEST 6: picks the nearest real slot and asks to confirm", async () => {
    const { prisma } = await import("../src/lib/db")
    const { runAiReceptionist } = await import("../src/messaging/ai/receptionist")
    // 16:00 is genuinely occupied; everything else is open (Monday hours 9-17).
    ;(prisma.appointment.findMany as any).mockResolvedValue([bookedRow("16:00")])

    const ctx = ctxWithReadyDraft()
    const result = await runAiReceptionist(ctx, ctx.message as any, [])

    expect(result.responseSource).toBe("APPOINTMENT")
    expect(result.response).toContain("nearest available")
    expect(result.response).toMatch(/confirm/i)
    expect(result.response).not.toContain("not sure I have the exact information")
    // Closest open slot to 16:00 excluding 16:00 → 15:30.
    expect(result.response).toContain("3:30 PM")
    const updateCalls = (prisma.conversation.update as any).mock.calls
    const saved = JSON.parse(updateCalls[updateCalls.length - 1][0].data.metadata).appointmentDraft
    expect(saved.preferredTime).toBe("15:30")
    expect(saved.preferredDate).toBe(BOOKED_DATE)
  })

  it("'what times are available' lists real computed slots", async () => {
    const { runAiReceptionist } = await import("../src/messaging/ai/receptionist")
    const { prisma } = await import("../src/lib/db")
    ;(prisma.appointment.findMany as any).mockResolvedValue([])
    const ctx = ctxWithReadyDraft()
    ;(ctx.message as any).content = "what times are available"

    const result = await runAiReceptionist(ctx, ctx.message as any, [])
    expect(result.responseSource).toBe("APPOINTMENT")
    expect(result.response).toContain("9:00 AM")
    expect(result.response).not.toContain("not sure I have the exact information")
  })
})

describe("Bug 3/TEST 7-11: dashboard API returns frontend-compatible rows", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("TEST 7/8: GET returns array with UI field names", async () => {
    const { prisma } = await import("../src/lib/db")
    ;(prisma.appointment.findMany as any).mockResolvedValue([
      {
        id: "appt-1",
        patientName: "Akarshit",
        phone: "8700879404",
        email: null,
        reason: "Headache",
        preferredDate: "2026-10-05",
        preferredTime: "16:00",
        doctor: "prov-1",
        isEmergency: false,
        status: "confirmed",
        createdAt: new Date("2026-09-09T00:00:00.000Z"),
        patient: null,
      },
    ])
    ;(prisma.user.findMany as any).mockResolvedValue([{ id: "prov-1", name: "Dr. Smith" }])

    const { GET } = await import("../src/app/api/appointments/route")
    const res = await GET(new Request("http://localhost/api/appointments"))
    const body = await res.json()

    expect(Array.isArray(body)).toBe(true)
    const row = body[0]
    // TEST 8: every field the frontend reads is present…
    for (const key of ["id", "patientName", "patientPhone", "date", "time", "reason", "status", "providerName"]) {
      expect(row, `missing dashboard field: ${key}`).toHaveProperty(key)
    }
    // TEST 9/10/11: …with the REAL stored values.
    expect(row.patientName).toBe("Akarshit")
    expect(row.patientPhone).toBe("8700879404")
    expect(row.date).toBe("2026-10-05")
    expect(row.time).toBe("16:00")
    expect(row.reason).toBe("Headache")
    expect(row.status).toBe("confirmed")
    expect(row.providerName).toBe("Dr. Smith")
  })

  it("API failure shape is an object the UI can detect (never a crash)", async () => {
    const { prisma } = await import("../src/lib/db")
    ;(prisma.appointment.findMany as any).mockRejectedValue(new Error("db down"))
    const { GET } = await import("../src/app/api/appointments/route")
    const res = await GET(new Request("http://localhost/api/appointments"))
    const body = await res.json()
    expect(Array.isArray(body)).toBe(false)
    expect(body.error).toBeTruthy()
  })
})

describe("Bug 4/TEST 12-14: no success claims without a verified write", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function readyCtx() {
    return {
      message: {
        platform: "whatsapp",
        channelId: "15559876543",
        sourceMessageId: "wamid-9",
        from: { id: "15559876543", name: "Akarshit", phone: "15559876543" },
        content: "yes",
        timestamp: new Date(),
      },
      clinicId: "clinic-1",
      clinic: { id: "clinic-1", name: "Demo Clinic", timezone: TZ },
      conversation: {
        id: "conv-1",
        clinicId: "clinic-1",
        metadata: JSON.stringify({
          appointmentDraft: {
            active: true,
            status: "ready",
            expectedField: null,
            patientName: "Akarshit",
            patientPhone: "15559876543",
            reason: "Headache",
            preferredDate: BOOKED_DATE,
            preferredTime: "16:00",
            history: [],
          },
        }),
      } as any,
      patientId: "pat-1",
      knowledge: [],
      faqs: [],
      isEmergency: false,
    }
  }

  it("TEST 12/14: DB failure → honest message, never a confirmation", async () => {
    const { prisma } = await import("../src/lib/db")
    const { runAiReceptionist } = await import("../src/messaging/ai/receptionist")
    ;(prisma.appointment.findFirst as any).mockResolvedValue(null)
    ;(prisma.appointment.findMany as any).mockResolvedValue([])
    ;(prisma.$transaction as any).mockRejectedValue(new Error("connection lost"))

    const ctx = readyCtx()
    const result = await runAiReceptionist(ctx, ctx.message as any, [])

    expect(result.response).not.toMatch(/has been confirmed/)
    expect(result.response).not.toContain("{")
    expect(result.requiresClinic).toBe(true)
  })

  it("TEST 13: draft survives DB failure", async () => {
    const { prisma } = await import("../src/lib/db")
    const { runAiReceptionist } = await import("../src/messaging/ai/receptionist")
    ;(prisma.appointment.findFirst as any).mockResolvedValue(null)
    ;(prisma.appointment.findMany as any).mockResolvedValue([])
    ;(prisma.$transaction as any).mockRejectedValue(new Error("connection lost"))

    const ctx = readyCtx()
    await runAiReceptionist(ctx, ctx.message as any, [])

    // No metadata write clears the draft on the failure path: the only
    // conversation.update calls (if any) must keep an ACTIVE draft.
    const updateCalls = (prisma.conversation.update as any).mock.calls
    for (const [args] of updateCalls) {
      const metadata = args.data.metadata as string | undefined
      if (metadata && metadata.includes("appointmentDraft")) {
        expect(JSON.parse(metadata).appointmentDraft.active).toBe(true)
      }
    }
  })
})
