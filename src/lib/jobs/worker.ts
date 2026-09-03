import { prisma } from "@/lib/db"
import { logger } from "@/lib/logger"
import {
  getAllPendingJobs,
  claimJob,
  completeJob,
  failJob,
  getJob,
  recoverStaleJobs,
} from "./queue"
import { processIncomingMessage } from "@/messaging/pipeline"
import { sendWithRateLimit } from "@/integrations/whatsapp/delivery"
import { getCredentials } from "@/integrations/token-store"

const BASE_POLL_INTERVAL = 2000
const MAX_POLL_INTERVAL = 30000
const STALE_RECOVERY_INTERVAL = 30_000
// How long the processor waits for PostgreSQL to become reachable before a
// (re)start attempt is considered failed. Standalone mode exits non-zero;
// internal mode retries — the HTTP server must never be taken down by it.
// Overridable for tests/ops via CLINOT_WORKER_DB_WAIT_MS.
const DB_WAIT_TIMEOUT_MS = Number(process.env.CLINOT_WORKER_DB_WAIT_MS) || 5 * 60 * 1000
const DB_WAIT_RETRY_MS = 2000
// The health endpoint reports the DB as unhealthy if no query succeeded
// within this window. Polling touches the DB every few seconds, so a healthy
// processor always refreshes this timestamp.
const DB_HEALTH_WINDOW_MS = 60_000
const SHUTDOWN_GRACE_MS = 30_000
// Internal-mode startup failure retry interval (overridable for tests/ops).
const INTERNAL_STARTUP_RETRY_MS = Number(process.env.CLINOT_WORKER_STARTUP_RETRY_MS) || 60_000

const WORKER_ID = `worker-${process.pid}-${Date.now()}`

let isShuttingDown = false
let shutdownStarted = false
let loopRunning = false
let signalHandlersRegistered = false
let lastStaleRecoveryAt = 0
let lastDbOkAt = 0
let consecutivePollErrors = 0
let activeJobs = 0
let healthServer: import("http").Server | null = null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Fail fast — with an unmistakable message — on configuration the processor
 * genuinely cannot run without. Web-only variables (JWT_SECRET, AI keys,
 * WhatsApp tokens, NEXT_PUBLIC_APP_URL) are intentionally NOT required:
 * credentials for AI/WhatsApp are resolved per job, and a missing credential
 * fails that job with retries, not the processor.
 */
function requireWorkerEnv(): void {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error(
      "[WORKER] FATAL: DATABASE_URL is not set. The job processor requires the application's PostgreSQL connection string."
    )
  }
  // Never log the URL itself — only validate its shape.
  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    throw new Error(
      "[WORKER] FATAL: DATABASE_URL must be a PostgreSQL connection string (postgresql://user:password@host:5432/db). The configured value has an unsupported scheme."
    )
  }
}

export function getHealthSnapshot() {
  const dbOk = lastDbOkAt > 0 && Date.now() - lastDbOkAt < DB_HEALTH_WINDOW_MS
  return {
    status: dbOk ? "healthy" : "degraded",
    role: "worker",
    workerId: WORKER_ID,
    running: loopRunning,
    database: dbOk ? "ok" : "unreachable",
    activeJobs,
    consecutivePollErrors,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  }
}

