/**
 * Short-term context regression tests.
 * Verifies the brief's contract: scenarios A-H plus token-cap proof.
 */
import { describe, it, expect } from "vitest"
import {
  buildShortTermContext,
  CONTEXT_WINDOW_SIZE,
  readContextState,
  updateContextState,
  topicForRoute,
  summarizeAppointmentDraft,
  type TopicCategory,
} from "../src/messaging/ai/context"
import type { ChatMessage } from "../src/types"

function hist(n: number, base = "I want teeth whitening"): ChatMessage[] {
  const out: ChatMessage[] = []
  for (let i = 0; i < n; i++) {
    out.push({ role: i % 2 === 0 ? "user" : "assistant", content: `${base} #${i}` })
  }
  return out
}

describe("A. current topic follow-up: 'How much?' still knows the whitening topic", () => {
  it("surfaces currentTopic and recent turns to the AI", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "I want to whiten my teeth." },
      { role: "assistant", content: "Sure — our teeth whitening costs 300." },
    ]
    const messages = buildShortTermContext({
      userMessage: "How much does it cost?",
      history,
      contextState: { currentTopic: "teeth_whitening" as TopicCategory, lastUserIntent: "asking_about_price" },
      appointmentDraftActive: false,
      appointmentDraftSummary: null,
    })
    const joined = messages.map((m) => m.content ?? "").join("\n")
    expect(joined).toContain("teeth_whitening")
    expect(joined).toContain("I want to whiten my teeth")
    expect(joined).toContain("How much does it cost")
  })
})

describe("B. topic switch: 'Where is the clinic?' after whitening changes currentTopic", () => {
  it("replaces the old topic in the context header", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Tell me about whitening." },
      { role: "assistant", content: "Whitening is 300." },
    ]
    const messages = buildShortTermContext({
      userMessage: "Where is the clinic?",
      history,
      contextState: {
        currentTopic: topicForRoute("CLINIC_INFORMATION", "teeth_whitening"),
        lastUserIntent: "asking_about_location",
      },
      appointmentDraftActive: false,
      appointmentDraftSummary: null,
    })
    const joined = messages.map((m) => m.content ?? "").join("\n")
    expect(joined).toContain("clinic_location")
    expect(joined).not.toContain("teeth_whitening")
  })
})

describe("C. old topic does not dominate new topic (small window enforced)", () => {
  it("drops old whitening turns and keeps the recent hours turns", () => {
    const oldHistory = hist(30, "old whitening turn")
    const recent: ChatMessage[] = [
      { role: "user", content: "What time do you open?" },
      { role: "assistant", content: "Mon-Fri 8-6." },
    ]
    const messages = buildShortTermContext({
      userMessage: "And on Saturday?",
      history: [...oldHistory, ...recent],
      contextState: { currentTopic: "clinic_hours" as TopicCategory, lastUserIntent: "asking_hours" },
      appointmentDraftActive: false,
      appointmentDraftSummary: null,
    })
    const joined = messages.map((m) => m.content ?? "").join("\n")
    expect(joined).not.toContain("old whitening turn #0")
    expect(joined).not.toContain("old whitening turn #15")
    expect(joined).toContain("What time do you open?")
    expect(joined).toContain("And on Saturday?")
  })
})

describe("D. appointment state survives a topic switch (interruption)", () => {
  it("surfaces both the new topic AND the active draft summary", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "I want to book an appointment" },
      { role: "assistant", content: "What is your full name?" },
      { role: "user", content: "Akarshit Rajput" },
      { role: "assistant", content: "What is the reason for your visit?" },
    ]
    const draftSummary = summarizeAppointmentDraft({
      patientName: "Akarshit Rajput",
      expectedField: "reason",
    })
    const messages = buildShortTermContext({
      userMessage: "Where is the clinic?",
      history,
      contextState: { currentTopic: "clinic_location" as TopicCategory },
      appointmentDraftActive: true,
      appointmentDraftSummary: draftSummary,
    })
    const joined = messages.map((m) => m.content ?? "").join("\n")
    expect(joined).toContain("clinic_location")
    expect(joined).toContain("active appointment draft")
    expect(joined).toContain("awaiting=reason")
  })
})

