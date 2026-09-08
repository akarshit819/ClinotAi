/**
 * TEMP SINGLE-MODEL TEST contract for the OpenRouter manager.
 *
 * While SINGLE_MODEL_PIN is active (google/gemma-4-31b-it:free), the
 * manager must attempt EXACTLY that model ID — no alias, no old models,
 * no env-override leakage. Revert this file to the multi-model failover
 * assertions when the pin is removed.
 *
 * Fully mocked fetch, no network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

const PIN = "google/gemma-4-31b-it:free"
const MESSAGES = [{ role: "user", content: "Hello" }] as any

function okResponse(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content, tool_calls: [] } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function errResponse(status: number, body = "error") {
  return new Response(body, { status })
}

describe("openrouter single-model pin", () => {
  const OLD_ENV = { ...process.env }

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key-not-real"
    delete process.env.OPENROUTER_MODELS
    delete process.env.OPENROUTER_MODEL
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    process.env = { ...OLD_ENV }
    vi.unstubAllGlobals()
  })

  it("sends the EXACT pinned model string with no escaping issues", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } = await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    let seenModel: unknown
    const fetchMock = vi.fn(async (url: any, init: any) => {
      seenModel = JSON.parse(init.body).model
      return okResponse("Hi there")
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 3 })
    expect(seenModel).toBe(PIN)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.model).toBe(PIN)
      expect(result.attempt).toBe(1)
    }
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("candidate list is exactly the pinned model", async () => {
    const { getOpenRouterCandidates, resetOpenRouterHealth } = await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    expect(getOpenRouterCandidates()).toEqual([PIN])
  })

  it("ignores OPENROUTER_MODELS env override while pinned", async () => {
    const { getOpenRouterCandidates, resetOpenRouterHealth } = await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_MODELS = "meta-llama/llama-3.3-70b-instruct:free,google/gemini-2.0-flash-exp:free"
    process.env.OPENROUTER_MODEL = "openrouter/free"
    expect(getOpenRouterCandidates()).toEqual([PIN])
  })

  it("404 on the pinned model fails once with no other model attempted", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } = await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    const fetchMock = vi.fn(async () => errResponse(404, "model not found"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 6 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("ALL_OPENROUTER_MODELS_FAILED")
      expect(result.attempts.length).toBe(1)
      expect(result.attempts[0].model).toBe(PIN)
    }
  })

  it("429 maps to RATE_LIMITED without retrying other models", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } = await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    const fetchMock = vi.fn(async () => errResponse(429, "rate limited"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 6 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.attempts[0].reason).toBe("OPENROUTER_RATE_LIMITED")
      expect(result.attempts[0].statusCode).toBe(429)
    }
  })

  it("empty content is recorded and surfaced as failure", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } = await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    const fetchMock = vi.fn(async () => okResponse("   "))
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 3 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.attempts[0].reason).toBe("OPENROUTER_EMPTY_RESPONSE")
    }
  })

  it("fast-fails on 401 with a single attempt", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } = await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    const fetchMock = vi.fn(async () => errResponse(401, "invalid key"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 6 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("OPENROUTER_AUTH_FAILED")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("returns NOT_CONFIGURED without any fetch when the key is missing", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } = await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_API_KEY = ""
    const fetchMock = vi.fn(async () => okResponse("should never be called"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("OPENROUTER_NOT_CONFIGURED")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("normalizeModelId preserves provider-prefixed IDs verbatim", async () => {
    const { normalizeModelId } = await import("../src/lib/ai/openrouter-manager")
    expect(normalizeModelId("openai/gpt-4o-mini")).toBe("openai/gpt-4o-mini")
    expect(normalizeModelId(`  ${PIN}  `)).toBe(PIN)
  })

  it("never exposes the API key in failure reasons", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } = await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_API_KEY = "sk-or-super-secret-key"
    const fetchMock = vi.fn(async () => errResponse(500, "down"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 1 })
    expect(JSON.stringify(result)).not.toContain("sk-or-super-secret-key")
  })
})