export async function processJob(job: any): Promise<void> {
  const startTime = Date.now()
  activeJobs++
  try {
    logger.info("[JOB] Processing job", {
      jobId: job.id,
      type: job.type,
      clinicId: job.clinicId,
      attempt: job.attempts,
    })

    switch (job.type) {
      case "PROCESS_INBOUND_MESSAGE": {
        const { clinicId, message } = job.payload
        logger.info("[INBOUND-JOB] Starting processIncomingMessage", {
          jobId: job.id,
          clinicId,
          platform: message?.platform,
          channelId: message?.channelId,
          sourceMessageId: message?.sourceMessageId,
        })

        const result = await processIncomingMessage(clinicId, message)

        logger.info("[INBOUND-JOB] processIncomingMessage completed", {
          jobId: job.id,
          conversationId: result.conversationId,
          requiresClinic: result.requiresClinic,
          hasResponse: !!(result.response && result.response.trim()),
        })
        break
      }

      case "SEND_WHATSAPP_MESSAGE": {
        const { clinicId, to, payload, phoneNumberId } = job.payload
        logger.info("[OUTBOUND-JOB] Processing SEND_WHATSAPP_MESSAGE", {
          jobId: job.id,
          clinicId,
          to,
        })

        const credentials = await getCredentials(clinicId, "whatsapp")
        if (!credentials) {
          throw new Error("No WhatsApp credentials found for clinic: " + clinicId)
        }

        const metadata = credentials.metadata || {}
        const config: any = {
          accessToken: credentials.accessToken,
          phoneNumberId: metadata.phoneNumberId || phoneNumberId,
          wabaId: metadata.wabaId,
          businessId: metadata.businessId,
        }

        const result = await sendWithRateLimit(config, to, payload)
        if (!result.success) {
          throw new Error(
            `[WHATSAPP-SEND] WhatsApp API send failed: ${result.error || "unknown error"} (status: ${result.statusCode})`
          )
        }

        logger.info("[WHATSAPP-SEND] Message sent successfully", {
          jobId: job.id,
          clinicId,
          to,
          messageId: result.messageId,
        })
        break
      }

      case "PROCESS_APPOINTMENT_BOOKING": {
        logger.info("[APPOINTMENT] PROCESS_APPOINTMENT_BOOKING received (noop)", {
          jobId: job.id,
        })
        break
      }

      case "SEND_APPOINTMENT_NOTIFICATION": {
        logger.info("[APPOINTMENT] SEND_APPOINTMENT_NOTIFICATION received (noop)", {
          jobId: job.id,
        })
        break
      }

      default:
        logger.warn("[WORKER] Unknown job type — skipping", {
          jobId: job.id,
          type: job.type,
        })
    }

    await completeJob(job.id)
    logger.info("[JOB] Completed", {
      jobId: job.id,
      type: job.type,
      durationMs: Date.now() - startTime,
    })
  } catch (error: any) {
    // One failed job must never kill the processor: record the failure for the
    // queue's retry policy, then re-throw so the caller logs and continues.
    logger.error("[JOB] Failed", {
      jobId: job.id,
      type: job.type,
      attempt: job.attempts,
      error: error?.message,
    })
    try {
      const jobRecord = await getJob(job.id)
      if (jobRecord) {
        await failJob(job.id, error?.message || "Unknown error", jobRecord.maxAttempts)
        const willRetry = (jobRecord.attempts || 0) < (jobRecord.maxAttempts || 3)
        logger.info(`[JOB] ${willRetry ? "Retrying" : "Dead-lettered"} ${job.id}`, {
          jobId: job.id,
          attempt: jobRecord.attempts,
          maxAttempts: jobRecord.maxAttempts,
        })
      }
    } catch (recordError: any) {
      // Failure-recording itself hit a transient DB error — the job stays
      // PROCESSING and will be recovered by recoverStaleJobs.
      logger.error("[JOB] Could not record job failure (stale recovery will handle it)", {
        jobId: job.id,
        error: recordError?.message,
      })
    }
    throw error
  } finally {
    activeJobs--
  }
}

export async function processJobs() {
  if (isShuttingDown) return

  // Periodically recover jobs stuck in PROCESSING from a dead worker so they
  // are never lost. Throttled to once per STALE_RECOVERY_INTERVAL.
  const now = Date.now()
  if (now - lastStaleRecoveryAt > STALE_RECOVERY_INTERVAL) {
    lastStaleRecoveryAt = now
    try {
      const recovered = await recoverStaleJobs()
      if (recovered > 0) {
        logger.warn("[WORKER] Recovered stale PROCESSING jobs", { recovered })
      }
    } catch (error: any) {
      logger.error("[WORKER] Stale job recovery failed — processor will continue", {
        error: error?.message,
      })
    }
  }

  try {
    const jobs = await getAllPendingJobs(10)
    // Any successful DB round-trip proves the database is reachable.
    lastDbOkAt = Date.now()
    consecutivePollErrors = 0

    for (const job of jobs) {
      if (isShuttingDown) break

      const claimed = await claimJob(job.id, WORKER_ID)
      if (!claimed.success) continue // another processor got it first

      logger.info(`[JOB] Claimed ${job.id} (${job.type})`)
      try {
        await processJob(claimed.job!)
      } catch (error: any) {
        // Already logged + recorded in processJob. The loop continues.
        logger.error(`[JOB] Job execution error for ${job.id} — processor continues`, {
          jobId: job.id,
          error: error?.message,
        })
      }
    }
  } catch (error: any) {
    consecutivePollErrors++
    // Transient database/network problems must never kill the processor —
    // log, back off, and try again on the next poll.
    logger.error("[WORKER] Polling error — processor will continue", {
      error: error instanceof Error ? error.message : String(error),
      consecutivePollErrors,
    })
  }
}