describe("E. NORMAL AI requests do not include the entire historical transcript", () => {
  it("keeps only the configured window of a 50-message history", () => {
    const history = hist(50, "long-ago message")
    const messages = buildShortTermContext({
      userMessage: "current question",
      history,
      contextState: { currentTopic: "general" as TopicCategory },
      appointmentDraftActive: false,
      appointmentDraftSummary: null,
    })
    const joined = messages.map((m) => m.content ?? "").join("\n")
    expect(joined).not.toContain("long-ago message #0")
    expect(joined).not.toContain("long-ago message #30")
    expect(joined).not.toContain("long-ago message #45")
    expect(joined).toContain("long-ago message #46")
    expect(joined).toContain("long-ago message #49")
    expect(joined).toContain("current question")
  })
})

describe("F. relevant recent context is preserved (small window + current)", () => {
  it("keeps the newest history message and the current message; drops the oldest", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "u3" },
      { role: "assistant", content: "a3" },
      { role: "user", content: "u4" },
      { role: "assistant", content: "a4" },
      { role: "user", content: "u5 (very old)" },
      { role: "assistant", content: "a5 (very old)" },
    ]
    const messages = buildShortTermContext({
      userMessage: "u_current",
      history,
      contextState: { currentTopic: "general" as TopicCategory },
      appointmentDraftActive: false,
      appointmentDraftSummary: null,
    })
    const joined = messages.map((m) => m.content ?? "").join("\n")
    // Window-size agnostic invariants: the most recent CONTEXT_WINDOW_SIZE
    // messages are kept (plus the current message); everything older is
    // dropped. With 10 history messages, at least one older message must
    // be dropped and the newest message must survive.
    expect(joined).toContain("a5") // newest history message survives
    expect(joined).toContain("u_current") // current message always included
    // Total message count is bounded: context header (0 or 1) + window + current.
    expect(messages.length).toBeLessThanOrEqual(CONTEXT_WINDOW_SIZE + 2)
    // The oldest message is always dropped when history exceeds the window.
    expect(joined).not.toContain("u1")
  })
})

describe("G. completed old topics are not repeatedly injected", () => {
  it("replaces the previous [context] header instead of accumulating it", () => {
    const m1 = buildShortTermContext({
      userMessage: "How much?",
      history: [
        { role: "user", content: "I want whitening" },
        { role: "assistant", content: "Sure" },
      ],
      contextState: { currentTopic: "teeth_whitening" as TopicCategory, lastUserIntent: "asking_price" },
      appointmentDraftActive: false,
      appointmentDraftSummary: null,
    })
    const m2 = buildShortTermContext({
      userMessage: "Where are you located?",
      history: m1,
      contextState: { currentTopic: "clinic_location" as TopicCategory, lastUserIntent: "asking_location" },
      appointmentDraftActive: false,
      appointmentDraftSummary: null,
    })
    const joined2 = m2.map((m) => m.content ?? "").join("\n")
    expect(joined2).toContain("clinic_location")
    expect(joined2).not.toContain("teeth_whitening")
  })
})

describe("H. appointment structured state is preserved independently of chat context", () => {
  it("surfaces the draft summary even with empty chat history", () => {
    const messages = buildShortTermContext({
      userMessage: "Where is the clinic?",
      history: [],
      contextState: { currentTopic: "clinic_location" as TopicCategory },
      appointmentDraftActive: true,
      appointmentDraftSummary: "name=Akarshit, awaiting=reason",
    })
    const joined = messages.map((m) => m.content ?? "").join("\n")
    expect(joined).toContain("active appointment draft")
    expect(joined).toContain("name=Akarshit")
  })
})

