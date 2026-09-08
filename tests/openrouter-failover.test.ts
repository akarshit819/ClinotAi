/**
 * OpenRouter env-driven model configuration tests — fully mocked fetch.
 *
 * Single source of truth: OPENROUTER_MODEL (primary, always first) +
 * OPENROUTER_FALLBACK_MODELS (optional CSV). No hardcoded model IDs in
 * the runtime; these tests use synthetic IDs (test-primary, test-fb-1…)
 * so they can never pass because of a baked-in model list.
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

describe("openrouter env-driven model configuration", () => {
  const OLD_ENV = { ...process.env }

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key-not-real"
    delete process.env.OPENROUTER_MODEL
    delete process.env.OPENROUTER_FALLBACK_MODELS
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    process.env = { ...OLD_ENV }
    vi.unstubAllGlobals()
  })

  it("TEST 1: primary only, no fallbacks → totalModels = 1", async () => {
    const { getOpenRouterModelConfig, getOpenRouterCandidates, resetOpenRouterHealth } =
      await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_MODEL = "test-model"

    expect(getOpenRouterModelConfig()).toEqual({
      primaryModel: "test-model",
      fallbackModels: [],
      totalModels: 1,
    })
    expect(getOpenRouterCandidates()).toEqual(["test-model"])
  })

  it("TEST 2: primary + two fallbacks → order primary, one, two", async () => {
    const { getOpenRouterCandidates, resetOpenRouterHealth } =
      await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_MODEL = "primary-model"
    process.env.OPENROUTER_FALLBACK_MODELS = "fallback-one,\nfallback-two"

    expect(getOpenRouterCandidates()).toEqual(["primary-model", "fallback-one", "fallback-two"])
  })

  it("TEST 3: duplicates and primary-repeats removed", async () => {
    const { getOpenRouterCandidates, resetOpenRouterHealth } =
      await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_MODEL = "primary-model"
    process.env.OPENROUTER_FALLBACK_MODELS = "primary-model, fallback-one, fallback-one"

    expect(getOpenRouterCandidates()).toEqual(["primary-model", "fallback-one"])
  })

  it("TEST 4: changing only OPENROUTER_MODEL changes attempt 1 with no code change", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } =
      await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_MODEL = "another-model"
    let seenModel: unknown
    const fetchMock = vi.fn(async (url: any, init: any) => {
      seenModel = JSON.parse(init.body).model
      return okResponse("hi")
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 3 })
    expect(seenModel).toBe("another-model")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.model).toBe("another-model")
  })

  it("missing primary → empty candidates, no fetch, NOT_CONFIGURED", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } =
      await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_FALLBACK_MODELS = "fallback-one"
    const fetchMock = vi.fn(async () => okResponse("should never be called"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("OPENROUTER_NOT_CONFIGURED")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("primary success stops immediately — fallbacks never attempted", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } =
      await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_MODEL = "primary-model"
    process.env.OPENROUTER_FALLBACK_MODELS = "fallback-one,fallback-two"
    const fetchMock = vi.fn(async () => okResponse("primary wins"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 5 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.model).toBe("primary-model")
      expect(result.attempt).toBe(1)
    }
  })

  it("404 on primary → fails over to fallback-one, then two", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } =
      await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_MODEL = "primary-model"
    process.env.OPENROUTER_FALLBACK_MODELS = "fallback-one,fallback-two"
    const seen: string[] = []
    const fetchMock = vi.fn(async (url: any, init: any) => {
      const model = JSON.parse(init.body).model as string
      seen.push(model)
      if (seen.length < 3) return errResponse(404, "model not found")
      return okResponse("recovered on third")
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 5 })
    expect(seen).toEqual(["primary-model", "fallback-one", "fallback-two"])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.model).toBe("fallback-two")
      expect(result.attempt).toBe(3)
    }
  })

  it.each([500, 502, 503, 504])("HTTP %i on primary → fails over to fallback", async (status) => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } =
      await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_MODEL = "primary-model"
    process.env.OPENROUTER_FALLBACK_MODELS = "fallback-one"
    const fetchMock = vi.fn(async (url: any, init: any) => {
      if (fetchMock.mock.calls.length === 1) return errResponse(status, "server error")
      return okResponse("recovered")
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 3 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.model).toBe("fallback-one")
  })

  it("HTTP 400 does NOT fail over — malformed request stops the chain", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } =
      await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_MODEL = "primary-model"
    process.env.OPENROUTER_FALLBACK_MODELS = "fallback-one,fallback-two"
    const fetchMock = vi.fn(async () => errResponse(400, "invalid request"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 5 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("OPENROUTER_BAD_REQUEST")
      expect(result.attempts[0].statusCode).toBe(400)
      expect(result.attempts[0].willFailover).toBe(false)
    }
  })

  it("429 on primary → fails over; 401 → fast-fail without further attempts", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } =
      await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_MODEL = "primary-model"
    process.env.OPENROUTER_FALLBACK_MODELS = "fallback-one"
    const fetchMock = vi.fn(async () => errResponse(429, "rate limited"))
    vi.stubGlobal("fetch", fetchMock)
    const limited = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 3 })
    expect(limited.ok).toBe(false)
    if (!limited.ok) expect(limited.attempts[0].reason).toBe("OPENROUTER_RATE_LIMITED")

    resetOpenRouterHealth()
    const authMock = vi.fn(async () => errResponse(401, "invalid key"))
    vi.stubGlobal("fetch", authMock)
    const authed = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 5 })
    expect(authMock).toHaveBeenCalledTimes(1)
    expect(authed.ok).toBe(false)
    if (!authed.ok) expect(authed.reason).toBe("OPENROUTER_AUTH_FAILED")
  })

  it("empty content fails over to the next env model", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } =
      await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_MODEL = "primary-model"
    process.env.OPENROUTER_FALLBACK_MODELS = "fallback-one"
    const fetchMock = vi.fn(async (url: any, init: any) => {
      if (fetchMock.mock.calls.length === 1) return okResponse("   ")
      return okResponse("real answer")
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 3 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.model).toBe("fallback-one")
      expect(result.content).toBe("real answer")
    }
  })

  it("all env models failing → ALL_OPENROUTER_MODELS_FAILED with per-model attempts", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } =
      await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_MODEL = "primary-model"
    process.env.OPENROUTER_FALLBACK_MODELS = "fallback-one"
    const fetchMock = vi.fn(async () => errResponse(503, "down"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 5 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("ALL_OPENROUTER_MODELS_FAILED")
      expect(result.attempts.map((a) => a.model)).toEqual(["primary-model", "fallback-one"])
    }
  })

  it("whitespace trimmed and model IDs passed verbatim (no prefix forcing)", async () => {
    const { getOpenRouterCandidates, normalizeModelId, resetOpenRouterHealth } =
      await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_MODEL = "  openai/gpt-4o-mini  "
    process.env.OPENROUTER_FALLBACK_MODELS = "  test-fb ,"
    expect(getOpenRouterCandidates()).toEqual(["openai/gpt-4o-mini", "test-fb"])
    expect(normalizeModelId("openai/gpt-4o-mini")).toBe("openai/gpt-4o-mini")
  })

  it("never exposes the API key in failure results", async () => {
    const { callOpenRouterWithFailover, resetOpenRouterHealth } =
      await import("../src/lib/ai/openrouter-manager")
    resetOpenRouterHealth()
    process.env.OPENROUTER_API_KEY = "sk-or-super-secret-key"
    process.env.OPENROUTER_MODEL = "primary-model"
    const fetchMock = vi.fn(async () => errResponse(500, "down"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await callOpenRouterWithFailover(MESSAGES, { maxAttempts: 1 })
    expect(JSON.stringify(result)).not.toContain("sk-or-super-secret-key")
  })
})
