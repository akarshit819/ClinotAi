#!/usr/bin/env node

/**
 * Production Startup Orchestrator for Render / Voroa / Container Deployments
 *
 * SINGLE-SERVICE ARCHITECTURE (no separate Background Worker required):
 *
 *   npm run start:
 *     1. npx prisma generate
 *     2. npx prisma migrate deploy (production-safe, non-destructive)
 *     3. npx tsx src/seed-system.ts (idempotent system permissions/plans)
 *     4. npx tsx src/bootstrap-admin.ts (if CLINOT_BOOTSTRAP_ADMIN=true)
 *     5. npx tsx src/seed-dev-user.ts (if CLINOT_DEV_SEED=true)
 *     6. npx tsx src/seed-whatsapp.ts (if WhatsApp env vars configured)
 *     7. start the INTERNAL job processor in THIS process (Node-level —
 *        not Webpack-compiled, so Node built-ins are safe)
 *     8. spawn node .next/standalone/server.js as a child process
 *     9. own SIGTERM/SIGINT: forward to the child, drain the worker
 *
 *   Architectural note (why the worker is started HERE, not in
 *   src/instrumentation.ts):
 *
 *   Next.js 14 compiles instrumentation.ts for BOTH the Node.js and the
 *   Edge runtimes, and Webpack statically resolves every reachable
 *   import — including dynamic imports with literal-string arguments.
 *   The worker depends on Node built-ins (`crypto`, `http`) and on
 *   modules that import them (`token-store`, `encryption`). Starting
 *   the worker from instrumentation.ts forces the Edge runtime's
 *   module graph to attempt resolving Node built-ins and fails the
 *   production build with "Can't resolve 'crypto' / 'http'".
 *
 *   Starting the worker in this Node-only launcher (which is never
 *   touched by Webpack) keeps the worker's Node-only module graph
 *   entirely outside the Next.js compilation pipeline. The runtime
 *   contract is preserved: one service, one boot command, one health
 *   endpoint, one restart unit. From Render's perspective there is
 *   exactly one process tree owned by this launcher.
 *
 *   Optional dedicated worker (rarely needed): start `npm run worker`
 *   directly as its own service. No WORKER_MODE flag exists.
 */

// Register ts-node for any in-process TypeScript imports (e.g. the worker
// is a .ts file but the launcher uses the compiled .js from .next/standalone
// — see postbuild.js). The worker module is loaded via the built-in
// `tsx` require hook so that .ts imports resolve at runtime.
require("tsx/cjs")

const { execSync, spawn } = require("child_process")
const fs = require("fs")
const path = require("path")

const rootDir = path.resolve(__dirname, "..")

function stamp() {
  return new Date().toISOString()
}

function runCommand(command, description, failOnError = true) {
  console.log(`[boot] ${description}... (${stamp()})`)
  try {
    execSync(command, {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env,
    })
    console.log(`[boot] ✓ ${description} succeeded. (${stamp()})`)
    return true
  } catch (error) {
    if (failOnError) {
      console.error(`[boot] FATAL: ${description} failed:`, error.message)
      throw error
    } else {
      console.warn(`[boot] ! ${description} warning / skipped:`, error.message)
      return false
    }
  }
}

/**
 * Resolve the worker's path. The worker source is a TypeScript file
 * (`src/lib/jobs/worker.ts`). In production we load it through tsx's
 * require hook (registered at the top of this file), so the literal
 * .ts path is fine.
 *
 * The worker module is loaded exactly once, in this process, by the
 * launcher. It does NOT enter the Next.js Webpack compilation graph
 * because nothing Next.js compiles imports it.
 *
 * Because the worker lives in the launcher process and the Next.js
 * HTTP server lives in a child process, the launcher's `getHealthSnapshot`
 * is the only authoritative source for worker state. To keep
 * `/api/health` (served by the Next.js child) accurate, the launcher
 * periodically writes the snapshot to a file in os.tmpdir() that the
 * API route reads. The file path is also exported so the API route
 * can be configured to read the same location in all environments.
 */
function healthSnapshotPath() {
  return path.join(require("os").tmpdir(), "clinot-worker-health.json")
}

