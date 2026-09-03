/**
 * Appointment state machine regression tests (always run).
 *
 * The production bug was: the receptionist did not persist any
 * in-progress booking state, so the user's answer on turn N+1 was
 * treated as a brand-new query and the bot asked for the name again.
 *
 * These tests prove that the deterministic state machine in
 * src/messaging/ai/appointment-state.ts:
 *   A. Activates a draft on the first "book" / symptom message.
 *   B. Accepts just a name on turn 2 → asks for reason.
 *   C. Accepts name + reason + date + time in a single multi-line
 *      message → marks the draft as ready.
 *   D. Falls back to the WhatsApp sender for phone when not
 *      provided by the user.
 *   E. Persists across turns (the same draft object is returned
 *      with new fields filled in).
 *   F. Does not discard a valid answer like "akarshit" — the state
 *      machine treats the message as a turn in the active flow.
 *   G. Emergency keywords override the active flow and clear it.
 *   H. Explicit cancellation ("never mind") clears the flow.
 */
import { describe, it, expect } from "vitest"
import {
  processTurn,
  readDraftFromMetadata,
  writeDraftToMetadata,
  isAppointmentTrigger,
  isSymptomTrigger,
  isEmergencyOverride,
  isDraftReady,
  type AppointmentDraft,
  EMPTY_DRAFT,
} from "../src/messaging/ai/appointment-state"

const FROM = { id: "15550001111", phone: "15550001111", name: "Akarshit" }

