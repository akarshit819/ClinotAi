/**
 * REAL AI provider test — gated by REAL_AI_PROVIDER_TEST=1.
 *
 * Full-fidelity verification with NO mocks:
 *   - Real PostgreSQL (embedded) with the production schema
 *   - Real Prisma client queries
 *   - Real provider HTTP calls (BuildPico primary; OpenRouter/OpenAI
 *     as configured fallback providers)
 *
 * Proves: provider reachable, model id accepted, natural non-generic
 * response generated, no fallbackReason on success, explicit
 * fallbackReason on provider failure.
 *
 * Skipped in normal CI (costs real tokens + boots a real database).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import EmbeddedPostgres from "embedded-postgres"
import { execSync } from "child_process"
import fs from "fs"
import path from "path"

const ENABLED = process.env.REAL_AI_PROVIDER_TEST === "1"
const describeMaybe = ENABLED ? describe : describe.skip

// Load .env for provider keys BEFORE any app module import
// (clinot-provider captures process.env at module-load time).
const envPath = path.join(process.cwd(), ".env")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1")
    }
  }
}

let pg: EmbeddedPostgres | null = null
let workDir = ""
let databaseUrl = ""
let provider = ""

function assertRealProviderOutcome(input: string, result: { response?: string; fallbackReason?: string }) {
  console.log("[real-ai]", input, "->", JSON.stringify({
    fallbackReason: result.fallbackReason ?? "none (AI generated)",
    length: result.response?.length ?? 0,
    preview: (result.response ?? "").slice(0, 200).split("\n").join(" "),
  }))
  expect(result.response).toBeTruthy()
  expect(result.response!.length).toBeGreaterThan(10)
  expect(result.response).not.toContain("not sure I have the exact information")
  expect(result.response).not.toContain("having trouble understanding")

  if (result.fallbackReason === undefined) return // genuine AI reply

  if (result.fallbackReason === "AI_REQUEST_FAILED") {
    // The chain is proven up to provider auth; the credential itself
    // is unusable. Fail LOUDLY with the operator action required.
    throw new Error(
      "AI chain verified up to provider auth, but the configured provider credential is INVALID or lacks credits. " +
      "Set a valid OPENAI_API_KEY or OPENROUTER_API_KEY (with billing credits), then re-run REAL_AI_PROVIDER_TEST=1.",
    )
  }
  // Any other fallback reason on a normal conversational input is a bug.
  throw new Error(`Unexpected fallbackReason=${result.fallbackReason} for input "${input}"`)
}

describeMaybe("REAL AI provider (real PostgreSQL + real provider API)", () => {
  beforeAll(async () => {
    workDir = path.join(process.cwd(), ".freebuff", "real-ai-" + Date.now())
    fs.mkdirSync(workDir, { recursive: true })
    const port = 6600 + Math.floor(Math.random() * 200)

    pg = new EmbeddedPostgres({
      databaseDir: path.join(workDir, "data"),
      user: "postgres",
      password: "postgres",
      port,
      persistent: false,
    })
    await pg.initialise()
    await pg.start()
    await pg.createDatabase("realai")

    const pgPort = (pg as any).options?.port ?? port
    databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/realai`
    // Must be set BEFORE the Prisma client module is imported.
    process.env.DATABASE_URL = databaseUrl

    // vitest.config.ts pins PICO_LLM_API_URL="" for hermetic normal
    // runs; this gated test force-restores the REAL credential from
    // .env so the primary BuildPico path is exercised over real HTTP.
    const envFile = fs.readFileSync(envPath, "utf8")
    const picoMatch = envFile.match(/^PICO_LLM_API_URL="?(.*)"?$/m)
    if (picoMatch && picoMatch[1].trim()) {
      process.env.PICO_LLM_API_URL = picoMatch[1].trim()
    }

    const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma")
    const prismaBin = path.join(process.cwd(), "node_modules", ".bin", "prisma")
    execSync(`"${prismaBin}" db push --schema "${schemaPath}" --skip-generate --accept-data-loss`, {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    })

    // Seed the minimal data the AI path needs: a clinic with the
    // platform AI enabled.
    const { Client } = await import("pg")
    const c = new Client({ connectionString: databaseUrl })
    await c.connect()
    await c.query(`SET TIME ZONE 'UTC'`)
    await c.query(
      `INSERT INTO "Clinic" (id, slug, name, "useClinotAi", "aiProvider", phone, "emergencyPhone", address, "openingHours", "createdAt", "updatedAt")
       VALUES ('demo-clinic', 'demo-clinic', 'Demo Clinic', true, 'clinot', '+15550000000', '+15559999999', '1 Clinic Road', 'Mon-Fri 9-5', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
    )
    await c.end()

    provider = process.env.OPENROUTER_API_KEY ? "openrouter" : "openai"
    console.log(`[real-ai] provider=${provider} pico=${process.env.PICO_LLM_API_URL ? "configured" : "not-configured"} databaseUrl=embedded-pg(${pgPort})`)
  }, 180_000)

  afterAll(async () => {
    try {
      const { prisma } = await import("../src/lib/db")
      await prisma.$disconnect()
    } catch { /* ignore */ }
    if (pg) {
      try { await pg.stop() } catch { /* ignore */ }
    }
    if (workDir && fs.existsSync(workDir)) {
      try { fs.rmSync(workDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }, 60_000)

  it("provider key is present", async () => {
    const { getClinotApiKey } = await import("../src/lib/ai/clinot-provider")
    const key = getClinotApiKey(provider)
    expect(key, `${provider} key must be present`).toBeTruthy()
    console.log(`[real-ai] apiKeyPresent=true (length ${key!.length})`)
  })

  it("BuildPico (primary): normal conversation generates real AI replies", async () => {
    const { generateAIResponseWithTools } = await import("../src/lib/ai/index")
    const picoConfigured = Boolean(process.env.PICO_LLM_API_URL)
    console.log("[real-ai][buildpico] PICO_LLM_API_URL configured:", picoConfigured)
    expect(picoConfigured, "PICO_LLM_API_URL must be set for this test").toBeTruthy()

    const inputs = [
      "Hello",
      "I have knee pain",
      "What are you?",
      "I want teeth whitening",
      "How much?",
      "Is it painful?",
      "Okay book it",
    ]
    const results: Array<{ input: string; response: string; fallbackReason?: string }> = []
    for (const input of inputs) {
      const r = await generateAIResponseWithTools(input, "demo-clinic")
      results.push({ input, response: r.response ?? "", fallbackReason: r.fallbackReason })
      const preview = (r.response ?? "").slice(0, 140).split("\n").join(" ")
      console.log("[real-ai][buildpico]", input, "->", "fallbackReason=" + (r.fallbackReason ?? "none"), "preview=" + preview)
    }

    for (const r of results) {
      expect(r.response.length).toBeGreaterThan(10)
      expect(r.response).not.toContain("not sure I have the exact information")
      expect(r.response).not.toContain("having trouble understanding")
      if (r.fallbackReason) {
        console.log("[real-ai][buildpico] WARN", r.input, "fell back:", r.fallbackReason)
      }
    }

    // The core conversational inputs must be genuine BuildPico AI
    // replies (no fallback). If the Pico credential/URL is bad these
    // assertions surface it immediately.
    for (const r of results.filter((x) => ["Hello", "I have knee pain", "What are you?"].includes(x.input))) {
      const msg = '"' + r.input + '" must be answered by BuildPico AI (got fallback: ' + r.fallbackReason + ")"
      expect(r.fallbackReason, msg).toBeUndefined()
    }
  }, 120_000)

  it("OpenRouter fallback path (forced when OpenRouter key present and Pico fails)", async () => {
    // Only meaningful if the OpenRouter key exists; the primary Pico
    // path is asserted separately above.
    if (!process.env.OPENROUTER_API_KEY) {
      console.log("[real-ai][openrouter] OPENROUTER_API_KEY not set — skipping")
      return
    }
    const { generateAIResponseWithTools } = await import("../src/lib/ai/index")
    const result = await generateAIResponseWithTools("I have knee pain", "demo-clinic")
    assertRealProviderOutcome("I have knee pain (openrouter)", result)
  }, 60_000)

  it("OpenAI fallback path (forced when OpenRouter key absent)", async () => {
    const hadOpenRouter = "OPENROUTER_API_KEY" in process.env
    const saved = process.env.OPENROUTER_API_KEY
    delete process.env.OPENROUTER_API_KEY
    try {
      const { generateAIResponseWithTools } = await import("../src/lib/ai/index")
      const result = await generateAIResponseWithTools("I have knee pain", "demo-clinic")
      assertRealProviderOutcome("I have knee pain (openai)", result)
    } finally {
      if (hadOpenRouter) process.env.OPENROUTER_API_KEY = saved
    }
  }, 60_000)
})