function startHealthServer() {
  const healthPort = process.env.PORT || process.env.HEALTH_PORT
  if (!healthPort) {
    logger.info("[WORKER] No PORT/HEALTH_PORT set — health endpoint disabled")
    return
  }
  try {
    import("http").then((http) => {
      const server = http.createServer((req, res) => {
        if (req.url === "/health" || req.url === "/" || req.url === "/api/health") {
          const snapshot = getHealthSnapshot()
          const body = JSON.stringify(snapshot)
          res.writeHead(snapshot.database === "ok" ? 200 : 503, {
            "Content-Type": "application/json",
          })
          res.end(body)
        } else {
          res.writeHead(404)
          res.end()
        }
      })
      // A port conflict or platform hiccup must degrade the health endpoint,
      // not kill the processor loop.
      server.on("error", (err: any) => {
        logger.error("[WORKER] Health server error — processor continues without health endpoint", {
          error: err?.message,
        })
      })
      server.listen(Number(healthPort), () => {
        healthServer = server
        logger.info(`[WORKER] Health server started on port ${healthPort}`)
      })
    })
  } catch (err: any) {
    logger.error("[WORKER] Could not start health server — processor continues", {
      error: err?.message,
    })
  }
}

async function verifyDatabaseConnection(): Promise<void> {
  const deadline = Date.now() + DB_WAIT_TIMEOUT_MS
  let attempt = 0
  while (!isShuttingDown) {
    attempt++
    try {
      await prisma.$queryRaw`SELECT 1`
      lastDbOkAt = Date.now()
      logger.info(`[WORKER] PostgreSQL connection OK (attempt ${attempt})`)
      return
    } catch (error: any) {
      if (Date.now() > deadline) {
        throw new Error(
          `[WORKER] FATAL: PostgreSQL not reachable after ${attempt} attempts over ${Math.round(DB_WAIT_TIMEOUT_MS / 1000)}s: ${error?.message}`
        )
      }
      logger.error("[WORKER] PostgreSQL not reachable yet — retrying", {
        attempt,
        error: error?.message,
      })
      await sleep(DB_WAIT_RETRY_MS)
    }
  }
}

/**
 * Stop claiming new jobs and wait (bounded) for in-flight jobs to finish.
 * Does NOT exit the process and does NOT disconnect Prisma — safe to call
 * from inside a web server process and from tests.
 */
export async function stopJobProcessor(): Promise<void> {
  isShuttingDown = true
  const deadline = Date.now() + SHUTDOWN_GRACE_MS
  while (activeJobs > 0 && Date.now() < deadline) {
    await sleep(50)
  }
  loopRunning = false
}

/**
 * Process-level shutdown (SIGTERM/SIGINT): drain jobs, close resources, exit.
 * In internal mode this is the whole application shutting down — draining
 * first lets in-flight jobs finish instead of stranding them in PROCESSING
 * (they would still be stale-recovered after a restart, but draining is
 * cleaner).
 */
async function processShutdown(signal: string): Promise<void> {
  if (shutdownStarted) return
  shutdownStarted = true
  isShuttingDown = true
  logger.info(`[WORKER] ${signal} received`)
  logger.info("[WORKER] Stopping new job processing")

  const deadline = Date.now() + SHUTDOWN_GRACE_MS
  while (activeJobs > 0 && Date.now() < deadline) {
    logger.info(`[WORKER] Waiting for active jobs (${activeJobs} in flight)...`)
    await sleep(500)
  }

  logger.info("[WORKER] Shutdown complete")
  try {
    if (healthServer) healthServer.close()
  } catch {
    // ignore
  }
  try {
    await prisma.$disconnect()
  } catch {
    // ignore — we are exiting anyway
  }
  process.exit(0)
}

function registerSignalHandlers() {
  if (signalHandlersRegistered) return
  signalHandlersRegistered = true
  process.on("SIGTERM", () => void processShutdown("SIGTERM"))
  process.on("SIGINT", () => void processShutdown("SIGINT"))
}

export interface StartWorkerOptions {
  /**
   * "standalone": dedicated worker process — owns its health server,
   * crash handlers, and exits non-zero on unrecoverable startup failure.
   * "internal": runs inside the Next.js web server process — never blocks or
   * terminates HTTP serving; startup failures are retried periodically.
   */
  mode?: "internal" | "standalone"
  pollIntervalMs?: number
}

/**
 * Start the job processor. Exactly ONE instance runs per process — repeated
 * calls are no-ops that log a warning (no duplicate polling loops).
 * Resolves when the polling loop exits (after stopJobProcessor/shutdown).
 */