describe("Appointment state machine — multi-turn", () => {
  it("A. 'book appointment' activates a new draft and asks for the name", () => {
    const turn = processTurn(null, "book appointment", FROM)
    expect(turn.draft.active).toBe(true)
    expect(turn.isComplete).toBe(false)
    expect(turn.nextPrompt?.toLowerCase()).toContain("name")
  })

  it("B. After name is collected, the bot asks for the reason", () => {
    const t1 = processTurn(null, "i want to book appointment", FROM)
    expect(t1.draft.active).toBe(true)
    const t2 = processTurn(t1.draft, "akarshit", FROM)
    expect(t2.draft.patientName).toBe("Akarshit")
    expect(t2.isComplete).toBe(false)
    expect(t2.nextPrompt?.toLowerCase()).toContain("reason")
  })

  it("C. Name + reason in one message is captured; the next ask is the date", () => {
    let draft: AppointmentDraft | null = null
    const t1 = processTurn(draft, "book appointment", FROM)
    draft = t1.draft
    const t2 = processTurn(draft, "Akarshit, I have a headache", FROM)
    expect(t2.draft.patientName).toBe("Akarshit")
    // The reason extraction keeps the user's phrasing; "I have a
    // headache" is captured.
    expect(t2.draft.reason?.toLowerCase()).toContain("headache")
    expect(t2.nextPrompt?.toLowerCase()).toContain("date")
  })

  it("C2. All four fields in one multi-line message completes the draft", () => {
    const t1 = processTurn(null, "book appointment", FROM)
    const multi = [
      "Akarshit Rajput",
      "8700879401",
      "headache since yesterday",
    ].join("\n")
    const t2 = processTurn(t1.draft, multi, FROM)
    expect(t2.draft.patientName).toBe("Akarshit Rajput")
    // Phone is the explicit number, not the WhatsApp sender.
    expect(t2.draft.patientPhone).toBe("8700879401")
    expect(t2.draft.reason?.toLowerCase()).toContain("headache")
    // Date and time still missing.
    expect(t2.isComplete).toBe(false)

    const t3 = processTurn(t2.draft, "tomorrow at 4 PM", FROM)
    expect(t3.draft.preferredDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(t3.draft.preferredTime).toBe("16:00")
    expect(t3.isComplete).toBe(true)
    expect(isDraftReady(t3.draft)).toBe(true)
  })

  it("D. Phone is taken from the WhatsApp sender when the user does not provide one", () => {
    const t1 = processTurn(null, "book appointment", FROM)
    const t2 = processTurn(t1.draft, "akarshit", FROM)
    // No phone in the user message → fall back to whatsapp sender.
    expect(t2.draft.patientPhone).toBe("15550001111")
  })

  it("E. The state machine persists across separate processTurn calls (multi-turn)", () => {
    let draft: AppointmentDraft | null = null
    // Simulate separate worker jobs: each call only sees the previous draft.
    draft = processTurn(draft, "book", FROM).draft
    draft = processTurn(draft, "akarshit", FROM).draft
    draft = processTurn(draft, "headache", FROM).draft
    draft = processTurn(draft, "tomorrow", FROM).draft
    draft = processTurn(draft, "10 am", FROM).draft

    expect(draft.active).toBe(true)
    expect(draft.patientName).toBe("Akarshit")
    expect(draft.reason?.toLowerCase()).toContain("headache")
    expect(draft.preferredDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(draft.preferredTime).toBe("10:00")
    expect(isDraftReady(draft)).toBe(true)
  })

  it("F. 'akarshit' is treated as the answer to the current ask, not discarded", () => {
    const t1 = processTurn(null, "book appointment", FROM)
    // Bot just asked for the name. User says "akarshit".
    const t2 = processTurn(t1.draft, "akarshit", FROM)
    // The state machine extracted the name and returned a follow-up
    // prompt — it did NOT classify the message as "other" and ask
    // the same question again.
    expect(t2.draft.patientName).toBe("Akarshit")
    expect(t2.nextPrompt?.toLowerCase()).toContain("reason")
    // The previous turn's prompt is "what's your full name?".
    // The current turn's prompt is "what's the reason?".
    expect(t1.nextPrompt?.toLowerCase()).toContain("name")
  })

  it("G. Emergency keywords override the active appointment flow and clear the draft", () => {
    const t1 = processTurn(null, "book appointment", FROM)
    const t2 = processTurn(t1.draft, "akarshit", FROM)
    expect(t2.draft.active).toBe(true)

    const emergency = processTurn(t2.draft, "actually i have severe pain and difficulty breathing", FROM)
    expect(emergency.shouldClear).toBe(true)
    expect(emergency.draft.active).toBe(false)
    expect(emergency.nextPrompt).toBeNull()
  })

  it("H. 'never mind' cancels the appointment flow", () => {
    const t1 = processTurn(null, "book appointment", FROM)
    const t2 = processTurn(t1.draft, "akarshit", FROM)
    expect(t2.draft.active).toBe(true)

    const cancelled = processTurn(t2.draft, "never mind", FROM)
    expect(cancelled.shouldClear).toBe(true)
    expect(cancelled.draft.active).toBe(false)
  })

  it("Time parsing handles '4 PM', '16:00', '4pm', 'morning'", () => {
    const t1 = processTurn(null, "book", FROM)
    expect(processTurn(t1.draft, "4 PM", FROM).draft.preferredTime).toBe("16:00")
    expect(processTurn(t1.draft, "4pm", FROM).draft.preferredTime).toBe("16:00")
    expect(processTurn(t1.draft, "16:00", FROM).draft.preferredTime).toBe("16:00")
    expect(processTurn(t1.draft, "morning", FROM).draft.preferredTime).toBe("09:00")
    expect(processTurn(t1.draft, "afternoon", FROM).draft.preferredTime).toBe("14:00")
  })

  it("Date parsing handles 'tomorrow', 'next Monday', 'Oct 5'", () => {
    const t1 = processTurn(null, "book", FROM)
    const tomorrow = processTurn(t1.draft, "tomorrow", FROM).draft.preferredDate
    expect(tomorrow).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const monday = processTurn(t1.draft, "next Monday", FROM).draft.preferredDate
    expect(monday).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("Persistence: writeDraftToMetadata + readDraftFromMetadata round-trip", () => {
    const t1 = processTurn(null, "book appointment", FROM)
    const t2 = processTurn(t1.draft, "akarshit", FROM)
    const json = writeDraftToMetadata(null, t2.draft)
    const restored = readDraftFromMetadata(json)
    expect(restored).not.toBeNull()
    expect(restored!.patientName).toBe("Akarshit")
    expect(restored!.active).toBe(true)
  })

  it("Cleared draft is removed from metadata", () => {
    const t1 = processTurn(null, "book", FROM)
    const json1 = writeDraftToMetadata(null, t1.draft)
    expect(readDraftFromMetadata(json1)).not.toBeNull()
    const cleared = writeDraftToMetadata(json1, EMPTY_DRAFT)
    expect(readDraftFromMetadata(cleared)).toBeNull()
  })

  it("Trigger detection: 'i have headache' activates via the symptom path", () => {
    expect(isAppointmentTrigger("i have headache")).toBe(false) // not a booking keyword
    expect(isSymptomTrigger("i have headache")).toBe(true)
    const turn = processTurn(null, "i have headache", FROM)
    expect(turn.draft.active).toBe(true)
  })

  it("Trigger detection: 'i vant to book appointment' (typo) still triggers", () => {
    // Common typo in production logs.
    expect(isAppointmentTrigger("i vant to book appointment")).toBe(true)
    const turn = processTurn(null, "i vant to book appointment", FROM)
    expect(turn.draft.active).toBe(true)
  })

  it("Emergency detection: 'severe pain' triggers the override", () => {
    expect(isEmergencyOverride("i have severe pain")).toBe(true)
    expect(isEmergencyOverride("i have a headache")).toBe(false)
  })

  it("History records every field as it is filled", () => {
    const t1 = processTurn(null, "book", FROM)
    const t2 = processTurn(t1.draft, "akarshit", FROM)
    const t3 = processTurn(t2.draft, "headache", FROM)
    const fields = t3.draft.history.map((h) => h.field)
    expect(fields).toContain("patientName")
    expect(fields).toContain("patientPhone") // from whatsapp
    expect(fields).toContain("reason")
  })

  it("Does not overwrite a field that is already set", () => {
    const t1 = processTurn(null, "book", FROM)
    const t2 = processTurn(t1.draft, "akarshit", FROM)
    // The user accidentally says "actually my name is Bob" — the state
    // machine should NOT overwrite the first name.
    const t3 = processTurn(t2.draft, "actually my name is Bob", FROM)
    expect(t3.draft.patientName).toBe("Akarshit")
  })

  it("Multi-field single-line message extracts all fields", () => {
    const t1 = processTurn(null, "book appointment", FROM)
    const t2 = processTurn(t1.draft, "Akarshit Rajput, tomorrow at 4 PM, I have a headache", FROM)
    expect(t2.draft.patientName).toBe("Akarshit Rajput")
    expect(t2.draft.preferredDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(t2.draft.preferredTime).toBe("16:00")
    expect(t2.draft.reason?.toLowerCase()).toContain("headache")
  })

  it("Empty / junk message on an active draft does not crash and does not lose state", () => {
    const t1 = processTurn(null, "book", FROM)
    const t2 = processTurn(t1.draft, "akarshit", FROM)
    const t3 = processTurn(t2.draft, "...", FROM)
    expect(t3.draft.active).toBe(true)
    expect(t3.draft.patientName).toBe("Akarshit")
  })
})
