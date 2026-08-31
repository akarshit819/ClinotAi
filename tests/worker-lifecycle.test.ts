import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Worker lifecycle tests: the worker must survive transient DB errors, bad
 * jobs, WhatsApp failures, and must correctly implement claim / retry /
 * backoff / dead-letter / stale-recovery semantics. The worker module must
 * also NOT auto-start when imported from a test environment.
 */

type JobRow = {
  id: string
  clinicId: string
  type: string
  payload: any
  status: string
  priority: number
  attempts: number
  maxAttempts: number
  lastError?: string | null
  scheduledAt: Date
  startedAt?: Date | null
  completedAt?: Date | null
  failedAt?: Date | null
  idempotencyKey?: string | null
}

const jobs = new Map<string, JobRow>()
let failNextFindMany = false

function notFoundError(): Error {
  const e: any = new Error("Record to update not found")
  e.code = "P2025"
  return e
}

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    job: {
      create: vi.fn(async ({ data }: any) => {
        const row: JobRow = {
          id: data.id ?? `job-${jobs.size + 1}-${Math.random().toString(36).slice(2, 8)}`,
          clinicId: data.clinicId,
          type: data.type,
          payload: data.payload,
          status: data.status ?? "PENDING",
          priority: data.priority ?? 0,
          attempts: data.attempts ?? 0,
          maxAttempts: data.maxAttempts ?? 3,
          lastError: data.lastError ?? null,
          scheduledAt: data.scheduledAt ?? new Date(),
          startedAt: null,
          completedAt: null,
          failedAt: null,
          idempotencyKey: data.idempotencyKey ?? null,
        }
        jobs.set(row.id, row)
        return { ...row }
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.idempotencyKey) {
          const row = Array.from(jobs.values()).find((j) => j.idempotencyKey === where.idempotencyKey)
          return row ? { ...row } : null
        }
        const row = jobs.get(where.id)
        return row ? { ...row } : null
      }),
      findMany: vi.fn(async ({ where }: any) => {
        if (failNextFindMany) {
          failNextFindMany = false
          throw new Error("Connection terminated unexpectedly")
        }
        const rows = Array.from(jobs.values()).filter((j) => {
          if (where.status && j.status !== where.status) return false
          if (where.scheduledAt?.lte && new Date(j.scheduledAt) > new Date(where.scheduledAt.lte)) return false
          if (where.startedAt?.lt && !(j.startedAt && new Date(j.startedAt) < new Date(where.startedAt.lt))) return false
          return true
        })
        return rows.map((r) => ({ ...r }))
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = jobs.get(where.id)
        if (!row) throw notFoundError()
        // Extended where unique semantics: conditional status match is atomic
        if (where.status && row.status !== where.status) throw notFoundError()
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === "object" && "increment" in value) {
            (row as any)[key] = ((row as any)[key] ?? 0) + value.increment
          } else {
            (row as any)[key] = value
          }
        }
        return { ...row }
      }),
      count: vi.fn(async () => 0),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}))

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock("@/messaging/pipeline", () => ({
  processIncomingMessage: vi.fn().mockResolvedValue({ conversationId: "conv-1", requiresClinic: false }),
}))

vi.mock("@/integrations/whatsapp/delivery", () => ({
  sendWithRateLimit: vi.fn(),
}))

vi.mock("@/integrations/token-store", () => ({
  getCredentials: vi.fn().mockResolvedValue({
    accessToken: "mock-token",
    metadata: { phoneNumberId: "pnid-1", wabaId: "waba-1" },
  }),
}))

import {
  claimJob,
  completeJob,
  failJob,
  recoverStaleJobs,
  createJob,
} from "@/lib/jobs/queue"
import { processJob, processJobs, getHealthSnapshot } from "@/lib/jobs/worker"
import { sendWithRateLimit } from "@/integrations/whatsapp/delivery"

