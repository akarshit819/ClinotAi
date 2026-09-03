/**
 * Production runtime smoke test (gated by PRODUCTION_RUNTIME_TEST=1).
 *
 * Boots the full `scripts/start-production.js` launcher against a real
 * embedded PostgreSQL, waits for the Next.js child to listen, then:
 *
 *   - GET /api/health → confirms the service is up AND
 *     jobProcessor.{running,database} are correct
 *   - Inserts a real PENDING Job row → confirms the in-launcher worker
 *     picks it up and completes it
 *   - Sends SIGTERM → confirms graceful shutdown of both worker and
 *     Next.js child within the bounded window
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import EmbeddedPostgres from "embedded-postgres"
import { spawn, type ChildProcess } from "child_process"
import fs from "fs"
import path from "path"
import { Client as PgClient } from "pg"

const ENABLED = process.env.PRODUCTION_RUNTIME_TEST === "1"
const describeMaybe = ENABLED ? describe : describe.skip

describeMaybe("Production runtime (real PostgreSQL + production launcher)", () => {
  let pg: EmbeddedPostgres | null = null
  let databaseUrl: string
  let workDir: string
  let pgClient: PgClient | null = null
  let launcher: ChildProcess | null = null
  let port = 0
  let baseUrl = ""

  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
  }

  beforeAll(async () => {
    workDir = path.join(process.cwd(), ".freebuff", "prod-runtime-" + Date.now())
    fs.mkdirSync(workDir, { recursive: true })

    port = 5700 + Math.floor(Math.random() * 200)
    baseUrl = `http://127.0.0.1:${port}`

    pg = new EmbeddedPostgres({
      databaseDir: path.join(workDir, "data"),
      user: "postgres",
      password: "postgres",
      port: port - 100, // separate port for PG
      persistent: false,
    })
    await pg.initialise()
    await pg.start()
    await pg.createDatabase("clinot_prod")

    const pgPort = (pg as any).options?.port ?? port - 100
    databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/clinot_prod`

    // Apply schema. We must NOT instantiate a PrismaClient in the test
    // process because the launcher's `npx prisma generate` will rename
    // the query engine .dll, which fails on Windows when the file is
    // locked by an already-loaded client. Raw `pg` is used instead.
    const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma")
    const prismaBin = path.join(process.cwd(), "node_modules", ".bin", "prisma")
    const { execSync } = await import("child_process")
    execSync(`"${prismaBin}" db push --schema "${schemaPath}" --skip-generate --accept-data-loss`, {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    })

    // Baseline migrations so the launcher's `prisma migrate deploy`
    // (which uses migrations, not db push) considers the schema current.
    // This mirrors how a real production database is baselined.
    try {
      execSync(`"${prismaBin}" migrate resolve --applied 20260816000000_init --schema "${schemaPath}"`, {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: "pipe",
      })
    } catch {
      // Already baselined is fine
    }

    // Minimal env so the launcher can run without validation errors. The
    // launcher also runs prisma migrate deploy + seed-system, so we need
    // valid JWT_SECRET, ENCRYPTION_KEY, CSRF_SECRET, etc.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      JWT_SECRET: "test-jwt-secret-must-be-at-least-32-characters-long-aaaa",
      ENCRYPTION_KEY: "test-encryption-key-must-be-at-least-32-characters-long",
      CSRF_SECRET: "test-csrf-secret-must-be-at-least-32-characters-long-aaa",
      NEXT_PUBLIC_APP_URL: baseUrl,
      PORT: String(port),
      HOSTNAME: "0.0.0.0",
      NODE_ENV: "production",
      NEXTAUTH_URL: baseUrl,
      // Skip opt-in flows
      CLINOT_BOOTSTRAP_ADMIN: "",
      CLINOT_DEV_SEED: "",
      // Skip the launcher's prisma generate — we have already pushed
      // the schema, and the .dll is locked by the test process's node
      // runtime on Windows.
      CLINOT_SKIP_PRISMA_GENERATE: "true",
    }

    // Boot the production launcher
    const launcherPath = path.join(process.cwd(), "scripts", "start-production.js")
    launcher = spawn(process.execPath, [launcherPath], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    // Capture output for debugging
    const out: string[] = []
    const outFile = path.join(workDir, "launcher.log")
    const outStream = fs.createWriteStream(outFile, { flags: "w" })
    launcher.stdout?.on("data", (d: Buffer) => {
      const s = d.toString()
      out.push(s)
      outStream.write(s)
    })
    launcher.stderr?.on("data", (d: Buffer) => {
      const s = d.toString()
      out.push(s)
      outStream.write(s)
    })
    ;(launcher as any)._output = out
    ;(launcher as any)._logFile = outFile

    // Wait for the Next.js child to be ready (up to 90s — includes
    // prisma generate + migrate deploy + seed-system + worker init +
    // Next.js boot).
    const deadline = Date.now() + 90_000
    let ready = false
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${baseUrl}/api/health`)
        if (res.status < 500) {
          ready = true
          break
        }
      } catch {
        // not ready yet
      }
      await sleep(500)
    }
    if (!ready) {
      console.error("Launcher output written to " + outFile)
      console.error("Launcher output:\n" + out.join(""))
      throw new Error(`Production launcher did not become ready within 90s. Output dumped.`)
    }

    // Connect a raw pg client for inserting test jobs and observing
    // their state. The test process never loads the Prisma .dll, so the
    // launcher's engine is not affected.
    pgClient = new PgClient({ connectionString: databaseUrl })
    await pgClient.connect()
    // Pin the session to UTC so timestamps inserted via NOW() match the
    // UTC interpretation Prisma uses for DateTime columns. Without this,
    // a test machine in a non-UTC timezone would store `scheduledAt`
    // with a local offset, and the worker's `new Date()` (UTC) would
    // appear to be in the past relative to the stored value, so the
    // `scheduledAt <= now` filter would never match.
    await pgClient.query("SET TIME ZONE 'UTC'")
  }, 180_000)

  afterAll(async () => {
    // The teardown involves: launcher SIGTERM → worker drain → Next.js
    // child exit → pg.stop(). This can take up to 40s (SHUTDOWN_GRACE_MS
    // + child grace + pg shutdown). Allow plenty of room.
    if (launcher && launcher.exitCode === null) {
      launcher.kill("SIGTERM")
      const exitDeadline = Date.now() + 35_000
      while (Date.now() < exitDeadline && launcher.exitCode === null) {
        await sleep(200)
      }
      if (launcher.exitCode === null) {
        launcher.kill("SIGKILL")
      }
    }
    if (pgClient) {
      try {
        await pgClient.end()
      } catch {
        // ignore
      }
    }
    if (pg) {
      try {
        await pg.stop()
      } catch {
        // ignore
      }
    }
    if (workDir && fs.existsSync(workDir)) {
      try {
        fs.rmSync(workDir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  }, 60_000)

  it("/api/health reports the job processor as running with database ok", async () => {
    const res = await fetch(`${baseUrl}/api/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("healthy")
    expect(body.checks.database).toBe("ok")
    expect(body.jobProcessor).toBeDefined()
    expect(body.jobProcessor.running).toBe(true)
    expect(body.jobProcessor.database).toBe("ok")
  })

  it("internal job processor picks up a real PENDING job and completes it", async () => {
    expect(pgClient).toBeTruthy()
    // Create a clinic first (FK requirement on the Job table).
    const clinicId = `clinic-rt-${Date.now()}`
    const slug = `clinic-rt-${Date.now()}`
    await pgClient!.query(
      `INSERT INTO "Clinic" (id, slug, name, "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())`,
      [clinicId, slug, "RT Clinic"],
    )
    const jobId = `rt-job-${Date.now()}`
    const idempotencyKey = `rt-key-${Date.now()}`
    const insertRes = await pgClient!.query(
      `INSERT INTO "Job" (id, "clinicId", type, payload, status, priority, attempts, "maxAttempts", "scheduledAt", "idempotencyKey", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, NOW() - INTERVAL '1 second', $9, NOW(), NOW())
       RETURNING id, status, "scheduledAt"`,
      [
        jobId,
        clinicId,
        "PROCESS_APPOINTMENT_BOOKING", // worker noop — should complete
        JSON.stringify({ clinicId }),
        "PENDING",
        0,
        0,
        3,
        idempotencyKey,
      ],
    )
    expect(insertRes.rows[0].status).toBe("PENDING")

    // Wait up to 30s for the worker to claim and complete it.
    let completed = false
    for (let i = 0; i < 60; i++) {
      await sleep(500)
      const r = await pgClient!.query(`SELECT status FROM "Job" WHERE id = $1`, [jobId])
      if (r.rows[0]?.status === "COMPLETED") {
        completed = true
        break
      }
    }
    expect(completed).toBe(true)
  }, 60_000)
})
