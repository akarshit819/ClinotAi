/**
 * REAL AI provider test — gated by REAL_AI_PROVIDER_TEST=1.
 *
 * Full-fidelity verification with NO mocks:
 *   - Real PostgreSQL (embedded) with the production schema
 *   - Real Prisma client queries
 *   - Real OpenRouter/OpenAI HTTP call with the configured key
 *
 * Proves: provider reachable, model id accepted, natural non-generic
 * response generated, no fallbackReason.
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
    console.log(`[real-ai] provider=${provider} databaseUrl=embedded-pg(${pgPort})`)
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

  /**
   * Shared assertion: the AI chain must either produce a REAL natural
   * response (fallbackReason undefined) or fail with the CORRECT,
   * observable reason (AI_REQUEST_FAILED for credential problems).
   * Any other outcome — silent AI_EMPTY_RESPONSE, generic fallback
   * without a reason — is a code bug and fails the test.
   */
  function assertRealProviderOutcome(input: string, result: { response?: string; fallbackReason?: string }) {
    console.log(`[real-ai] ${input} →`, JSON.stringify({
      fallbackReason: result.fallbackReason ?? "none (AI generated)",
      length: result.response?.length ?? 0,
      preview: result.response?.slice(0, 200),
    }))
    expect(result.response).toBeTruthy()
    expect(result.response!.length).toBeGreaterThan(20)

    if (result.fallbackReason === undefined) {
      // Happy path: a real AI response.
      expect(result.response).not.toContain("not sure I have the exact information")
      expect(result.response).not.toContain("having trouble understanding")
      return
    }
    if (result.fallbackReason === "AI_REQUEST_FAILED") {
      // The chain is proven up to provider auth; the credential itself
      // is bad. Fail LOUDLY with the operator action required.
      throw new Error(
        "AI chain verified up to provider auth, but the configured provider credential is INVALID/EXPIRED " +
        "(provider returned 401). Fix the environment: set a valid OPENAI_API_KEY or OPENROUTER_API_KEY, " +
        "then re-run REAL_AI_PROVIDER_TEST=1.",
      )
    }
    // Any other fallback reason on a normal conversational input is a bug.
    throw new Error(`Unexpected fallbackReason=${result.fallbackReason} for input "${input}"`)
  }

  it("generates a real natural response for 'I have knee pain'", async () => {
    const { generateAIResponseWithTools } = await import("../src/lib/ai/index")
    const result = await generateAIResponseWithTools("I have knee pain", "demo-clinic")
    assertRealProviderOutcome("I have knee pain", result)
  }, 60_000)

  it("generates a real natural response for 'What is you'", async () => {
    const { generateAIResponseWithTools } = await import("../src/lib/ai/index")
    const result = await generateAIResponseWithTools("What is you", "demo-clinic")
    assertRealProviderOutcome("What is you", result)
  }, 60_000)

  it("generates a real natural response via the OpenAI provider", async () => {
    // Force provider selection to OpenAI by removing the OpenRouter
    // key from the environment (provider selection prefers OpenRouter
    // whenever its key is present).
    const hadOpenRouter = "OPENROUTER_API_KEY" in process.env
    const saved = process.env.OPENROUTER_API_KEY
    delete process.env.OPENROUTER_API_KEY
    try {
      const { generateAIResponseWithTools } = await import("../src/lib/ai/index")
      const result = await generateAIResponseWithTools("I have knee pain", "demo-clinic")
      console.log("[real-ai][openai] knee pain →", JSON.stringify({
        fallbackReason: result.fallbackReason ?? "none (AI generated)",
        length: result.response?.length ?? 0,
        preview: result.response?.slice(0, 200),
      }))
      expect(result.response).toBeTruthy()
      expect(result.response!.length).toBeGreaterThan(20)
      if (result.fallbackReason === "AI_REQUEST_FAILED") {
        throw new Error(
          "OpenAI credential also invalid. Both provider keys are unusable — set at least one valid key " +
          "(OPENAI_API_KEY or OPENROUTER_API_KEY) for the AI receptionist to answer.",
        )
      }
      expect(result.fallbackReason).toBeUndefined()
      expect(result.response).not.toContain("not sure I have the exact information")
      expect(result.response).not.toContain("having trouble understanding")
    } finally {
      if (hadOpenRouter) process.env.OPENROUTER_API_KEY = saved
    }
  }, 60_000)
})
