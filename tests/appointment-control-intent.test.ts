/**
 * Appointment control-intent regression tests.
 *
 * Production incidents covered:
 *
 *   1. "Confirm" became the patient's NAME, "Book" became the REASON,
 *      "Done" became the NAME, then "Yes" confirmed corrupted data.
 *      → Control messages must NEVER become slot data.
 *   2. "I want another appointment" + all details in ONE message got a
 *      generic fallback, and "Book this" got the fallback again.
 *      → New-appointment intent + multi-field bundles must enter the
 *      deterministic flow; "Book this" must book the collected draft.
 *
 * Architectural rule under test: control intent is classified BEFORE
 * field extraction, and a field is only updated on positive evidence.
 */

import { describe, it, expect } from "vitest"
import {
  processSlotAnswer,
  createFreshDraft,
  clearDraft,
  isAppointmentStart,
  isConfirmationMessage,
  isNewAppointmentRequest,
  classifyAppointmentControl,
  isControlMessage,
  extractAllFields,
  extractDate,
  extractTime,
  looksLikeAppointmentBundle,
  countAppointmentEvidence,
  extractReasonCorrection,
  type AppointmentDraft,
} from "../src/messaging/ai/appointment-state"
import { classifyRoute, isSlotAnswerFor } from "../src/messaging/ai/route-classifier"
import { fuzzyHealthSignal } from "../src/lib/ai/clinot-domain"

const FROM = { id: "15550001111", phone: "15550001111", name: "Akarshit" }
// Fixed "now" (15 Aug 2026) so "20 September" resolves to 2026-09-20.
const NOW = new Date(2026, 7, 15, 12, 0, 0)

function collectingDraft(overrides: Partial<AppointmentDraft> = {}): AppointmentDraft {
  return {
    ...createFreshDraft(),
    active: true,
    status: "collecting",
    expectedField: "name",
    ...overrides,
  }
}

// ============================================================================
// TEST 1 — "Confirm" never becomes the name; it is a confirmation command
// ============================================================================
describe("TEST 1: 'Confirm' never becomes the patient name", () => {
  it("classifies as confirmation control, not data", () => {
    expect(classifyAppointmentControl("Confirm")).toBe("confirm")
    expect(isControlMessage("Confirm")).toBe(true)
    expect(isConfirmationMessage("Confirm")).toBe(true)
  })

  it("is not a slot answer for any field", () => {
    const draft = collectingDraft()
    for (const field of ["name", "phone", "reason", "date", "time"] as const) {
      expect(isSlotAnswerFor("Confirm", field, draft)).toBe(false)
    }
  })

  it("processSlotAnswer leaves an existing name untouched", () => {
    const draft = collectingDraft({ patientName: "Akarshit", expectedField: "phone" })
    const result = processSlotAnswer(draft, "Confirm", FROM, NOW)
    expect(result.draft.patientName).toBe("Akarshit")
    expect(result.draft.reason).toBeUndefined()
  })
})

// ============================================================================
// TEST 2 — "Book" never becomes the reason; it starts/confirms booking
// ============================================================================
describe("TEST 2: 'Book' never becomes the reason", () => {
  it("classifies as confirmation control", () => {
    expect(isConfirmationMessage("Book")).toBe(true)
    expect(classifyAppointmentControl("Book")).toBe("confirm")
    expect(isControlMessage("Book")).toBe(true)
  })

  it("processSlotAnswer leaves an existing reason untouched", () => {
    const draft = collectingDraft({ patientName: "Akarshit", reason: "Headache", expectedField: "date" })
    const result = processSlotAnswer(draft, "Book", FROM, NOW)
    expect(result.draft.reason).toBe("Headache")
    expect(result.draft.patientName).toBe("Akarshit")
  })
})

// ============================================================================
// TEST 3 — "Done" never becomes the name
// ============================================================================
describe("TEST 3: 'Done' never becomes the patient name", () => {
  it("extracts zero fields and is not a slot answer", () => {
    expect(extractAllFields("Done", NOW)).toEqual({})
    const draft = collectingDraft()
    for (const field of ["name", "phone", "reason", "date", "time"] as const) {
      expect(isSlotAnswerFor("Done", field, draft)).toBe(false)
    }
  })

  it("processSlotAnswer leaves an existing name untouched", () => {
    const draft = collectingDraft({ patientName: "Akarshit", expectedField: "reason" })
    const result = processSlotAnswer(draft, "Done", FROM, NOW)
    expect(result.draft.patientName).toBe("Akarshit")
  })
})

