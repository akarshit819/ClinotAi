#!/usr/bin/env node

/**
 * Production Startup Orchestrator for Voroa / Container Deployments
 *
 * ARCHITECTURE (one process per service, no recursion):
 *
 *   WORKER SERVICE (WORKER_MODE=true):
 *     Spawns the background worker directly. NO migrations, NO seeds, NO
 *     Next.js — the Web service owns schema migrations, so Web + Worker
 *     booting simultaneously can never race on `prisma migrate deploy`.
 *     The worker validates env, waits for PostgreSQL, and polls forever.
 *
 *   WEB SERVICE (default):
 *     1. npx prisma generate
 *     2. npx prisma migrate deploy (production-safe, non-destructive)
 *     3. npx tsx src/seed-system.ts (idempotent system permissions/plans)
 *     4. npx tsx src/bootstrap-admin.ts (if CLINOT_BOOTSTRAP_ADMIN=true)
 *     5. npx tsx src/seed-dev-user.ts (if CLINOT_DEV_SEED=true)
 *     6. npx tsx src/seed-whatsapp.ts (if WhatsApp env vars configured)
 *     7. node .next/standalone/server.js (or `next start` fallback)
 */

const { execSync, spawn } = require("child_process")
const fs = require("fs")
const path = require("path")

const rootDir = path.resolve(__dirname, "..")

function runCommand(command, description, failOnError = true) {
  console.log(`[boot] ${description}...`)
  try {
    execSync(command, {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env,
    })
    console.log(`[boot] ✓ ${description} succeeded.`)
    return true
  } catch (error) {
    if (failOnError) {
      console.error(`[boot] ✗ ${description} failed:`, error.message)
      throw error
    } else {
      console.warn(`[boot] ! ${description} warning / skipped:`, error.message)
      return false
    }
  }
}

function startWorkerProcess() {
  console.log("============================================================")
  console.log("  STARTING BACKGROUND WORKER (WORKER_MODE=true)")
  console.log("  No migrations here — the Web service owns the schema.")
  console.log("============================================================")
  const workerProcess = spawn("npx", ["tsx", "src/lib/jobs/worker.ts"], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
    shell: true,
  })

  workerProcess.on("exit", (code) => {
    console.log(`[worker] Worker process exited with code ${code}`)
    process.exit(code || 0)
  })
}

async function main() {
  console.log("============================================================")
  console.log("  CLINOT AI — PRODUCTION INITIALIZATION & STARTUP")
  console.log("============================================================")

  // Worker branch FIRST — no migrations, no seeds, no Next.js.
  if (process.env.WORKER_MODE === "true") {
    startWorkerProcess()
    return
  }

  // 1. Generate Prisma Client
  runCommand("npx prisma generate", "Generating Prisma client", true)

  // 2. Apply Prisma Migrations (Production-safe, non-destructive)
  // Recover from potential rolled-back state first if needed
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

  // 3. Provision System Data (Permissions, Plans, Clinic Template)
  runCommand("npx tsx src/seed-system.ts", "Provisioning system data (permissions, plans, template)", false)

  // 4. Opt-in Admin Bootstrap (if CLINOT_BOOTSTRAP_ADMIN=true)
  if (process.env.CLINOT_BOOTSTRAP_ADMIN === "true") {
    console.log("[boot] CLINOT_BOOTSTRAP_ADMIN=true detected")
    // Fail fast: the operator explicitly requested admin creation. Silently
    // continuing would produce a deployment where login cannot work.
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

  // 7. Start the Next.js production web server.
  // next.config.js uses output: "standalone" — prefer the self-contained
  // server it generates. `next start` explicitly does not support it.
  // scripts/postbuild.js copies public/ and .next/static/ into the
  // standalone folder after every `npm run build`.
  console.log("============================================================")
  console.log("  STARTING NEXT.JS PRODUCTION WEB SERVER")
  console.log("============================================================")

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

  const webProcess = spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
    shell: command === "npx",
  })

  webProcess.on("exit", (code) => {
    console.log(`[web] Next.js server exited with code ${code}`)
    process.exit(code || 0)
  })
}

main().catch((err) => {
  console.error("[boot] Fatal startup error:", err)
  process.exit(1)
})