function seedJob(overrides: Partial<JobRow> = {}): JobRow {
  const row: JobRow = {
    id: `job-${jobs.size + 1}-${Math.random().toString(36).slice(2, 8)}`,
    clinicId: "clinic-1",
    type: "TEST_TYPE",
    payload: { clinicId: "clinic-1" },
    status: "PENDING",
    priority: 0,
    attempts: 0,
    maxAttempts: 3,
    scheduledAt: new Date(Date.now() - 1000),
    startedAt: null,
    completedAt: null,
    failedAt: null,
    ...overrides,
  }
  jobs.set(row.id, row)
  return row
}

beforeEach(() => {
  jobs.clear()
  failNextFindMany = false
  vi.mocked(sendWithRateLimit).mockReset()
})

describe("Queue claim semantics", () => {
  it("claims a PENDING job exactly once — the second claim fails", async () => {
    const job = seedJob()
    const first = await claimJob(job.id, "worker-a")
    expect(first.success).toBe(true)
    expect(jobs.get(job.id)!.status).toBe("PROCESSING")
    expect(jobs.get(job.id)!.attempts).toBe(1)

    const second = await claimJob(job.id, "worker-b")
    expect(second.success).toBe(false)
    expect(jobs.get(job.id)!.attempts).toBe(1) // not incremented again
  })

  it("completeJob marks the job COMPLETED", async () => {
    const job = seedJob()
    await claimJob(job.id, "worker-a")
    await completeJob(job.id)
    expect(jobs.get(job.id)!.status).toBe("COMPLETED")
  })
})

describe("Retry / backoff / dead-letter policy", () => {
  it("first failure requeues the job with attempts counted once and short backoff", async () => {
    const job = seedJob({ maxAttempts: 3 })
    await claimJob(job.id, "worker-a") // attempts -> 1
    await failJob(job.id, "boom", 3)

    const row = jobs.get(job.id)!
    expect(row.status).toBe("PENDING")
    expect(row.attempts).toBe(1) // incremented exactly once per attempt
    expect(row.lastError).toBe("boom")
    // Backoff for the first retry is ~1s
    const delayMs = new Date(row.scheduledAt).getTime() - Date.now()
    expect(delayMs).toBeGreaterThan(0)
    expect(delayMs).toBeLessThanOrEqual(2000)
  })

  it("exhausted attempts dead-letter the job instead of retrying forever", async () => {
    const job = seedJob({ maxAttempts: 3 })
    await claimJob(job.id, "worker-a") // attempts -> 1
    await failJob(job.id, "boom", 3)
    await claimJob(job.id, "worker-a") // attempts -> 2
    await failJob(job.id, "boom", 3)
    await claimJob(job.id, "worker-a") // attempts -> 3
    await failJob(job.id, "boom", 3)

    const row = jobs.get(job.id)!
    expect(row.status).toBe("DEAD_LETTER")
    expect(row.attempts).toBe(3)
  })
})

describe("Stale PROCESSING job recovery", () => {
  it("requeues a stale job that still has attempts remaining", async () => {
    const job = seedJob({
      status: "PROCESSING",
      attempts: 1,
      maxAttempts: 3,
      startedAt: new Date(Date.now() - 15 * 60 * 1000),
    })
    const recovered = await recoverStaleJobs(10)
    expect(recovered).toBe(1)
    expect(jobs.get(job.id)!.status).toBe("PENDING")
  })

  it("dead-letters a stale job that has exhausted its attempts", async () => {
    const job = seedJob({
      status: "PROCESSING",
      attempts: 3,
      maxAttempts: 3,
      startedAt: new Date(Date.now() - 15 * 60 * 1000),
    })
    const recovered = await recoverStaleJobs(10)
    expect(recovered).toBe(1)
    expect(jobs.get(job.id)!.status).toBe("DEAD_LETTER")
  })

  it("ignores recently started PROCESSING jobs (still running elsewhere)", async () => {
    seedJob({
      status: "PROCESSING",
      attempts: 1,
      startedAt: new Date(Date.now() - 1000),
    })
    const recovered = await recoverStaleJobs(10)
    expect(recovered).toBe(0)
  })
})