// ============================================================================
// TEST 4 — all fields in ONE message are extracted together
// ============================================================================
describe("TEST 4: multi-line bundle extracts every field", () => {
  const bundle = "Akarshit Rajput\n9643070673\nHeadache\n20 September at 4pm"

  it("extracts name, phone, reason, date, and time", () => {
    const out = extractAllFields(bundle, NOW)
    expect(out.name).toBe("Akarshit Rajput")
    expect(out.phone).toBe("9643070673")
    expect(out.reason).toBe("Headache")
    expect(out.preferredDate).toBe("2026-09-20")
    expect(out.preferredTime).toBe("16:00")
  })

  it("processSlotAnswer completes the draft in one turn", () => {
    const result = processSlotAnswer(collectingDraft(), bundle, FROM, NOW)
    expect(result.isComplete).toBe(true)
    expect(result.draft.patientName).toBe("Akarshit Rajput")
    expect(result.draft.patientPhone).toBe("9643070673")
    expect(result.draft.reason).toBe("Headache")
    expect(result.draft.preferredDate).toBe("2026-09-20")
    expect(result.draft.preferredTime).toBe("16:00")
  })

  it("a single sentence with every field also extracts everything", () => {
    const out = extractAllFields(
      "My name is Akarshit Rajput and I have headache. I want 20 September at 4 PM. My number is 9643070673.",
      NOW,
    )
    expect(out.name).toBe("Akarshit Rajput")
    expect(out.phone).toBe("9643070673")
    expect(out.preferredDate).toBe("2026-09-20")
    expect(out.preferredTime).toBe("16:00")
  })
})

// ============================================================================
// TEST 5 — "Book this" books the existing draft
// ============================================================================
describe("TEST 5: 'Book this' is a confirmation command", () => {
  it("isConfirmationMessage + control classification", () => {
    expect(isConfirmationMessage("Book this")).toBe(true)
    expect(classifyAppointmentControl("Book this")).toBe("confirm")
    expect(isControlMessage("Book this")).toBe(true)
  })

  it("never becomes field data", () => {
    expect(extractAllFields("Book this", NOW)).toEqual({})
    const draft = collectingDraft({ patientName: "Akarshit", reason: "Headache", expectedField: "date" })
    const result = processSlotAnswer(draft, "Book this", FROM, NOW)
    expect(result.draft.reason).toBe("Headache")
    expect(result.draft.patientName).toBe("Akarshit")
  })
})

// ============================================================================
// TEST 6 — "I want another appointment" starts a NEW draft
// ============================================================================
describe("TEST 6: another-appointment intent starts a new draft", () => {
  const variants = [
    "I want another appointment",
    "I want to have another appointment",
    "book another appointment",
    "I need one more appointment",
    "new appointment",
    "schedule another visit",
  ]
  for (const msg of variants) {
    it(`"${msg}" is a new-appointment request + appointment start`, () => {
      expect(isNewAppointmentRequest(msg)).toBe(true)
      expect(isAppointmentStart(msg)).toBe(true)
    })
  }

  it("wins over an active draft instead of corrupting it", () => {
    const active = collectingDraft({ patientName: "Akarshit", reason: "Headache", expectedField: "date" })
    const decision = classifyRoute("I want another appointment", active)
    expect(decision.route).toBe("APPOINTMENT_START")
  })
})

// ============================================================================
// TEST 7 — cancelled appointment → new appointment flow works
// ============================================================================
describe("TEST 7: after cancellation a new appointment can start", () => {
  it("cleared draft is inactive and a new request routes to start", () => {
    const cleared = clearDraft("cancelled_by_owner")
    expect(cleared.active).toBe(false)
    expect(isAppointmentStart("I want another appointment")).toBe(true)
    expect(classifyRoute("I want another appointment", null).route).toBe("APPOINTMENT_START")
  })
})

// ============================================================================
// TEST 8/9 — typo-tolerant reasons without corrupting names
// ============================================================================
describe("TEST 8/9: typo-tolerant symptom reasons", () => {
  it("'teeh pain' is a health signal and never a name", () => {
    expect(fuzzyHealthSignal("teeh pain").matched).toBe(true)
    expect(extractAllFields("teeh pain", NOW).name).toBeUndefined()
    expect(extractAllFields("teeh pain", NOW).reason).toBe("teeh pain")
  })

  it("'headche' is recognized as headache-related", () => {
    expect(fuzzyHealthSignal("headche").matched).toBe(true)
    expect(extractAllFields("i have headche", NOW).reason).toContain("headche")
  })

  it("'leg pian' / 'back pian' are health signals, not names", () => {
    for (const msg of ["leg pian", "back pian"]) {
      expect(fuzzyHealthSignal(msg).matched).toBe(true)
      expect(extractAllFields(msg, NOW).name).toBeUndefined()
    }
  })
})

