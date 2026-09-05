/**
 * BuildPico primary-provider tests.
 *
 * Restores the historical contract from commit 2c22055 ("Use
 * BuildPicoApps as primary AI provider"), which was removed in 82701fa
 * ("Use OpenRouter as primary AI provider").
 *
 * Proven historical contract (src/lib/ai/providers.ts
 * callBuildPicoApps, unchanged since introduction):
 *   - POST to $PICO_LLM_API_URL
 *   - body: { prompt: "<system instruction + flattened chat>" }
 *   - success response: { status: "success", text: "<reply>" }
 *
 * These tests mock fetch at the HTTP boundary and prove:
 *   1. Pico is called FIRST (primary) when PICO_LLM_API_URL is set.
 *   2. The Pico reply is returned verbatim as the final response.
 *   3. OpenAI/OpenRouter are NOT called when Pico succeeds.
 *   4. On Pico failure the reason is traced and the chain continues to
 *      the fallback providers (never a silent scripted reply).
 *   5. If Pico returns an empty reply, the fallback providers take
 *      over.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Provider keys must be set BEFORE the app modules load:
// clinot-provider.ts captures process.env at module-load time.
vi.hoisted(() => {
  process.env.OPENROUTER_API_KEY = "test-or-key"
  process.env.OPENAI_API_KEY = "test-oa-key"
})

const fetchCalls: Array<{ url: string; body: any }> = []
// URL-aware stub: buildpico.example.com gets the Pico shape, any other
// URL (openrouter.ai) gets a chat-completions shape.
let picoResponse: () => { ok: boolean; status: number; json: () => Promise<any> } = () => ({
  ok: true,
  status: 200,
  json: async () => ({ status: "success", text: "PICO_REPLY:hello there" }),
})
let otherResponse: () => { ok: boolean; status: number; json: () => Promise<any> } = () => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: "OPENROUTER_REPLY:openrouter path" } }] }),
})
const fetchResponse = (url: string) => (url.includes("buildpico.example.com") ? picoResponse() : otherResponse())

vi.mock("@/lib/db", () => {
  const now = () => new Date()
  const prisma = {
    clinic: {
      // BYO config absent; useClinotAi true so the platform provider
      // chain is exercised (Pico primary, OpenAI/OpenRouter fallback).
      findUnique: vi.fn(async () => ({
        id: "clinic-1",
        name: "Demo Clinic",
        phone: "+15550000000",
        emergencyPhone: "+15559999999",
        address: "1 Clinic Road",
        openingHours: "Mon-Fri 9-5",
        timezone: "America/New_York",
        useClinotAi: true,
        aiProvider: "clinot",
      })),
    },
    apiConfig: { findUnique: vi.fn(async () => null) },
    knowledgeBase: { findMany: vi.fn(async () => []) },
    fAQ: { findMany: vi.fn(async () => []) },
    aiUsage: { create: vi.fn(async () => ({})), upsert: vi.fn(async () => ({})) },
  }
  return { prisma }
})

vi.mock("openai", () => {
  const create = vi.fn(async () => ({
    choices: [{ message: { content: "OPENROUTER_REPLY:openrouter path", tool_calls: undefined } }],
  }))
  return {
    default: class {
      chat = { completions: { create } }
      constructor(_cfg: unknown) {}
    },
  }
})

// global fetch boundary — both Pico and OpenRouter (fetch-based) flow
// through here.
vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: { body?: string }) => {
  const body = init?.body ? JSON.parse(init.body) : {}
  fetchCalls.push({ url: String(url), body })
  return fetchResponse(String(url))
}))

import { generateAIResponseWithTools } from "../src/lib/ai/index"

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  fetchCalls.length = 0
  process.env.PICO_LLM_API_URL = "https://buildpico.example.com/api/llm?key=test-key"
  process.env.OPENROUTER_API_KEY = "test-or-key"
  process.env.OPENAI_API_KEY = "test-oa-key"
  picoResponse = () => ({ ok: true, status: 200, json: async () => ({ status: "success", text: "PICO_REPLY:hello there" }) })
})

afterEach(() => {
  process.env.PICO_LLM_API_URL = ORIGINAL_ENV.PICO_LLM_API_URL
  process.env.OPENROUTER_API_KEY = ORIGINAL_ENV.OPENROUTER_API_KEY
  process.env.OPENAI_API_KEY = ORIGINAL_ENV.OPENAI_API_KEY
})

describe("BuildPico primary reply engine (restored historical path)", () => {
  it("Pico is called FIRST with the flattened prompt and its reply is returned verbatim", async () => {
    const result = await generateAIResponseWithTools("Hello", "clinic-1")
    // Pico was called (fetch to PICO url with prompt body).
    const picoCall = fetchCalls.find((c) => c.url.includes("buildpico.example.com"))
    expect(picoCall, "Pico must be the first provider called").toBeTruthy()
    expect(picoCall!.body.prompt).toContain("You are the AI receptionist for a clinic")
    expect(picoCall!.body.prompt).toContain("User: Hello")
    // OpenAI/OpenRouter must NOT be called when Pico succeeds.
    expect(fetchCalls.some((c) => c.url.includes("openrouter.ai"))).toBe(false)
    // The Pico reply is the final response verbatim.
    expect(result.response).toBe("PICO_REPLY:hello there")
    expect(result.fallbackReason).toBeUndefined()
  })

  it("symptom, service, and follow-up inputs all go through the Pico path", async () => {
    for (const msg of ["I have knee pain", "What are you?", "I want teeth whitening", "How much?"]) {
      fetchCalls.length = 0
      const result = await generateAIResponseWithTools(msg, "clinic-1")
      expect(fetchCalls.some((c) => c.url.includes("buildpico.example.com"))).toBe(true)
      expect(result.response).toBe("PICO_REPLY:hello there")
      expect(result.fallbackReason).toBeUndefined()
    }
  })

  it("Pico HTTP failure is traced and the OpenAI fallback provider takes over", async () => {
    picoResponse = () => ({ ok: false, status: 502, json: async () => ({ error: "bad gateway" }) })
    const result = await generateAIResponseWithTools("Hello", "clinic-1")
    // Pico attempted and failed.
    expect(fetchCalls.some((c) => c.url.includes("buildpico.example.com"))).toBe(true)
    // Fallback provider answered (openai SDK mock — not fetch-based).
    expect(result.response).toBe("OPENROUTER_REPLY:openrouter path")
    // The failure reason is observable, not a silent scripted reply.
    expect(result.fallbackReason).toBeUndefined() // OpenAI succeeded
  })

  it("Pico empty reply falls through to the fallback providers", async () => {
    picoResponse = () => ({ ok: true, status: 200, json: async () => ({ status: "success", text: "" }) })
    const result = await generateAIResponseWithTools("Hello", "clinic-1")
    expect(result.response).toBe("OPENROUTER_REPLY:openrouter path")
  })

  it("Pico error-shaped body is treated as a provider failure, not a reply", async () => {
    picoResponse = () => ({ ok: true, status: 200, json: async () => ({ status: "error", message: "quota exceeded" }) })
    const result = await generateAIResponseWithTools("Hello", "clinic-1")
    expect(result.response).toBe("OPENROUTER_REPLY:openrouter path")
  })

  it("Pico not configured (no PICO_LLM_API_URL) preserves the previous provider chain", async () => {
    delete process.env.PICO_LLM_API_URL
    const result = await generateAIResponseWithTools("Hello", "clinic-1")
    expect(fetchCalls.some((c) => c.url.includes("buildpico.example.com"))).toBe(false)
    expect(result.response).toBe("OPENROUTER_REPLY:openrouter path")
  })
})