export async function startWorker(options: StartWorkerOptions = {}): Promise<void> {
  const mode = options.mode ?? "standalone"
  const pollIntervalMs = options.pollIntervalMs ?? BASE_POLL_INTERVAL

  if (loopRunning) {
    logger.warn("[WORKER] Job processor already running in this process — not starting a duplicate", {
      workerId: WORKER_ID,
    })
    return
  }
  loopRunning = true
  isShuttingDown = false
  shutdownStarted = false

  try {
    logger.info(`[WORKER] Starting Clinot background job processor (${mode})...`, {
      workerId: WORKER_ID,
      pid: process.pid,
    })

    // 1. Validate required environment (clear message, fail fast)
    requireWorkerEnv()
    logger.info("[WORKER] Environment validated")

    // 2. Wait for PostgreSQL (bounded; caller decides failure behavior)
    logger.info("[WORKER] Connecting to PostgreSQL...")
    await verifyDatabaseConnection()

    logger.info("[WORKER] Job processor initialized")

    if (mode === "standalone") {
      // Dedicated process extras: embedded health endpoint + crash-proofing.
      // Internal mode skips these: the web service owns /api/health and the
      // platform owns process-level crash handling.
      startHealthServer()
      process.on("uncaughtException", (err) => {
        logger.error("[WORKER] Uncaught exception in worker process (continuing):", {
          error: err.message,
          stack: err.stack,
        })
      })
      process.on("unhandledRejection", (reason) => {
        logger.error("[WORKER] Unhandled rejection in worker process (continuing):", {
          reason: String(reason),
        })
      })
    }

    // 3. Graceful shutdown on platform signals (both modes)
    registerSignalHandlers()

    logger.info("[WORKER] Polling for jobs...", { baseIntervalMs: pollIntervalMs })

    // 4. Continuous polling loop with error backoff — runs until shutdown.
    while (!isShuttingDown) {
      await processJobs()
      const interval =
        consecutivePollErrors > 0
          ? Math.min(pollIntervalMs * Math.pow(2, consecutivePollErrors), MAX_POLL_INTERVAL)
          : pollIntervalMs
      await sleep(interval)
    }

    logger.info("[WORKER] Polling loop exited")
    loopRunning = false
  } catch (err: any) {
    loopRunning = false
    if (mode === "internal") {
      // NEVER take the HTTP server down for a processor startup failure —
      // log loudly and retry periodically until the environment recovers.
      logger.error(
        `[WORKER] Internal job processor startup failed — will retry in ${INTERNAL_STARTUP_RETRY_MS / 1000}s (HTTP server is unaffected)`,
        { error: err?.message }
      )
      const retry = setTimeout(() => {
        if (!loopRunning && !isShuttingDown) {
          void startWorker({ mode: "internal", pollIntervalMs })
        }
      }, INTERNAL_STARTUP_RETRY_MS)
      retry.unref?.()
      return
    }
    logger.error("[WORKER] Fatal error in worker startup:", { error: err?.message })
    try {
      await prisma.$disconnect()
    } catch {
      // ignore
    }
    process.exit(1)
  }
}

/**
 * Entry point for the integrated (single web service) architecture.
 * Called from src/instrumentation.ts when the Next.js server boots.
 * Fire-and-forget by design: the HTTP server is never blocked.
 */
export function startInternalJobProcessor(): void {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.CLINOT_DISABLE_INTERNAL_WORKER === "true") {
    logger.info("[WORKER] CLINOT_DISABLE_INTERNAL_WORKER=true — internal job processor disabled")
    return
  }
  // A dedicated standalone worker deployment owns job processing; do not
  // create a second polling loop alongside it.
  if (process.env.WORKER_MODE === "true") {
    logger.info("[WORKER] WORKER_MODE=true — dedicated worker handles jobs; internal processor skipped")
    return
  }
  const isTestEnv =
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    typeof (globalThis as any).describe === "function"
  if (isTestEnv) return

  void startWorker({ mode: "internal" })
}

// ─── Standalone Entry Point ────────────────────────────────────────────────────
// `npm run worker` runs this module directly as a dedicated worker process.
// Normal deployments do NOT use this path — the web server starts the
// internal processor via instrumentation. Kept for explicit standalone
// deployments and local debugging.
const isTestEnv =
  process.env.NODE_ENV === "test" ||
  process.env.VITEST === "true" ||
  typeof (globalThis as any).describe === "function"

if (!isTestEnv) {
  void startWorker({ mode: "standalone" })
}
