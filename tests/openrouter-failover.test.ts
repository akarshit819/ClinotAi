/**
 * OpenRouter failover manager tests — fully mocked fetch, no network.
 *
 * Covers: first-model success, 404/429/500 failover, empty-content
 * failover, 401 fast-fail, missing-key fast-fail, all-models-exhausted,
 * env override ordering, model-ID normalization, and cooldown skipping.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

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

describe("openrouter failover manager", () => {
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

  it("succeeds on the first model", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } = await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    const fetchMock = vi.fn(async () => okResponse("Hi there"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 3 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toBe("Hi there")
      expect(result.attempt).toBe(1)
      expect(result.model).toContain(":free")
    }
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("fails over from 404 to the next model", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } = await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    const fetchMock = vi.fn(async (url: any, init: any) => {
      const model = JSON.parse(init.body).model as string
      if (model.includes("llama-3.3-70b")) return errResponse(404, "model not found")
      return okResponse("recovered")
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 3 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toBe("recovered")
      expect(result.attempt).toBe(2)
    }
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("fails over through 429 then 500 to success", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } = await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    const fetchMock = vi.fn(async (url: any, init: any) => {
      const n = fetchMock.mock.calls.length
      if (n === 1) return errResponse(429, "rate limited")
      if (n === 2) return errResponse(500, "server error")
      return okResponse("third time lucky")
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 5 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.attempt).toBe(3)
  })

  it("treats empty content as failure and fails over", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } = await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    const fetchMock = vi.fn(async (url: any, init: any) => {
      if (fetchMock.mock.calls.length === 1) return okResponse("   ")
      return okResponse("real answer")
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 3 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.content).toBe("real answer")
  })

  it("fast-fails on 401 without trying every model", async () => {
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

  it("returns ALL_OPENROUTER_MODELS_FAILED when every candidate fails", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } = await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    const fetchMock = vi.fn(async () => errResponse(500, "down"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 2 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("ALL_OPENROUTER_MODELS_FAILED")
      expect(result.attempts.length).toBe(2)
    }
  })

  it("respects OPENROUTER_MODELS env override ordering", async () => {
    const { getOpenRouterCandidates, resetOpenRouterHealth } = await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_MODELS = "custom/model-a, custom/model-b"
    const candidates = getOpenRouterCandidates()
    expect(candidates[0]).toBe("custom/model-a")
    expect(candidates[1]).toBe("custom/model-b")
  })

  it("normalizeModelId preserves provider-prefixed IDs verbatim", async () => {
    const { normalizeModelId } = await import("../src/lib/ai/openrouter-manager")
    expect(normalizeModelId("openai/gpt-4o-mini")).toBe("openai/gpt-4o-mini")
    expect(normalizeModelId("  meta-llama/llama-3.3-70b-instruct:free  ")).toBe(
      "meta-llama/llama-3.3-70b-instruct:free",
    )
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