describe("Context window size is small and bounded", () => {
  it("uses a small, bounded window", () => {
    expect(CONTEXT_WINDOW_SIZE).toBeLessThanOrEqual(6)
    expect(CONTEXT_WINDOW_SIZE).toBeGreaterThanOrEqual(2)
  })
})

describe("topicForRoute keeps appointment during slot answer / interruption", () => {
  it("keeps appointment topic during slot answer and interruption", () => {
    expect(topicForRoute("APPOINTMENT_SLOT_ANSWER", "teeth_whitening")).toBe("teeth_whitening")
    expect(topicForRoute("APPOINTMENT_INTERRUPTION", "teeth_whitening")).toBe("teeth_whitening")
    expect(topicForRoute("APPOINTMENT_SLOT_ANSWER", undefined)).toBe("appointment")
  })
  it("switches topic on non-appointment routes", () => {
    expect(topicForRoute("CLINIC_INFORMATION", "teeth_whitening")).toBe("clinic_location")
    expect(topicForRoute("MEDICAL_SYMPTOM", "teeth_whitening")).toBe("symptom")
    expect(topicForRoute("INSURANCE", "teeth_whitening")).toBe("insurance")
  })
})

describe("updateContextState / readContextState round-trip", () => {
  it("merges without clobbering appointmentDraft", () => {
    const initial = JSON.stringify({
      appointmentDraft: { active: true, status: "collecting", expectedField: "reason" },
      someUnrelatedField: "preserve me",
    })
    const updated = updateContextState(initial, {
      currentTopic: "appointment",
      lastUserIntent: "answering_slot",
      updatedAt: "2026-09-04T00:00:00.000Z",
    })
    const parsed = JSON.parse(updated)
    expect(parsed.appointmentDraft.active).toBe(true)
    expect(parsed.appointmentDraft.status).toBe("collecting")
    expect(parsed.appointmentDraft.expectedField).toBe("reason")
    expect(parsed.someUnrelatedField).toBe("preserve me")
    expect(parsed.contextState.currentTopic).toBe("appointment")
    expect(parsed.contextState.lastUserIntent).toBe("answering_slot")
  })
  it("readContextState returns null for malformed metadata", () => {
    expect(readContextState(null)).toBeNull()
    expect(readContextState("not json")).toBeNull()
    expect(readContextState("{}")).toBeNull()
  })
  it("handles missing contextState gracefully", () => {
    const initial = JSON.stringify({ appointmentDraft: { active: true } })
    expect(readContextState(initial)).toBeNull()
  })
})

describe("summarizeAppointmentDraft", () => {
  it("returns 'active (collecting details)' when nothing is set", () => {
    expect(summarizeAppointmentDraft({})).toBe("active (collecting details)")
  })
  it("summarizes known fields", () => {
    const s = summarizeAppointmentDraft({ patientName: "Akarshit", expectedField: "date" })
    expect(s).toContain("name=Akarshit")
    expect(s).toContain("awaiting=date")
  })
})

describe("Token-cap proof: 100-message conversation produces a tiny context", () => {
  it("caps total context characters", () => {
    const history = []
    for (let i = 0; i < 100; i++) {
      history.push({ role: i % 2 === 0 ? "user" : "assistant", content: `message #${i}: ${"x".repeat(200)}` })
    }
    const messages = buildShortTermContext({
      userMessage: "current question",
      history,
      contextState: { currentTopic: "general" as TopicCategory },
      appointmentDraftActive: false,
      appointmentDraftSummary: null,
    })
    const total = messages.reduce((sum, m) => sum + ((m.content ?? "").length), 0)
    // Without compaction: 100 * 200 = 20000 chars. With a 4-msg window
    // plus a small currentTopic line we should be well under 2000.
    expect(total).toBeLessThan(2000)
  })
})
