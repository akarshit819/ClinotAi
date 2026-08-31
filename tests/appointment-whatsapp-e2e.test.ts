import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { detectIntent } from "@/messaging/ai/intent"
import { APPOINTMENT_TOOLS } from "@/lib/appointment/tools"
import { processJob } from "@/lib/jobs/worker"
import { createJob, getJob } from "@/lib/jobs/queue"
import { evaluateMessagingPolicy } from "@/lib/messaging/policy"

// Mock Prisma
vi.mock("@/lib/db", () => {
  const mockTx = {
    clinic: {
      findUnique: vi.fn().mockResolvedValue({ timezone: "America/New_York" }),
    },
    appointment: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((args) =>
        Promise.resolve({
          id: "appt-123",
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      ),
    },
  }

  const mockPrisma = {
    $transaction: vi.fn().mockImplementation(async (callback) => {
      return callback(mockTx)
    }),
    clinic: {
      findUnique: vi.fn().mockResolvedValue({
        id: "clinic-1",
        name: "Smile Dental",
        openingHours: JSON.stringify([
          { dayOfWeek: 1, openTime: "09:00", closeTime: "17:00", isClosed: false },
          { dayOfWeek: 2, openTime: "09:00", closeTime: "17:00", isClosed: false },
          { dayOfWeek: 3, openTime: "09:00", closeTime: "17:00", isClosed: false },
          { dayOfWeek: 4, openTime: "09:00", closeTime: "17:00", isClosed: false },
          { dayOfWeek: 5, openTime: "09:00", closeTime: "17:00", isClosed: false },
          { dayOfWeek: 6, openTime: "09:00", closeTime: "13:00", isClosed: true },
          { dayOfWeek: 0, openTime: "09:00", closeTime: "13:00", isClosed: true },
        ]),
        timezone: "America/New_York",
        phone: "+15551234567",
        emergencyPhone: "+15559999999",
        isOnboarded: true,
        useClinotAi: true,
        aiProvider: "openai",
      }),
      findMany: vi.fn().mockResolvedValue([{ id: "clinic-1" }]),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "prov-1",
          name: "Dr. Smith",
          role: { name: "owner" },
          isActive: true,
        },
      ]),
    },
    patient: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((args) =>
        Promise.resolve({
          id: "pat-new-999",
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      ),
    },
    appointment: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((args) =>
        Promise.resolve({
          id: "appt-123",
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      ),
      update: vi.fn().mockImplementation((args) =>
        Promise.resolve({
          id: args.where.id,
          ...args.data,
        })
      ),
    },
    knowledgeBase: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    fAQ: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    conversation: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "conv-1",
        clinicId: "clinic-1",
        platform: "whatsapp",
        channelId: "15559876543",
        status: "active",
        isEmergency: false,
        unreadCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    conversationMessage: {
      create: vi.fn().mockResolvedValue({ id: "msg-db-1" }),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([
        { role: "user", content: "I want to book an appointment" },
        { role: "assistant", content: "I'd be happy to help! What is your name and preferred time?" },
      ]),
    },
    whatsAppPhoneNumber: {
      findFirst: vi.fn().mockResolvedValue({
        phoneNumberId: "phone-num-id-1",
        clinicId: "clinic-1",
        lastMessageAt: new Date(),
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    job: {
      create: vi.fn().mockImplementation((args) =>
        Promise.resolve({
          id: "job-" + Math.random().toString(36).substring(7),
          ...args.data,
          status: "PENDING",
          attempts: 0,
        })
      ),
      findUnique: vi.fn().mockImplementation((args) =>
        Promise.resolve({
          id: args.where.id,
          status: "PENDING",
          maxAttempts: 3,
          attempts: 0,
          payload: {
            clinicId: "clinic-1",
            to: "15559876543",
            payload: { text: { body: "Hello" } },
          },
        })
      ),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation((args) =>
        Promise.resolve({
          id: args.where.id,
          ...args.data,
        })
      ),
    },
    subscription: {
      findFirst: vi.fn().mockResolvedValue({
        status: "active",
        plan: { name: "Pro" },
      }),
    },
  }

  return { prisma: mockPrisma }
})

// Mock token store
vi.mock("@/integrations/token-store", () => ({
  getCredentials: vi.fn().mockResolvedValue({
    accessToken: "mock-token-xyz",
    metadata: {
      phoneNumberId: "phone-num-id-1",
      wabaId: "waba-1",
      businessId: "biz-1",
    },
  }),
}))

// Mock billing
vi.mock("@/lib/billing", () => ({
  canProcessMessaging: vi.fn().mockResolvedValue({ allowed: true }),
}))

describe("WhatsApp + Appointment Flow End-to-End Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================================
  // TEST A: Intent Detection
  // ============================================================
  describe("TEST A & F: Intent Detection for Appointment vs Normal messages", () => {
    it("detects appointment intent for 'I want to book an appointment'", () => {
      const result = detectIntent("I want to book an appointment")
      expect(result.intent).toBe("appointment")
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    })

    it("detects appointment intent for 'When is Dr. Smith available for a visit?'", () => {
      const result = detectIntent("When is Dr. Smith available for a visit?")
      expect(result.intent).toBe("appointment")
    })

    it("detects general/medical intent for normal message 'I have a headache'", () => {
      const result = detectIntent("I have a headache")
      expect(result.intent).not.toBe("appointment")
      expect(result.intent).toBe("general_question")
    })

    it("detects emergency intent for severe symptoms", () => {
      const result = detectIntent("Severe pain and bleeding heavily")
      expect(result.intent).toBe("emergency")
    })
  })

  // ============================================================
  // TEST B & C: Appointment Tool Validation & Execution
  // ============================================================
  describe("TEST B, C, D: book_appointment Tool Validation & Auto Patient Resolution", () => {
    it("fails with descriptive error when required fields are missing", async () => {
      const tool = APPOINTMENT_TOOLS.book_appointment
      const result = await tool.execute({
        clinicId: "clinic-1",
        // missing providerId, startTime, endTime, reason, patientName, phone
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Missing required fields")
    })

    it("succeeds when all fields provided, auto-creating patient record if patientId is omitted", async () => {
      const tool = APPOINTMENT_TOOLS.book_appointment
      const result = await tool.execute({
        clinicId: "clinic-1",
        providerId: "prov-1",
        providerName: "Dr. Smith",
        startTime: "2026-09-01T10:00:00.000Z",
        endTime: "2026-09-01T10:30:00.000Z",
        reason: "Routine dental checkup",
        patientName: "Jane Doe",
        phone: "+15559876543",
        // patientId is intentionally omitted
      })

      expect(result.success).toBe(true)
      expect(result.appointmentId).toBe("appt-123")
      expect(result.confirmation).toContain("Appointment confirmed")
    })
  })

  // ============================================================
  // TEST E: Slot Availability & Conflict Check
  // ============================================================
  describe("TEST E: Slot Availability & Double-Booking Protection", () => {
    it("check_slot_availability tool returns availability status", async () => {
      const tool = APPOINTMENT_TOOLS.check_slot_availability
      const result = await tool.execute({
        clinicId: "clinic-1",
        providerId: "prov-1",
        startTime: "2026-09-01T10:00:00.000Z",
        endTime: "2026-09-01T10:30:00.000Z",
      })

      expect(result).toHaveProperty("available")
      expect(typeof result.available).toBe("boolean")
    })

    it("find_available_slots returns list of available time slots", async () => {
      const tool = APPOINTMENT_TOOLS.find_available_slots
      const result = await tool.execute({
        clinicId: "clinic-1",
        startDate: "2026-09-01",
        endDate: "2026-09-02",
        providerId: "prov-1",
      })

      expect(result).toHaveProperty("slots")
      expect(Array.isArray(result.slots)).toBe(true)
    })
  })

  // ============================================================
  // TEST G: Messaging Policy & 24h Window
  // ============================================================
  describe("TEST G: WhatsApp Messaging Policy Evaluation", () => {
    it("allows freeform message when within 24h customer service window", async () => {
      const decision = await evaluateMessagingPolicy({
        clinicId: "clinic-1",
        phoneNumberId: "phone-num-id-1",
        platform: "whatsapp",
        messageType: "freeform",
      })

      expect(decision.allowed).toBe(true)
      if (decision.allowed) {
        expect(decision.type).toBe("freeform")
      }
    })
  })

  // ============================================================
  // Worker Job Pipeline Integration
  // ============================================================
  describe("Worker Job Processing: PROCESS_INBOUND_MESSAGE & SEND_WHATSAPP_MESSAGE", () => {
    it("worker executes SEND_WHATSAPP_MESSAGE job and calls delivery API", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ messages: [{ id: "wamid.HBgL..." }] }),
      })
      vi.stubGlobal("fetch", fetchMock)

      const sendJob = {
        id: "job-send-1",
        clinicId: "clinic-1",
        type: "SEND_WHATSAPP_MESSAGE",
        payload: {
          clinicId: "clinic-1",
          to: "15559876543",
          payload: {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: "15559876543",
            type: "text",
            text: { body: "Your appointment is confirmed for Sept 1 at 10:00 AM." },
          },
          phoneNumberId: "phone-num-id-1",
        },
      }

      await expect(processJob(sendJob)).resolves.not.toThrow()
      expect(fetchMock).toHaveBeenCalled()

      vi.unstubAllGlobals()
    })

    it("worker fails and throws on WhatsApp delivery failure so job can be retried", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { message: "Invalid phone number" } }),
      })
      vi.stubGlobal("fetch", fetchMock)

      const sendJob = {
        id: "job-send-fail",
        clinicId: "clinic-1",
        type: "SEND_WHATSAPP_MESSAGE",
        payload: {
          clinicId: "clinic-1",
          to: "15559876543",
          payload: {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: "15559876543",
            type: "text",
            text: { body: "Hello" },
          },
          phoneNumberId: "phone-num-id-1",
        },
      }

      await expect(processJob(sendJob)).rejects.toThrow("WhatsApp API send failed")

      vi.unstubAllGlobals()
    })
  })
})
