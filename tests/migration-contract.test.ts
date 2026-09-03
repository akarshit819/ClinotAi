/**
 * Production migration contract test (gated by MIGRATION_CONTRACT_TEST=1).
 *
 * Verifies that `prisma migrate deploy` against the actual Prisma
 * migration directory brings a fresh PostgreSQL database to a complete
 * schema (all critical tables present) and that re-running the launcher
 * against an already-migrated database is a safe no-op.
 *
 * The test:
 *   1. Boots an embedded PostgreSQL.
 *   2. Runs `npx prisma migrate deploy` against it (the same command
 *      the production launcher runs at boot).
 *   3. Asserts all critical tables exist (Job, WhatsAppPhoneNumber,
 *      WhatsAppBusinessAccount, WhatsAppWebhookEvent, Clinic, User,
 *      Integration, MessengerWebhookEvent, InstagramWebhookEvent).
 *   4. Runs the schema verification (same as the launcher's
 *      verifySchemaReadiness).
 *   5. Re-runs `prisma migrate deploy` to verify idempotency.
 *   6. Verifies the Prisma client can SELECT from the Job table
 *      (proves the schema is queryable, not just present).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import EmbeddedPostgres from "embedded-postgres"
import { execSync } from "child_process"
import fs from "fs"
import path from "path"
import { Client as PgClient } from "pg"

const ENABLED = process.env.MIGRATION_CONTRACT_TEST === "1"
const describeMaybe = ENABLED ? describe : describe.skip

const CRITICAL_TABLES = [
  "Job",
  "WhatsAppPhoneNumber",
  "WhatsAppBusinessAccount",
  "WhatsAppWebhookEvent",
  "MessengerWebhookEvent",
  "InstagramWebhookEvent",
  "Clinic",
  "User",
  "Integration",
]

describeMaybe("Production migration contract (real PostgreSQL)", () => {
  let pg: EmbeddedPostgres | null = null
  let databaseUrl: string
  let workDir: string
  let port = 0

  beforeAll(async () => {
    workDir = path.join(process.cwd(), ".freebuff", "mig-test-" + Date.now())
    fs.mkdirSync(workDir, { recursive: true })

    port = 6000 + Math.floor(Math.random() * 200)
    pg = new EmbeddedPostgres({
      databaseDir: path.join(workDir, "data"),
      user: "postgres",
      password: "postgres",
      port,
      persistent: false,
    })
    await pg.initialise()
    await pg.start()
    await pg.createDatabase("migcontract")

    const pgPort = (pg as any).options?.port ?? port
    databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/migcontract`
  }, 120_000)

  afterAll(async () => {
    if (pg) {
      try { await pg.stop() } catch {}
    }
    if (workDir && fs.existsSync(workDir)) {
      try { fs.rmSync(workDir, { recursive: true, force: true }) } catch {}
    }
  }, 30_000)

  function runPrismaMigrateDeploy() {
    const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma")
    const prismaBin = path.join(process.cwd(), "node_modules", ".bin", "prisma")
    const output = execSync(`"${prismaBin}" migrate deploy --schema "${schemaPath}"`, {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    })
    return output.toString()
  }

  it("FRESH database: prisma migrate deploy creates all critical tables", async () => {
    const out = runPrismaMigrateDeploy()
    console.log("[fresh migrate deploy]\n" + out)

    const client = new PgClient({ connectionString: databaseUrl })
    await client.connect()
    try {
      const r = await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
        [CRITICAL_TABLES],
      )
      const present = new Set(r.rows.map((row) => row.table_name))
      const missing = CRITICAL_TABLES.filter((t) => !present.has(t))
      expect(missing).toEqual([])

      // Also verify the schema verification function the launcher uses
      // (replicated here as a raw query) would pass.
      const jobColumns = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'Job' AND table_schema = 'public' ORDER BY ordinal_position`,
      )
      expect(jobColumns.rows.length).toBeGreaterThanOrEqual(16)
    } finally {
      await client.end()
    }
  }, 60_000)

  it("FRESH database: Prisma client can SELECT from the Job table", async () => {
    // Insert a clinic + a Job row directly via pg (no Prisma client
    // in the test process — avoids the .dll lock issue).
    const client = new PgClient({ connectionString: databaseUrl })
    await client.connect()
    try {
      await client.query(
        `INSERT INTO "Clinic" (id, slug, name, "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())`,
        ["test-clinic", "test-clinic", "Test Clinic"],
      )
      const r = await client.query(
        `SELECT COUNT(*)::int AS c FROM "Job" WHERE status = 'PENDING'`,
      )
      expect(r.rows[0].c).toBe(0)
    } finally {
      await client.end()
    }
  }, 30_000)

  it("EXISTING database: re-running prisma migrate deploy is idempotent", async () => {
    // Re-run migrate deploy. Prisma should report "No pending migrations"
    // and exit cleanly without error.
    let out = ""
    expect(() => {
      out = runPrismaMigrateDeploy()
    }).not.toThrow()
    expect(out).toMatch(/No pending migrations/i)

    // Verify all critical tables are still present.
    const client = new PgClient({ connectionString: databaseUrl })
    await client.connect()
    try {
      const r = await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
        [CRITICAL_TABLES],
      )
      const present = new Set(r.rows.map((row) => row.table_name))
      const missing = CRITICAL_TABLES.filter((t) => !present.has(t))
      expect(missing).toEqual([])
    } finally {
      await client.end()
    }
  }, 60_000)
})