function startHealthBridge(workerModule) {
  if (!workerModule || typeof workerModule.getHealthSnapshot !== "function") return
  const file = healthSnapshotPath()
  const tick = () => {
    try {
      const snap = workerModule.getHealthSnapshot()
      fs.writeFileSync(file, JSON.stringify({ ...snap, writtenAt: Date.now() }))
    } catch (err) {
      const msg = (err && err.message) || "unknown"
      try { fs.writeFileSync(file, JSON.stringify({ status: "degraded", running: false, database: "unreachable", writtenAt: Date.now(), error: msg })) } catch {}
    }
  }
  // Wait briefly before the first write so the worker has time to
  // complete `verifyDatabaseConnection` and set lastDbOkAt. Without
  // this delay, the first snapshot would be `database: "unreachable"`
  // even though the worker is about to connect — the API route would
  // then briefly report the worker as down on every boot.
  const firstTick = setTimeout(tick, 500)
  firstTick.unref?.()
  const interval = setInterval(tick, 2000)
  interval.unref?.()
  return () => {
    clearTimeout(firstTick)
    clearInterval(interval)
    try { fs.unlinkSync(file) } catch {}
  }
}

/**
 * Post-migration schema verification.
 *
 * Connects to the production PostgreSQL using the same DATABASE_URL the
 * Prisma client uses, and confirms that the critical tables exist. The
 * worker cannot function without these tables; if any are missing the
 * deployment must fail visibly.
 *
 * Uses the `pg` package directly (not the Prisma client) so this
 * verification is independent of the Prisma engine .dll state.
 */
async function verifySchemaReadiness() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("[boot] FATAL: DATABASE_URL is not set — cannot verify schema")
    throw new Error("DATABASE_URL is not set")
  }
  // Log only safe metadata. Never print the full connection string.
  let host = "unknown"
  let dbName = "unknown"
  try {
    const u = new URL(databaseUrl)
    host = u.hostname
    dbName = (u.pathname || "/").replace(/^\//, "") || "unknown"
  } catch {
    // If DATABASE_URL is malformed, still log the host as unknown.
  }
  console.log(`[boot] Verifying schema readiness (host=${host}, database=${dbName})`)

  // Critical tables the worker and webhook handlers need.
  const CRITICAL_TABLES = [
    "Job",                       // Internal job processor queue
    "WhatsAppPhoneNumber",        // WhatsApp webhook → clinic resolution
    "WhatsAppBusinessAccount",   // WhatsApp WABA → clinic resolution
    "WhatsAppWebhookEvent",      // WhatsApp webhook idempotency
    "Clinic",                    // FK target for Job.clinicId
    "User",                      // Auth + session
    "Integration",               // Fallback clinic resolution
  ]

  let Client
  try {
    Client = require("pg").Client
  } catch (err) {
    console.error("[boot] FATAL: 'pg' module is not installed — cannot verify schema:", err.message)
    throw err
  }

  const client = new Client({ connectionString: databaseUrl })
  try {
    await client.connect()
    const r = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [CRITICAL_TABLES],
    )
    const present = new Set(r.rows.map((row) => row.table_name))
    const missing = CRITICAL_TABLES.filter((t) => !present.has(t))
    if (missing.length > 0) {
      console.error(`[boot] FATAL: Schema verification FAILED. Missing critical tables: ${missing.join(", ")}`)
      console.error(`[boot] This usually means migrations did not run correctly.`)
      console.error(`[boot] Verify that prisma/migrations/ contains a migration that creates these tables.`)
      throw new Error(`Schema verification failed: missing tables ${missing.join(", ")}`)
    }
    console.log(`[boot] ✓ Schema verification passed (${CRITICAL_TABLES.length} critical tables present)`)
  } finally {
    try { await client.end() } catch {}
  }
}

function startInternalWorker() {
  if (process.env.CLINOT_DISABLE_INTERNAL_WORKER === "true") {
    console.log("[boot] CLINOT_DISABLE_INTERNAL_WORKER=true — internal worker disabled")
    return null
  }
  if (process.env.WORKER_MODE === "true") {
    // Legacy guard: a dedicated standalone worker is also running. The
    // launcher must not start a second polling loop.
    console.log("[boot] WORKER_MODE=true — dedicated worker handles jobs; launcher skips internal processor")
    return null
  }

  console.log("[boot] Starting internal job processor (Node-level)... (${stamp()})".replace("${stamp()}", stamp()))
  const workerModule = require(path.join(rootDir, "src", "lib", "jobs", "worker.ts"))
  // startWorker returns a promise that resolves only on shutdown; we run it
  // in the background. The worker registers its own signal handlers, but
  // because this launcher also installs handlers we coordinate below.
  workerModule.startWorker({ mode: "internal" }).catch((err) => {
    // Internal mode never throws out of startWorker — startup failures
    // are retried inside the worker. This catch is a belt-and-suspenders
    // guard for unexpected promise rejections.
    console.error("[boot] Internal job processor rejected:", err)
  })
  // Export the snapshot path so the API route can read it. The API
  // route lives in a child process and cannot import this module.
  process.env.CLINOT_WORKER_HEALTH_FILE = healthSnapshotPath()
  return workerModule
}