describe("Worker resilience", () => {
  it("a transient database error during polling does NOT throw or kill the worker", async () => {
    seedJob()
    failNextFindMany = true
    await expect(processJobs()).resolves.toBeUndefined()

    // The worker is still alive: the next poll processes the queue normally.
    await expect(processJobs()).resolves.toBeUndefined()
    const remaining = Array.from(jobs.values()).filter((j) => j.status === "PENDING")
    expect(remaining.length).toBe(0) // job was claimed and completed
  })

  it("an empty queue does not cause an error or exit", async () => {
    await expect(processJobs()).resolves.toBeUndefined()
  })

  it("an unknown job type is completed (skipped), not fatal", async () => {
    const job = seedJob({ type: "SOMETHING_NEW" })
    await claimJob(job.id, "worker-a")
    await expect(processJob({ ...jobs.get(job.id)! })).resolves.toBeUndefined()
    expect(jobs.get(job.id)!.status).toBe("COMPLETED")
  })

  it("a WhatsApp delivery failure requeues the job for retry instead of losing it", async () => {
    const job = seedJob({
      type: "SEND_WHATSAPP_MESSAGE",
      payload: {
        clinicId: "clinic-1",
        to: "15550001111",
        payload: { messaging_product: "whatsapp", type: "text", text: { body: "hi" } },
        phoneNumberId: "pnid-1",
      },
      maxAttempts: 3,
    })
    vi.mocked(sendWithRateLimit).mockResolvedValue({
      success: false,
      error: "rate limit hit",
      statusCode: 429,
    })

    await claimJob(job.id, "worker-a")
    await expect(processJob({ ...jobs.get(job.id)! })).rejects.toThrow("WhatsApp API send failed")

    const row = jobs.get(job.id)!
    expect(row.status).toBe("PENDING") // requeued by the retry policy
    expect(row.attempts).toBe(1)
    expect(row.lastError).toContain("WhatsApp API send failed")
  })

  it("a successful WhatsApp send completes the job", async () => {
    const job = seedJob({
      type: "SEND_WHATSAPP_MESSAGE",
      payload: {
        clinicId: "clinic-1",
        to: "15550001111",
        payload: { messaging_product: "whatsapp", type: "text", text: { body: "hi" } },
        phoneNumberId: "pnid-1",
      },
    })
    vi.mocked(sendWithRateLimit).mockResolvedValue({
      success: true,
      messageId: "wamid.test",
    })

    await claimJob(job.id, "worker-a")
    await expect(processJob({ ...jobs.get(job.id)! })).resolves.toBeUndefined()
    expect(jobs.get(job.id)!.status).toBe("COMPLETED")
  })
})

describe("Health reporting", () => {
  it("reports the database as reachable after a successful poll", async () => {
    seedJob()
    await processJobs() // successful poll touches the DB
    const snapshot = getHealthSnapshot()
    expect(snapshot.database).toBe("ok")
    expect(snapshot.role).toBe("worker")
  })
})

describe("Worker entry point safety", () => {
  it("importing the worker module in a test environment does not start the polling loop", async () => {
    // If the module auto-started, this import would hang the test process.
    const mod = await import("@/lib/jobs/worker")
    expect(typeof mod.startWorker).toBe("function")
    expect(typeof mod.processJobs).toBe("function")
    expect(typeof mod.processJob).toBe("function")
  })

  it("createJob is idempotent when an idempotencyKey is provided", async () => {
    const a = await createJob("SEND_WHATSAPP_MESSAGE", { clinicId: "clinic-1" } as any, {
      idempotencyKey: "wa-fixed-key-1",
    })
    const b = await createJob("SEND_WHATSAPP_MESSAGE", { clinicId: "clinic-1" } as any, {
      idempotencyKey: "wa-fixed-key-1",
    })
    expect(a).toBe(b)
    expect(Array.from(jobs.values()).filter((j) => j.idempotencyKey === "wa-fixed-key-1").length).toBe(1)
  })
})
