/**
 * Static provider audit (STEP 15).
 *
 * Fails if the ACTIVE AI provider implementation references any
 * removed provider (OpenAI SDK calls, BuildPico), any dead
 * credential variable, or any HARDCODED model ID. OpenRouter must be
 * the single provider and OPENROUTER_MODEL / OPENROUTER_FALLBACK_MODELS
 * env vars must be the single source of truth for model selection.
 *
 * Allowed occurrences (documented, outside the active AI path):
 *   - legacy dashboard BYO-credential UI (does not feed the AI reply path)
 *   - tests/** — test files (synthetic model IDs only)
 */
import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

const AI_DIR = path.join(process.cwd(), "src", "lib", "ai")

describe("Static provider audit: OpenRouter is the ONLY provider", () => {
  it("ai/index.ts contains NO OpenAI or BuildPico provider logic", () => {
    const src = fs.readFileSync(path.join(AI_DIR, "index.ts"), "utf8")
    for (const banned of [
      "callOpenAI",
      "callAnthropic",
      "callGemini",
      "callGroq",
      "callBuildPicoApps",
      "callPicoFallback",
      "getPicoUrl",
      "PICO_LLM_API_URL",
      "OPENAI_API_KEY",
      "from \"openai\"",
      "from 'openai'",
      "getProviderConfig",
      "callProviderWithTools",
    ]) {
      expect(src.includes(banned), `src/lib/ai/index.ts must not reference "${banned}"`).toBe(false)
    }
    // The single provider must be present — via the failover manager.
    expect(src).toContain("callOpenRouterWithFailover")
    expect(src).toContain("openrouter-manager")
    expect(src).toContain("getOpenRouterConfig")
  })

  it("ai/providers.ts is OpenRouter-only: no other provider functions exist", () => {
    const src = fs.readFileSync(path.join(AI_DIR, "providers.ts"), "utf8")
    for (const banned of [
      "callOpenAI",
      "callAnthropic",
      "callGemini",
      "callGroq",
      "callBuildPicoApps",
      "PICO_LLM_API_URL",
      "OPENAI_API_KEY",
      "api.openai.com",
    ]) {
      expect(src.includes(banned), `src/lib/ai/providers.ts must not reference "${banned}"`).toBe(false)
    }
    expect(src).toContain("openrouter.ai/api/v1/chat/completions")
  })

  it("ai/openrouter-manager.ts is env-driven with NO hardcoded model list", () => {
    const src = fs.readFileSync(path.join(AI_DIR, "openrouter-manager.ts"), "utf8")
    expect(src).toContain("callOpenRouterWithFailover")
    expect(src).toContain("OPENROUTER_MODEL")
    expect(src).toContain("OPENROUTER_FALLBACK_MODELS")
    for (const banned of [
      "DEFAULT_FREE_CANDIDATES",
      "SINGLE_MODEL_PIN",
      "openrouter/free",
      // Legacy plural override env access (exact match — the
      // ALL_OPENROUTER_MODELS_FAILED reason code is legitimate).
      "process.env.OPENROUTER_MODELS",
    ]) {
      expect(src.includes(banned), `src/lib/ai/openrouter-manager.ts must not reference "${banned}"`).toBe(false)
    }
    // No hardcoded OpenRouter model-ID literals: any "…:free" literal or
    // "openrouter/<model>" literal (the openrouter.ai endpoint URL is fine).
    const stripped = src.split("openrouter.ai").join("")
    expect(stripped.includes(":free\""), "manager must not hardcode :free model IDs").toBe(false)
    expect(stripped.includes('"openrouter/'), "manager must not hardcode openrouter/ model IDs").toBe(false)
  })

  it("no active AI runtime file hardcodes a model ID", () => {
    for (const file of ["index.ts", "providers.ts"]) {
      const src = fs.readFileSync(path.join(AI_DIR, file), "utf8")
      const stripped = src.split("openrouter.ai").join("")
      expect(stripped.includes(":free\""), `${file} must not hardcode :free model IDs`).toBe(false)
      expect(stripped.includes('"openrouter/'), `${file} must not hardcode openrouter/ model IDs`).toBe(false)
    }
  })

  it("src/config/constants.ts carries no model configuration", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src", "config", "constants.ts"), "utf8")
    for (const banned of ["PROVIDERS", "PROVIDER_MODELS", "AIProvider", "defaultModel"]) {
      expect(src.includes(banned), `src/config/constants.ts must not reference "${banned}"`).toBe(false)
    }
  })

  it("no active source file references PICO_LLM_API_URL or the BuildPico API", () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) { walk(full); continue }
        if (!/\.tsx?$/.test(entry.name)) continue
        const src = fs.readFileSync(full, "utf8")
        if (src.includes("PICO_LLM_API_URL") || src.includes("buildpicoapps.com") || src.includes("callBuildPicoApps")) {
          offenders.push(path.relative(process.cwd(), full))
        }
      }
    }
    walk(path.join(process.cwd(), "src"))
    expect(offenders, `Active source files still reference BuildPico: ${offenders.join(", ")}`).toEqual([])
  })

  it("package.json has no openai SDK dependency", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"))
    expect(pkg.dependencies?.openai, "openai SDK must not be a dependency").toBeUndefined()
    expect(pkg.devDependencies?.openai, "openai SDK must not be a devDependency").toBeUndefined()
  })

  it("src/lib/ai/tools.ts loads with NO dynamic local import (production runtime guard)", () => {
    const src = fs.readFileSync(TOOLS_FILE_PATH, "utf8")
    expect(src).toContain('import { APPOINTMENT_TOOLS, type AppointmentToolName } from "@/lib/appointment/tools"')
    expect(src.includes('import("../appointment/tools")')).toBe(false)
    expect(src.includes('import("@/lib/appointment/tools")')).toBe(false)
  })
})

const TOOLS_FILE_PATH = path.join(process.cwd(), "src", "lib", "ai", "tools.ts")
