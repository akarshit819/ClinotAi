import { describe, it, expect, vi } from "vitest"
import { validateInput } from "../src/lib/ai/guardrails"
import { classifyRoute } from "../src/messaging/ai/route-classifier"
import {
  createFreshDraft,
  processSlotAnswer,
  clearDraft,
  extractAllFields,
} from "../src/messaging/ai/appointment-state"

describe("Clinot Receptionist Conversation Quality & Routing Tests", () => {
  // Test 1: Greeting
  it("Test 1: 'hello' routes to GENERAL without activating appointment draft", () => {
    const decision = classifyRoute("hello", null)
    expect(decision.route).toBe("GENERAL")
    expect(decision.reason).toBe("greeting_keyword")
  })

  // Test 2: Medical symptom alone
  it("Test 2: 'i have back pain for two days' routes to MEDICAL_SYMPTOM, never starts booking automatically", () => {
    const decision = classifyRoute("i have back pain for two days", null)
    expect(decision.route).toBe("MEDICAL_SYMPTOM")
    expect(decision.reason).toBe("symptom_keyword")
  })

  // Test 3: Multiple symptoms
  it("Test 3: 'i have headache and back pain' routes to MEDICAL_SYMPTOM", () => {
    const decision = classifyRoute("i have headache and back pain", null)
    expect(decision.route).toBe("MEDICAL_SYMPTOM")
  })

  // Test 4: Explicit appointment booking intent
  it("Test 4: 'i want to book appointment' routes to APPOINTMENT_START", () => {
    const decision = classifyRoute("i want to book appointment", null)
    expect(decision.route).toBe("APPOINTMENT_START")
    expect(decision.reason).toBe("explicit_appointment_intent")
  })

  // Test 5: The production bug case: composite slot answer with comma-separated fields
  it("Test 5: 'akarshit,8700879401,back pain' routes to APPOINTMENT_SLOT_ANSWER and extracts all 3 fields", () => {
    const draft = createFreshDraft()
    expect(draft.active).toBe(true)
    expect(draft.expectedField).toBe("name")

    const decision = classifyRoute("akarshit,8700879401,back pain", draft)
    expect(decision.route).toBe("APPOINTMENT_SLOT_ANSWER")

    const turn = processSlotAnswer(
      draft,
      "akarshit,8700879401,back pain",
      { id: "123", phone: "1234567890" }
    )

    expect(turn.draft.patientName).toBe("Akarshit")
    expect(turn.draft.patientPhone).toBe("8700879401")
    expect(turn.draft.reason).toBe("back pain")
    expect(turn.draft.expectedField).toBe("date")
  })

  // Test 6: Guardrail: patient emails must NOT be blocked as spam
  it("Test 6: Guardrail allows patient email address without spam false positive", () => {
    const res = validateInput("my email is patient@gmail.com")
    expect(res.passed).toBe(true)
    expect(res.action).not.toBe("spam")
  })

  // Test 7: Guardrail: phone number in message must NOT be blocked as spam
  it("Test 7: Guardrail allows phone numbers without spam false positive", () => {
    const res = validateInput("my phone is 8700879401")
    expect(res.passed).toBe(true)
    expect(res.action).not.toBe("spam")

    const res2 = validateInput("akarshit,8700879401,back pain")
    expect(res2.passed).toBe(true)
    expect(res2.action).not.toBe("spam")
  })

  // Test 8: Guardrail: all-caps messages must NOT be blocked as abuse
  it("Test 8: Guardrail allows uppercase messages without abuse false positive", () => {
    const res = validateInput("I NEED AN APPOINTMENT TOMORROW")
    expect(res.passed).toBe(true)
    expect(res.action).not.toBe("abuse")
  })

  // Test 9: Guardrail: true abuse is still blocked
  it("Test 9: Guardrail still blocks genuine abuse", () => {
    const res = validateInput("fuck this stupid app")
    expect(res.passed).toBe(false)
    expect(res.action).toBe("abuse")
  })

  // Test 9b: PRODUCTION TRANSCRIPT REGRESSION — "What is you" was
  // hard-rejected by the old gibberish heuristic (any 8+ letter text
  // with >80% unique letters scored 0.8) and never reached the AI.
  // "What are you" — a core receptionist question — was equally
  // blocked. Natural short messages MUST reach the AI.
  it("Test 9b: natural short messages pass guardrails and reach the AI", () => {
    for (const msg of ["What is you", "What are you", "hi", "hello", "How much?", "help"]) {
      const res = validateInput(msg)
      expect(res.passed, `"${msg}" must pass guardrails (got ${res.action})`).toBe(true)
    }
  })

  it("Test 9c: gibberish detection is deterministic and still catches real mash", () => {
    // Real keyboard mash / garbage is still rejected.
    expect(validateInput("aaaaaaaa").action).toBe("invalid")
    expect(validateInput("xkcdtzvqm").action).toBe("invalid")
    // Determinism: same input, same result, every time.
    for (let i = 0; i < 10; i++) {
      expect(validateInput("What is you").action).toBe("allow")
      expect(validateInput("aaaaaaaa").action).toBe("invalid")
    }
  })

  // Test 9d: the symptom-aware fallback guarantees a USEFUL response
  // when the AI provider is unavailable — never the generic
  // "I'm not sure I have the exact information" reply.
  it("Test 9d: symptom messages get an intentional symptom fallback, not the generic one", async () => {
    const { generateFallbackResponse } = await import("../src/lib/ai/fallback")
    const { prisma } = await import("../src/lib/db")
    const clinicSpy = vi.spyOn(prisma.clinic, "findUnique").mockResolvedValue({
      id: "clinic-1",
      name: "Demo Clinic",
      phone: "+15550000000",
      emergencyPhone: "+15559999999",
      address: "1 Clinic Road",
      openingHours: "Mon-Fri 9-5",
    } as any)
    const kbSpy = vi.spyOn(prisma.knowledgeBase, "findMany").mockResolvedValue([] as any)
    const faqSpy = vi.spyOn(prisma.fAQ, "findMany").mockResolvedValue([] as any)

    try {
      for (const msg of ["I have knee pain", "my tooth hurts", "I feel sick", "I have back pain for two days"]) {
        const response = await generateFallbackResponse({ userMessage: msg, clinicId: "clinic-1" })
        expect(response, '"' + msg + '" must not get the generic fallback').not.toContain("not sure I have the exact information")
        expect(response).toContain("book an appointment")
        expect(response).toContain("can't give medical advice")
      }
    } finally {
      clinicSpy.mockRestore()
      kbSpy.mockRestore()
      faqSpy.mockRestore()
    }
  })

  // Test 10: Flow cancellation during active draft
  it("Test 10: 'never mind' cancels active draft with flow_cancel reason", () => {
    const draft = createFreshDraft()
    const decision = classifyRoute("never mind", draft)
    expect(decision.reason).toBe("flow_cancel")

    const cleared = clearDraft("user_cancelled")
    expect(cleared.active).toBe(false)
    expect(cleared.clearedReason).toBe("user_cancelled")
  })

  // Test 11: Interruption preserves draft
  it("Test 11: Side question during active booking is classified as interruption, preserving draft", () => {
    const draft = createFreshDraft()
    draft.patientName = "Akarshit Rajput"
    draft.patientPhone = "8700879401"
    draft.expectedField = "reason"

    const decision = classifyRoute("Where is your clinic located?", draft)
    expect(decision.route).toBe("CLINIC_INFORMATION")
    expect(decision.reason).toBe("interruption_while_draft_active")
    expect(draft.patientName).toBe("Akarshit Rajput")
    expect(draft.patientPhone).toBe("8700879401")
    expect(draft.expectedField).toBe("reason")
  })

  // Test 12: Multi-field extraction helper
  it("Test 12: extractAllFields correctly extracts name, phone, date, time, and reason from composite text", () => {
    const extracted = extractAllFields("John Doe, 555-123-4567, root canal, tomorrow at 3pm")
    expect(extracted.name).toBe("John Doe")
    expect(extracted.phone).toBe("5551234567")
    expect(extracted.preferredTime).toBe("15:00")
    expect(extracted.preferredDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("Guardrail determinism regression (stateful /g regex bug)", () => {
  // The booking prompt the receptionist sends to the AI contains the
  // word "folloWINg". The old prize-spam pattern /(free|win|...)/gi had
  // NO word boundaries, so "following" matched as spam and the AI
  // booking call was rejected by our own guardrails. The /g flag also
  // made regexes STATEFUL (lastIndex persists across .test() calls),
  // so detection depended on how many messages had been validated
  // before — the same text could pass and fail nondeterministically.
  const bookingPrompt = [
    "The patient has confirmed the following booking details. Please call book_appointment now with these exact values; do NOT ask any more questions.",
    "Name: Akarshit",
    "Phone: 870087940",
    "Reason: Pain",
    "Preferred date: 2026-09-06",
    "Preferred time: 16:00",
  ].join("\n")

  it("booking prompt containing 'following' is NOT spam", () => {
    const r = validateInput(bookingPrompt)
    expect(r.action).not.toBe("spam")
    expect(r.passed).toBe(true)
  })

  it("spam detection is deterministic across repeated calls (same input, same result)", () => {
    for (let i = 0; i < 10; i++) {
      expect(validateInput(bookingPrompt).action).not.toBe("spam")
      expect(validateInput("click here now to win a free prize").action).toBe("spam")
      expect(validateInput(bookingPrompt).action).not.toBe("spam")
    }
  })

  it("genuine spam is still blocked after adding word boundaries", () => {
    // Blocked = !passed (action may be "spam" or "invalid" depending on
    // which guard fires first — the contract is that it is blocked).
    expect(validateInput("click here now").passed).toBe(false)
    expect(validateInput("win a free cash prize").action).toBe("spam")
    expect(validateInput("visit https://spam.example.com now").action).toBe("spam")
    expect(validateInput("free lottery jackpot winner").action).toBe("spam")
    expect(validateInput("This is great!!!!").action).toBe("spam")
  })

  it("words that merely CONTAIN spam substrings are not blocked", () => {
    expect(validateInput("The doctor is following up on my treatment").passed).toBe(true)
    expect(validateInput("I need a window appointment on Monday").passed).toBe(true)
    expect(validateInput("Can I sell my old glasses at the clinic?").passed).toBe(true)
  })
})
