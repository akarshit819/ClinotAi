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
 *     7. node .next/standalone/server.js (or `next start` fallback)
 *
 *     The Next.js server starts an INTERNAL background job processor
 *     automatically (src/instrumentation.ts) — WhatsApp webhooks, AI
 *     processing, outbound messages, retries and stale-job recovery all
 *     run inside this one service. PostgreSQL remains the queue's source
 *     of truth. The processor never blocks or terminates HTTP serving.
 *
 *   Optional dedicated worker (rarely needed): start `npm run worker`
 *   directly as its own service. No WORKER_MODE flag exists anymore.
 */

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

async function main() {
  console.log("============================================================")
  console.log("  CLINOT AI — PRODUCTION INITIALIZATION & STARTUP")
  console.log("============================================================")

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
  // FATAL on failure: roles/permissions are required for login and booking —
  // starting the web server without them produces a broken deployment.
  runCommand("npx tsx src/seed-system.ts", "Provisioning system data (permissions, plans, template)", true)

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
    // Force the bind address to 0.0.0.0: the Next standalone server uses
    // process.env.HOSTNAME as its bind host, and container platforms often
    // set HOSTNAME to the container name — which can bind to a non-routable
    // interface so platform health checks never connect.
    env: { ...process.env, HOSTNAME: "0.0.0.0" },
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
