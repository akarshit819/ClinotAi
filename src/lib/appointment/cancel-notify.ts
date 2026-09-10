/**
 * Owner-cancelled appointment → patient WhatsApp notification.
 *
 * When a clinic owner cancels an appointment from the dashboard, the
 * patient is notified via Clinot AI on WhatsApp. The caller (PATCH
 * /api/appointments) invokes this ONLY after the cancellation write
 * succeeds and ONLY on a transition into "cancelled".
 *
 * Guarantees:
 *   - never sent before the DB write (caller-side ordering);
 *   - never duplicated: the outbound job carries the deterministic
 *     idempotency key `appointment-cancel-<appointmentId>`, so retries
 *     and double-clicks reuse the same job instead of sending twice;
 *   - clinic phone is read live from the clinic record (never hardcoded);
 *   - notification failures never fail the cancellation (logged only).
 */

import { prisma } from "@/lib/db"
import { logger } from "@/lib/logger"
import { createJob } from "@/lib/jobs/queue"
import { getCredentials } from "@/integrations/token-store"
import { createTextPayload } from "@/integrations/whatsapp/api"
import { formatDateHumanLong, formatTimeHuman } from "@/messaging/ai/appointment-state"

export interface CancelNotifyRequest {
  clinicId: string
  appointmentId: string
  patientName?: string | null
  phone?: string | null
  preferredDate?: string | null
  preferredTime?: string | null
}

export type CancelNotifyResult =
  | { sent: true; jobId: string }
  | { sent: false; reason: "already_queued" | "no_patient_phone" | "no_whatsapp" | "error"; detail?: string }

export function buildCancellationMessage(input: {
  patientName?: string | null
  preferredDate?: string | null
  preferredTime?: string | null
  clinicPhone?: string | null
}): string {
  const lines = ["Your appointment has been cancelled by the clinic.", ""]
  if (input.preferredDate) lines.push(`Date: ${formatDateHumanLong(input.preferredDate)}`)
  if (input.preferredTime) lines.push(`Time: ${formatTimeHuman(input.preferredTime)}`)
  lines.push(
    "",
    input.clinicPhone
      ? `For more information, please contact us at ${input.clinicPhone}.`
      : "For more information, please contact the clinic directly.",
  )
  return lines.join("\n")
}

export async function notifyAppointmentCancelled(req: CancelNotifyRequest): Promise<CancelNotifyResult> {
  const { clinicId, appointmentId } = req
  const to = req.phone?.trim() || ""
  if (!to) {
    logger.warn("[APPOINTMENT] Cancellation notice skipped — no patient phone", { clinicId, appointmentId })
    return { sent: false, reason: "no_patient_phone" }
  }

  try {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { phone: true },
    })
    const creds = await getCredentials(clinicId, "whatsapp")
    const phoneNumberId = creds?.metadata?.phoneNumberId || ""
    if (!creds?.accessToken || !phoneNumberId) {
      logger.warn("[APPOINTMENT] Cancellation notice skipped — WhatsApp not connected", {
        clinicId,
        appointmentId,
      })
      return { sent: false, reason: "no_whatsapp" }
    }

    const text = buildCancellationMessage({
      patientName: req.patientName,
      preferredDate: req.preferredDate,
      preferredTime: req.preferredTime,
      clinicPhone: clinic?.phone || null,
    })
    const payload = createTextPayload(to, text)

    // Deterministic idempotency key: a retry or double-click reuses the
    // same job instead of queueing (and sending) a second message.
    const idempotencyKey = `appointment-cancel-${appointmentId}`
    const alreadyQueued = await prisma.job.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    })
    if (alreadyQueued) {
      logger.info("[APPOINTMENT] Cancellation notice already queued — skipping duplicate", {
        clinicId,
        appointmentId,
        jobId: alreadyQueued.id,
      })
      return { sent: false, reason: "already_queued" }
    }
    let jobId: string
    try {
      jobId = await createJob(
        "SEND_WHATSAPP_MESSAGE",
        { clinicId, to, payload, phoneNumberId },
        { priority: 10, maxAttempts: 3, idempotencyKey },
      )
    } catch (e) {
      // Lost a create race with a concurrent cancel: the other writer's
      // job is the single notification. Never send a second one.
      const err = e as { code?: string }
      if (err?.code === "P2002") {
        logger.info("[APPOINTMENT] Cancellation notice race lost — single notification kept", {
          clinicId,
          appointmentId,
        })
        return { sent: false, reason: "already_queued" }
      }
      throw e
    }
    logger.info("[APPOINTMENT] Cancellation notice enqueued for delivery", {
      clinicId,
      appointmentId,
      to,
      jobId,
    })
    return { sent: true, jobId }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    logger.error("[APPOINTMENT] Cancellation notice failed to enqueue", { clinicId, appointmentId, error: detail })
    return { sent: false, reason: "error", detail }
  }
}
