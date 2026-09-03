/**
 * Production conversation replay test.
 *
 * Mirrors the EXACT WhatsApp conversation from the production bug
 * report and asserts the routing decision for every turn. This
 * test is the single most important regression test for the
 * production symptom → appointment misrouting bug.
 *
 * Conversation:
 *   1. "Hello"                    → GENERAL greeting
 *   2. "I have headache..."        → MEDICAL_SYMPTOM (NOT appointment)
 *   3. "So bro what I need..."     → CLINIC_INFORMATION (NOT appointment)
 *   4. "I want to book..."         → APPOINTMENT_START
 *   5. "Akarshit Rajput"          → APPOINTMENT_SLOT_ANSWER (name)
 *   6. "I have a headache"         → APPOINTMENT_SLOT_ANSWER (reason)
 *   7. "Where is the clinic?"      → APPOINTMENT_INTERRUPTION (preserves draft)
 *   8. "Tomorrow at 4 PM"         → APPOINTMENT_SLOT_ANSWER (date+time)
 */

import { describe, it, expect } from "vitest"
import {
  processSlotAnswer,
  readDraftFromMetadata,
  writeDraftToMetadata,
  createFreshDraft,
  type AppointmentDraft,
} from "../src/messaging/ai/appointment-state"
import { classifyRoute } from "../src/messaging/ai/route-classifier"

const FROM = { id: "15550001111", phone: "15550001111", name: "Akarshit" }

function step(label: string, message: string, draft: AppointmentDraft | null): AppointmentDraft | null {
  const decision = classifyRoute(message, draft)
  console.log(
    `[replay] ${label}: "${message}"\n` +
    `        → route=${decision.route} reason=${decision.reason}\n` +
    `        → expectedField=${decision.expectedField}`,
  )
  switch (decision.route) {
    case "APPOINTMENT_START": {
      const fresh = createFreshDraft()
      return fresh
    }
    case "APPOINTMENT_SLOT_ANSWER": {
      if (!draft) throw new Error("SLOT_ANSWER without draft")
      return processSlotAnswer(draft, message, FROM).draft
    }
    // All interruption-style routes preserve the draft.
    case "APPOINTMENT_INTERRUPTION":
    case "MEDICAL_SYMPTOM":
    case "CLINIC_INFORMATION":
    case "INSURANCE":
    case "GENERAL":
    case "CANCEL_INTENT":
    case "RESCHEDULE_INTENT":
    case "EMERGENCY":
      return draft
    default:
      throw new Error(`Unknown route: ${decision.route}`)
  }
}

describe("Production conversation replay", () => {
  it("replays the exact production failure conversation correctly", () => {
    let draft: AppointmentDraft | null = null

    // Turn 1: greeting
    draft = step("T1", "Hello", draft)
    expect(draft).toBeNull()

    // Turn 2: symptom — must NOT activate
    draft = step("T2", "I have headache so much not too much", draft)
    expect(draft).toBeNull()

    // Turn 3: clinic location — must NOT activate
    draft = step("T3", "So bro what I need to do where is clinic", draft)
    expect(draft).toBeNull()

    // Turn 4: explicit booking — must activate
    draft = step("T4", "I want to book an appointment", draft)
    expect(draft).not.toBeNull()
    expect(draft!.active).toBe(true)
    expect(draft!.expectedField).toBe("name")

    // Turn 5: name
    draft = step("T5", "Akarshit Rajput", draft)
    expect(draft!.patientName).toBe("Akarshit Rajput")
    // Phone is auto-filled from the WhatsApp sender, so the
    // expectedField advances past "phone" straight to "reason".
    expect(draft!.patientPhone).toBe("15550001111")
    expect(draft!.expectedField).toBe("reason")

    // Turn 6: reason (the symptom now means "reason for visit")
    draft = step("T6", "I have a headache", draft)
    expect(draft!.reason?.toLowerCase()).toContain("headache")
    expect(draft!.expectedField).toBe("date")

    // Turn 7: interruption — clinic location, draft PRESERVED
    const draftBeforeInterruption = JSON.parse(JSON.stringify(draft))
    draft = step("T7", "Where is the clinic?", draft)
    expect(draft).not.toBeNull()
    expect(draft!.active).toBe(true)
    expect(draft!.patientName).toBe(draftBeforeInterruption.patientName)
    expect(draft!.expectedField).toBe(draftBeforeInterruption.expectedField)
    expect(draft!.reason).toBe(draftBeforeInterruption.reason)

    // Turn 8: date + time
    draft = step("T8", "Tomorrow at 4 PM", draft)
    expect(draft!.preferredDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(draft!.preferredTime).toBe("16:00")
    expect(draft!.expectedField).toBeNull()
  })
})