/**
 * Spawn the Next.js production server as a child process and forward
 * lifecycle events back to the launcher.
 */
function spawnNextServer() {
  const standaloneServer = path.join(rootDir, ".next", "standalone", "server.js")
  let command, args
  if (fs.existsSync(standaloneServer)) {
    console.log("[boot] Standalone build detected — using node .next/standalone/server.js")
    command = process.execPath
    args = [standaloneServer]
  } else {
    console.log("[boot] No standalone build found — falling back to `next start`")
    command = "npx"
    args = ["next", "start", "-p", process.env.PORT || "3000"]
  }

  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    // Force the bind address to 0.0.0.0: the Next standalone server uses
    // process.env.HOSTNAME as its bind host, and container platforms often
    // set HOSTNAME to the container name — which can bind to a non-routable
    // interface so platform health checks never connect.
    env: { ...process.env, HOSTNAME: "0.0.0.0" },
    shell: command === "npx",
  })

  child.on("exit", (code, signal) => {
    console.log(`[web] Next.js server exited (code=${code}, signal=${signal || "none"})`)
    // The Next.js child is the only long-running component besides the
    // worker. Its exit signals the end of the web service; the launcher's
    // own shutdown handlers will drain the worker.
    process.exit(code ?? (signal ? 1 : 0))
  })

  return child
}

let shuttingDown = false

