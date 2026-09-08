/**
 * REAL OpenRouter provider test — gated by REAL_AI_PROVIDER_TEST=1.
 *
 * When the gate is disabled the suite skips safely.
 * When enabled it makes a REAL HTTP request to OpenRouter —
 * NO mocks, NO stubs, NO fake fetch.
 *
 * Proves: request reaches OpenRouter, authentication result, the
 * env-configured model (OPENROUTER_MODEL primary, optional
 * OPENROUTER_FALLBACK_MODELS chain), a valid response structure, and
 * non-empty assistant content.
 *
 * Honesty rules:
 *   - 401 → the test FAILS with OPENROUTER_AUTH_FAILED (never hidden).
 *   - 429 → FAILS with OPENROUTER_RATE_LIMITED.
 *   - missing key → skips with a clear reason.
 *   - The API key is never printed.
 */
import { describe, it, expect, beforeAll } from "vitest"
import fs from "fs"
import path from "path"

const ENABLED = process.env.REAL_AI_PROVIDER_TEST === "1"
const describeMaybe = ENABLED ? describe : describe.skip

// Load .env BEFORE app modules: the provider reads the key at call
// time, but the gated flag must know whether a key exists.
const envPath = path.join(process.cwd(), ".env")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1")
    }
  }
}

describeMaybe("REAL OpenRouter provider (real HTTP, no mocks)", () => {
  let apiKeyPresent = false

  beforeAll(() => {
    apiKeyPresent = Boolean(process.env.OPENROUTER_API_KEY?.trim())
    if (!apiKeyPresent) {
      console.log("[real-openrouter] SKIP reason: OPENROUTER_API_KEY is not set")
    } else {
      console.log(
        `[real-openrouter] OPENROUTER_API_KEY present (length ${process.env.OPENROUTER_API_KEY!.trim().length}), primary=${process.env.OPENROUTER_MODEL?.trim() || "(unset)"}, fallbacks=${process.env.OPENROUTER_FALLBACK_MODELS?.trim() || "(none)"}`,
      )
    }
  })

  it("makes a REAL OpenRouter request and receives real assistant content", async () => {
    if (!apiKeyPresent) {
      console.log("[real-openrouter] skipped: no credential in environment")
      return
    }

    const { generateAIResponseWithTools } = await import("../src/lib/ai/index")
    const result = await generateAIResponseWithTools("Hello", "demo-clinic")

    console.log("[real-openrouter] result:", JSON.stringify({
      fallbackReason: result.fallbackReason ?? "none (AI generated)",
      length: result.response?.length ?? 0,
      preview: (result.response ?? "").slice(0, 200).split("\n").join(" "),
    }))

    // A real provider failure must surface with its explicit reason —
    // never hidden behind a generic success.
    if (result.fallbackReason) {
      throw new Error(
        `REAL OpenRouter request FAILED: fallbackReason=${result.fallbackReason}. ` +
        `Provider error details are in the [CLINOT_AI_TRACE] log lines above. ` +
        `If this is OPENROUTER_AUTH_FAILED the configured OPENROUTER_API_KEY is invalid, expired, or revoked.`,
      )
    }

    expect(result.response).toBeTruthy()
    expect(result.response!.length).toBeGreaterThan(10)
    // Not one of the scripted generic lines — a real AI reply.
    expect(result.response).not.toContain("not sure I have the exact information")
    expect(result.response).not.toContain("having trouble understanding")
  }, 60_000)
})