// ============================================================================
// TEST 10 — date/time parsing incl. explicit year
// ============================================================================
describe("TEST 10: '20 September 2026 at 4pm' parses exactly", () => {
  it("date keeps the explicit year, time is 16:00 (never the day number)", () => {
    expect(extractDate("20 September 2026 at 4pm", NOW)).toBe("2026-09-20")
    expect(extractTime("20 September 2026 at 4pm")).toBe("16:00")
  })

  it("yearless upcoming dates use the current year", () => {
    expect(extractDate("20 September", NOW)).toBe("2026-09-20")
  })
})

// ============================================================================
// TEST 11/12 — single-field corrections preserve everything else
// ============================================================================
describe("TEST 11: 'Change time to 4pm' changes only the time", () => {
  it("updates time, preserves date/name/phone/reason", () => {
    const draft = collectingDraft({
      patientName: "Akarshit",
      patientPhone: "9643070673",
      reason: "Headache",
      preferredDate: "2026-09-20",
      preferredTime: "14:00",
      expectedField: "time",
    })
    const result = processSlotAnswer(draft, "Actually make it 4 PM", FROM, NOW)
    expect(result.draft.preferredTime).toBe("16:00")
    expect(result.draft.preferredDate).toBe("2026-09-20")
    expect(result.draft.patientName).toBe("Akarshit")
    expect(result.draft.reason).toBe("Headache")
  })
})

describe("TEST 12: 'Change date to 22 September' changes only the date", () => {
  it("updates date, preserves time/name/phone/reason", () => {
    const draft = collectingDraft({
      patientName: "Akarshit",
      patientPhone: "9643070673",
      reason: "Headache",
      preferredDate: "2026-09-20",
      preferredTime: "16:00",
      expectedField: "date",
    })
    const result = processSlotAnswer(draft, "Change date to 22 September", FROM, NOW)
    expect(result.draft.preferredDate).toBe("2026-09-22")
    expect(result.draft.preferredTime).toBe("16:00")
    expect(result.draft.patientName).toBe("Akarshit")
    expect(result.draft.reason).toBe("Headache")
  })

  it("'Make reason tooth pain' stores only the new reason", () => {
    expect(extractReasonCorrection("Make reason tooth pain", NOW)).toBe("tooth pain")
  })
})

// ============================================================================
// TEST 13 — control vocabulary never becomes any field
// ============================================================================
describe("TEST 13: control messages never become any field", () => {
  const controls = ["yes", "confirm", "book", "book this", "done", "go ahead", "proceed", "okay"]
  for (const msg of controls) {
    it(`"${msg}" yields zero fields and zero slot answers`, () => {
      expect(extractAllFields(msg, NOW)).toEqual({})
      const draft = collectingDraft()
      for (const field of ["name", "phone", "reason", "date", "time"] as const) {
        expect(isSlotAnswerFor(msg, field, draft)).toBe(false)
      }
    })
  }
})

// ============================================================================
// TEST 14 — after BOOKED (cleared) state, a new draft starts clean
// ============================================================================
describe("TEST 14: booked → cleared → clean new draft", () => {
  it("clearDraft deactivates; fresh draft carries no old values", () => {
    const cleared = clearDraft("completed")
    expect(cleared.active).toBe(false)
    const fresh = createFreshDraft()
    expect(fresh.active).toBe(true)
    expect(fresh.patientName).toBeUndefined()
    expect(fresh.reason).toBeUndefined()
    expect(fresh.preferredDate).toBeUndefined()
    expect(fresh.preferredTime).toBeUndefined()
  })
})

// ============================================================================
// TEST 15 — structured messages never fall into the generic fallback
// ============================================================================
describe("TEST 15: structured appointment data enters the appointment flow", () => {
  const bundle = "Akarshit Rajput\n9643070673\nHeadache\n20 September at 4pm"

  it("bundle evidence is detected", () => {
    const ev = countAppointmentEvidence(bundle, NOW)
    expect(ev.hasName).toBe(true)
    expect(ev.hasPhone).toBe(true)
    expect(ev.hasReason).toBe(true)
    expect(ev.hasDate).toBe(true)
    expect(ev.hasTime).toBe(true)
    expect(looksLikeAppointmentBundle(bundle, NOW)).toBe(true)
  })

  it("bundle without a draft routes to APPOINTMENT_START", () => {
    expect(classifyRoute(bundle, null).route).toBe("APPOINTMENT_START")
  })

  it("a pure symptom message does NOT auto-start a booking", () => {
    expect(looksLikeAppointmentBundle("I have headache", NOW)).toBe(false)
    expect(classifyRoute("I have headache", null).route).not.toBe("APPOINTMENT_START")
  })
})