function installSignalHandlers(workerModule, webChild, stopHealthBridge) {
  const handle = (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[boot] ${signal} received — beginning graceful shutdown`)

    // 0. Stop the health bridge so it no longer writes to the file.
    try { stopHealthBridge?.() } catch {}

    // 1. Forward the signal to the Next.js child. Next.js 14's
    // standalone server responds to SIGTERM by closing the HTTP
    // listener, but on some platforms it can take 30+ seconds to
    // actually exit. We give it a bounded window, then SIGKILL.
    if (webChild && !webChild.killed) {
      try {
        webChild.kill(signal)
      } catch (err) {
        console.error("[boot] Failed to forward signal to Next.js child:", err.message)
      }
    }

    // 2. Drain the worker. stopJobProcessor waits up to SHUTDOWN_GRACE_MS
    // for in-flight jobs to finish, then resolves. It does NOT exit the
    // process — the launcher's own exit happens when the child exits.
    if (workerModule) {
      const drainTimeoutMs = 35_000
      const drainTimer = setTimeout(() => {
        console.error(`[boot] Worker drain timed out after ${drainTimeoutMs}ms — forcing exit`)
        process.exit(1)
      }, drainTimeoutMs)
      drainTimer.unref?.()
      workerModule.stopJobProcessor().then(
        () => {
          console.log("[boot] Worker drained cleanly")
          // The Next.js child is the primary exit driver; if it's still
          // alive, give it a short window then escalate to SIGKILL.
          if (webChild && !webChild.killed) {
            const killTimer = setTimeout(() => {
              if (!webChild.killed) {
                console.error("[boot] Next.js child did not exit after drain — sending SIGKILL")
                try { webChild.kill("SIGKILL") } catch {}
              }
            }, 5_000)
            killTimer.unref?.()
          }
        },
        (err) => {
          console.error("[boot] Worker drain failed:", err)
          if (webChild && !webChild.killed) {
            try { webChild.kill("SIGKILL") } catch {}
          }
        },
      )
    } else {
      // No worker — the Next.js child is the only long-running thing.
      if (webChild && !webChild.killed) {
        const killTimer = setTimeout(() => {
          if (!webChild.killed) {
            console.error("[boot] Next.js child did not exit after signal — sending SIGKILL")
            try { webChild.kill("SIGKILL") } catch {}
          }
        }, 5_000)
        killTimer.unref?.()
      }
    }
  }

  process.on("SIGTERM", () => handle("SIGTERM"))
  process.on("SIGINT", () => handle("SIGINT"))
}

async function main() {
  console.log("============================================================")
  console.log("  CLINOT AI — PRODUCTION INITIALIZATION & STARTUP")
  console.log("============================================================")

  // 1. Generate Prisma Client (skippable in CI/test where the engine is
  // already up-to-date and the test process holds the .dll open).
  if (process.env.CLINOT_SKIP_PRISMA_GENERATE === "true") {
    console.log("[boot] CLINOT_SKIP_PRISMA_GENERATE=true — skipping prisma generate")
  } else {
    runCommand("npx prisma generate", "Generating Prisma client", true)
  }

  // 2. Apply Prisma Migrations (Production-safe, non-destructive)
  try {
    execSync("npx prisma migrate resolve --rolled-back 20260816000000_init", {
      cwd: rootDir,
      stdio: "pipe",
      env: process.env,
    })
  } catch {
    // Harmless if not in rolled-back state
  }
  runCommand("npx prisma migrate deploy", "Applying database migrations (prisma migrate deploy)", true)

  // 2a. Post-migration schema verification.
  //
  // `prisma migrate deploy` is supposed to bring the schema up to the
  // current Prisma migration directory. In practice, a missing
  // migration (or a partial one — see the 20260903000000_* migration
  // that added the Job, MessengerWebhookEvent, and InstagramWebhookEvent
  // tables that were missing from the initial migration) can leave
  // the schema incomplete. If we start the worker against a database
  // with no `Job` table, every poll throws "relation does not exist"
  // and the deployment looks healthy while it is actually broken.
  //
  // We verify the critical tables directly via a raw pg query, using
  // the DATABASE_URL connection. This is a separate connection from
  // the Prisma client the worker uses, so the .dll lock issue does
  // not apply. If any critical table is missing, we abort with a
  // clear, non-zero exit so the platform's deploy failure is visible.
  await verifySchemaReadiness()

  // 3. Provision System Data (Permissions, Plans, Clinic Template)
  // FATAL on failure: roles/permissions are required for login and booking —
  // starting the web server without them produces a broken deployment.
  runCommand("npx tsx src/seed-system.ts", "Provisioning system data (permissions, plans, template)", true)

  // 4. Opt-in Admin Bootstrap (if CLINOT_BOOTSTRAP_ADMIN=true)
  if (process.env.CLINOT_BOOTSTRAP_ADMIN === "true") {
    console.log("[boot] CLINOT_BOOTSTRAP_ADMIN=true detected")
    runCommand("npx tsx src/bootstrap-admin.ts", "Bootstrapping initial admin account", true)
  }

  // 5. Opt-in Dev Seed (if CLINOT_DEV_SEED=true)
  if (process.env.CLINOT_DEV_SEED === "true") {
    console.log("[boot] CLINOT_DEV_SEED=true detected")
    runCommand("npx tsx src/seed-dev-user.ts", "Seeding dev/test user", false)
  }

  // 6. WhatsApp Business Account connectivity (if env vars set)
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_WABA_ID) {
    runCommand("npx tsx src/seed-whatsapp.ts", "Connecting WhatsApp Business Account", false)
  }

  console.log("============================================================")
  console.log("  STARTING INTERNAL JOB PROCESSOR + NEXT.JS SERVER")
  console.log("============================================================")

  // 6a. AI provider configuration diagnostics. Presence booleans only —
  // never log key values. Without at least one configured provider the
  // receptionist falls back to scripted responses for every message,
  // so this MUST be visible at boot.
  const aiProviders = {
    openai: Boolean(process.env.OPENAI_API_KEY),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    gemini: Boolean(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY),
    groq: Boolean(process.env.GROQ_API_KEY),
  }
  const anyProvider = Object.values(aiProviders).some(Boolean)
  console.log(`[boot] AI providers configured (API key present): ${JSON.stringify(aiProviders)}`)
  if (!anyProvider) {
    console.error("[boot] WARNING: NO AI provider API key is configured. The AI receptionist cannot generate responses and every message will receive a scripted fallback. Set OPENAI_API_KEY or OPENROUTER_API_KEY.")
  }

  // 7. Start the internal job processor IN THIS PROCESS. The worker
  // polling loop runs in the same Node process as the launcher; it is
  // not Webpack-compiled, so Node built-ins (crypto, http) are safe.
  const workerModule = startInternalWorker()

  // 7a. Bridge the worker's in-memory health snapshot to a file the
  // Next.js child can read (separate process, separate memory).
  const stopHealthBridge = startHealthBridge(workerModule)

  // 8. Spawn the Next.js production server as a child.
  const webChild = spawnNextServer()

  // 9. Install signal handlers so SIGTERM/SIGINT cleanly drain both
  // the worker and the Next.js child.
  installSignalHandlers(workerModule, webChild, stopHealthBridge)
}

main().catch((err) => {
  console.error("[boot] Fatal startup error:", err)
  process.exit(1)
})
