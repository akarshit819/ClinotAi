import { prisma } from "@/lib/db"
import { logger } from "@/lib/logger"

export type JobType = 
  | "PROCESS_INBOUND_MESSAGE"
  | "PROCESS_AI_RESPONSE"
  | "SEND_WHATSAPP_MESSAGE"
  | "PROCESS_WEBHOOK_EVENT"
  | "UPDATE_MESSAGE_STATUS"
  | "SEND_APPOINTMENT_NOTIFICATION"
  | "PROCESS_APPOINTMENT_BOOKING"
  | "SEND_APPOINTMENT_REMINDER"
  | "SEND_APPOINTMENT_CONFIRMATION"

export type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD_LETTER"

export interface JobPayload {
  clinicId: string
  [key: string]: any
}

export interface JobOptions {
  priority?: number
  maxAttempts?: number
  scheduledAt?: Date
  idempotencyKey?: string
}

export interface JobResult {
  success: boolean
  error?: string
}

const DEFAULT_MAX_ATTEMPTS = 3
const RETRY_DELAYS = [1000, 5000, 30000] // 1s, 5s, 30s

export async function createJob(
  type: JobType,
  payload: JobPayload,
  options: JobOptions = {}
): Promise<string> {
  const {
    priority = 0,
    maxAttempts = 3,
    scheduledAt = new Date(),
    idempotencyKey,
  } = options

  // If idempotency key provided, check for existing job
  if (idempotencyKey) {
    const existing = await prisma.job.findUnique({
      where: { idempotencyKey },
      select: { id: true, status: true },
    })
    if (existing) {
      return existing.id
    }
  }

  const job = await prisma.job.create({
    data: {
      clinicId: payload.clinicId,
      type,
      payload,
      status: "PENDING",
      priority,
      maxAttempts,
      scheduledAt,
      idempotencyKey,
    },
  })

  return job.id
}

export async function getJob(id: string) {
  return prisma.job.findUnique({
    where: { id },
  })
}

export async function getPendingJobs(
  clinicId: string,
  limit = 10
) {
  const now = new Date()
  return prisma.job.findMany({
    where: {
      clinicId,
      status: "PENDING",
      scheduledAt: { lte: new Date() },
    },
    orderBy: [{ priority: "desc" }, { scheduledAt: "asc" }],
    take: limit,
  })
}

export async function claimJob(
  jobId: string,
  workerId: string
): Promise<{ success: boolean; job?: any }> {
  try {
    const job = await prisma.job.update({
      where: {
        id: jobId,
        status: "PENDING",
      },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        startedAt: new Date(),
      },
    })
    return { success: true, job }
  } catch (error) {
    // Job was already claimed or doesn't exist
    return { success: false }
  }
}

export async function completeJob(jobId: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  })
}

export async function failJob(
  jobId: string,
  error: string,
  maxAttempts: number
): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId } })
  if (!job) return

  const attempts = job.attempts + 1
  const isLastAttempt = attempts >= job.maxAttempts

  if (isLastAttempt) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "DEAD_LETTER",
        failedAt: new Date(),
        lastError: error,
        attempts,
      },
    })
  } else {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "PENDING",
        lastError: error,
        attempts,
        // Exponential backoff: 1s, 5s, 30s
        scheduledAt: new Date(Date.now() + [1000, 5000, 30000][Math.min(job.attempts, 2)]),
      },
    })
  }
}

export async function getJobStats(clinicId: string) {
  const [pending, processing, completed, failed, deadLetter] = await Promise.all([
    prisma.job.count({ where: { clinicId, status: "PENDING" } }),
    prisma.job.count({ where: { clinicId, status: "PROCESSING" } }),
    prisma.job.count({ where: { clinicId, status: "COMPLETED" } }),
    prisma.job.count({ where: { clinicId, status: "FAILED" } }),
    prisma.job.count({ where: { clinicId, status: "DEAD_LETTER" } }),
  ])

  return { pending, processing, completed, failed, deadLetter }
}

// Cleanup old completed jobs (older than 30 days)
export async function cleanupOldJobs(clinicId: string, olderThanDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
  const result = await prisma.job.deleteMany({
    where: {
      clinicId,
      status: "COMPLETED",
      completedAt: { lt: new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000) },
    },
  })
  return result.count
}