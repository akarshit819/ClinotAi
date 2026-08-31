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

const WORKER_ID = `worker-${process.pid}-${Date.now()}`
const BASE_POLL_INTERVAL = 2000
const MAX_POLL_INTERVAL = 30000
const STALE_RECOVERY_INTERVAL = 30_000
// The worker waits this long for PostgreSQL to become reachable at boot
// (the Web service may still be migrating). After the cap the failure is
// treated as unrecoverable and the process exits non-zero.
const DB_WAIT_TIMEOUT_MS = 5 * 60 * 1000
const DB_WAIT_RETRY_MS = 2000
// The health endpoint reports the DB as unhealthy if no query succeeded
// within this window. Polling touches the DB every few seconds, so a healthy
// worker always refreshes this timestamp.
const DB_HEALTH_WINDOW_MS = 60_000
const SHUTDOWN_GRACE_MS = 30_000

let isShuttingDown = false
let shutdownStarted = false
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
 * Fail fast — with an unmistakable message — on configuration the worker
 * genuinely cannot run without. Web-only variables (JWT_SECRET, AI keys,
 * WhatsApp tokens, NEXT_PUBLIC_APP_URL) are intentionally NOT required:
 * credentials for AI/WhatsApp are resolved per job, and a missing credential
 * fails that job with retries, not the worker process.
 */
function requireWorkerEnv(): void {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error(
      "[WORKER] FATAL: DATABASE_URL is not set. The worker shares the Web service's PostgreSQL database — set the same DATABASE_URL on the worker service."
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
    database: dbOk ? "ok" : "unreachable",
    activeJobs,
    consecutivePollErrors,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  }
}

async function processJob(job: any): Promise<void> {
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
    // One failed job must never kill the worker: record the failure for the
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

async function processJobs() {
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
      logger.error("[WORKER] Stale job recovery failed — worker will continue", {
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
      if (!claimed.success) continue // another worker got it first

      logger.info(`[JOB] Claimed ${job.id} (${job.type})`)
      try {
        await processJob(claimed.job!)
      } catch (error: any) {
        // Already logged + recorded in processJob. The loop continues.
        logger.error(`[JOB] Job execution error for ${job.id} — worker continues`, {
          jobId: job.id,
          error: error?.message,
        })
      }
    }
  } catch (error: any) {
    consecutivePollErrors++
    // Transient database/network problems must never kill the worker —
    // log, back off, and try again on the next poll.
    logger.error("[WORKER] Polling error — worker will continue", {
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
      // not kill the worker loop.
      server.on("error", (err: any) => {
        logger.error("[WORKER] Health server error — worker continues without health endpoint", {
          error: err?.message,
        })
      })
      server.listen(Number(healthPort), () => {
        healthServer = server
        logger.info(`[WORKER] Health server started on port ${healthPort}`)
      })
    })
  } catch (err: any) {
    logger.error("[WORKER] Could not start health server — worker continues", {
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

async function shutdown(signal: string, exitCode: number): Promise<void> {
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
  process.exit(exitCode)
}

async function startWorker() {
  logger.info("[WORKER] Starting Clinot background worker...", { workerId: WORKER_ID, pid: process.pid })

  // 1. Validate required environment (fail fast, clear message)
  requireWorkerEnv()
  logger.info("[WORKER] Environment validated")

  // 2. Wait for PostgreSQL (the Web service may still be applying migrations)
  logger.info("[WORKER] Connecting to PostgreSQL...")
  await verifyDatabaseConnection()

  logger.info("[WORKER] Worker initialized")

  // 3. Health endpoint (independent of the job loop; never kills the worker)
  startHealthServer()

  // 4. Process safety handlers to prevent crash loops on stray async errors
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

  // 5. Graceful shutdown — drain active jobs, close resources, exit cleanly
  process.on("SIGTERM", () => void shutdown("SIGTERM", 0))
  process.on("SIGINT", () => void shutdown("SIGINT", 0))

  logger.info("[WORKER] Polling for jobs...", { baseIntervalMs: BASE_POLL_INTERVAL })

  // 6. Continuous polling loop with error backoff — runs forever until a
  //    shutdown signal arrives.
  while (!isShuttingDown) {
    await processJobs()
    const interval =
      consecutivePollErrors > 0
        ? Math.min(BASE_POLL_INTERVAL * Math.pow(2, consecutivePollErrors), MAX_POLL_INTERVAL)
        : BASE_POLL_INTERVAL
    await sleep(interval)
  }
}

export { startWorker, processJobs, processJob }

// ─── Entry Point ───────────────────────────────────────────────────────────────
// Automatically run startWorker() in non-test runtime environments
const isTestEnv =
  process.env.NODE_ENV === "test" ||
  process.env.VITEST === "true" ||
  typeof (globalThis as any).describe === "function"

if (!isTestEnv) {
  startWorker().catch(async (err) => {
    logger.error("[WORKER] Fatal error in worker startup:", { error: err.message })
    try {
      await prisma.$disconnect()
    } catch {
      // ignore
    }
    process.exit(1)
  })
}
