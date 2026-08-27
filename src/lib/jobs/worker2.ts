import { prisma } from "@/lib/db"
import { logger } from "@/lib/logger"
import { 
  getPendingJobs, 
  claimJob, 
  completeJob, 
  failJob,
  getJob 
} from "./queue"
import { processIncomingMessage } from "@/messaging/pipeline"
import { sendWithRateLimit } from "@/integrations/whatsapp/delivery"
import { getCredentials } from "@/integrations/token-store"
import { getConnector } from "@/messaging/connectors/registry"
import type { WhatsAppConfig } from "@/integrations/whatsapp/types"

const WORKER_ID = `worker-${process.pid}-${Date.now()}`
const POLL_INTERVAL = 2000
const BATCH_SIZE = 5

let isShuttingDown = false

async function processJob(job: any): Promise<void> {
  const startTime = Date.now()
  
  try {
    logger.info("Processing job", { jobId: job.id, type: job.type, clinicId: job.clinicId })

    switch (job.type) {
      case "PROCESS_INBOUND_MESSAGE": {
        const { clinicId, message } = job.payload
        
        const result = await processIncomingMessage(clinicId, message)
        
        if (!result.requiresClinic && result.response) {
        }
        break
      }

      case "SEND_WHATSAPP_MESSAGE": {
        const { clinicId, to, payload, phoneNumberId } = job.payload
        
        const credentials = await getCredentials(clinicId, "whatsapp")
        if (!credentials) {
          throw new Error("No WhatsApp credentials found")
        }

        const metadata = credentials.metadata || {}
        const config: any = {
          accessToken: credentials.accessToken,
          phoneNumberId: metadata.phoneNumberId || phoneNumberId,
          wabaId: metadata.wabaId,
          businessId: metadata.businessId,
        }

        await sendWithRateLimit(config, job.payload.to, job.payload.payload)
        break
      }

      case "PROCESS_APPOINTMENT_BOOKING": {
        break
      }

      case "SEND_APPOINTMENT_NOTIFICATION": {
        break
      }

      default:
        logger.warn("Unknown job type", { jobId: job.id, type: job.type })
    }

    await completeJob(job.id)
    logger.info("Job completed", { jobId: job.id, type: job.type, duration: Date.now() - startTime })
  } catch (error: any) {
    logger.error("Job failed", { jobId: job.id, error: error.message })
    const jobRecord = await getJob(job.id)
    if (jobRecord) {
      await failJob(job.id, error.message, jobRecord.maxAttempts)
    }
    throw error
  }
}

async function processJobs() {
  if (isShuttingDown) return

  try {
    const clinics = await prisma.clinic.findMany({
      where: { isOnboarded: true },
      select: { id: true },
    })

    for (const clinic of clinics) {
      const jobs = await getPendingJobs(clinic.id, 10)
      
      for (const job of jobs) {
        if (isShuttingDown) break
        
        const claimed = await claimJob(job.id, WORKER_ID)
        if (!claimed.success) continue

        try {
          await processJob(claimed.job!)
        } catch (error: any) {
          logger.error("Job processing failed", { jobId: job.id, error: error.message })
        }
      }
    }
  } catch (error) {
    logger.error("Error in job processing loop", { error: error instanceof Error ? error.message : String(error) })
  }
}

async function runWorkerLoop() {
  while (!isShuttingDown) {
    await processJobs()
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
}

async function startWorker() {
  logger.info("Starting job worker", { workerId: WORKER_ID })

  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, shutting down gracefully")
    isShuttingDown = true
    process.exit(0)
  })

  process.on("SIGINT", async () => {
    logger.info("SIGINT received, shutting down gracefully")
    isShuttingDown = true
    process.exit(0)
  });

  await runWorkerLoop()
}

export { startWorker, processJobs, processJob }