/**
 * Deterministic appointment booking from a READY draft.
 *
 * This module is the ONLY production path that creates WhatsApp-driven
 * appointments. It runs NO LLM: the draft fields were collected by the
 * deterministic state machine and the user explicitly confirmed.
 *
 * Steps:
 *   1. Validate required fields (name, phone, reason, date, time).
 *   2. Duplicate guard: an existing pending/confirmed appointment for the
 *      same clinic + phone + date + time is reused, never duplicated.
 *   3. Resolve or create the patient by phone (clinic-scoped).
 *   4. Pick the first staff provider with a free slot at the requested
 *      time; book atomically via reserveSlot (serializable + P2002).
 *   5. On slot conflict, re-check the duplicate guard to distinguish
 *      "you already booked this" from "someone just took the slot".
 *
 * Only AFTER a successful database write does the caller send a
 * confirmation message. Failures return structured results — never a
 * fake success, never an exception leak to the patient.
 */

import { fromZonedTime } from "date-fns-tz"
import { prisma } from "@/lib/db"
import { logger } from "@/lib/logger"
import { checkSlotAvailability, reserveSlot } from "./availability"
import type { AppointmentDraft } from "@/messaging/ai/appointment-state"

export const BOOKING_SLOT_MINUTES = 30
const ACTIVE_APPOINTMENT_STATUSES = ["pending", "confirmed", "in_progress"]

export interface BookingRequest {
  clinicId: string
  draft: AppointmentDraft
  /** Verified WhatsApp sender number — fallback when the draft has no phone. */
  whatsappPhone?: string
  whatsappName?: string
}

export type BookingResult =
  | {
      ok: true
      appointmentId: string
      patientId: string
      providerName: string
      duplicate: false
    }
  | {
      ok: true
      appointmentId: string
      patientId: string
      providerName: string
      duplicate: true
    }
  | { ok: false; reason: "missing_fields"; missing: string[] }
  | { ok: false; reason: "no_provider" }
  | { ok: false; reason: "slot_taken" }
  | { ok: false; reason: "error"; error: string }

function missingFields(draft: AppointmentDraft, phone: string | undefined): string[] {
  const missing: string[] = []
  if (!draft.patientName?.trim()) missing.push("name")
  if (!phone?.trim()) missing.push("phone")
  if (!draft.reason?.trim()) missing.push("reason")
  if (!draft.preferredDate) missing.push("date")
  if (!draft.preferredTime) missing.push("time")
  return missing
}

export async function bookAppointmentFromDraft(req: BookingRequest): Promise<BookingResult> {
  const { clinicId, draft } = req
  const phone = draft.patientPhone?.trim() || req.whatsappPhone?.trim() || ""
  const name = draft.patientName?.trim() || req.whatsappName?.trim() || "Patient"
  const reason = draft.reason?.trim() || ""
  const date = draft.preferredDate || ""
  const time = draft.preferredTime || ""

  const missing = missingFields(draft, phone || undefined)
  if (missing.length > 0) {
    logger.warn("[APPOINTMENT] Booking refused — missing fields", { clinicId, missing })
    return { ok: false, reason: "missing_fields", missing }
  }

  logger.info("[APPOINTMENT] APPOINTMENT_CREATE_STARTED", {
    clinicId,
    date,
    time,
    hasName: Boolean(name),
  })

  try {
    // 1) Duplicate guard BEFORE creating anything: same clinic + phone +
    //    date + time already booked → reuse, never duplicate. This covers
    //    double-tap "confirm", webhook retries, and worker redelivery.
    const existing = await prisma.appointment.findFirst({
      where: {
        clinicId,
        phone,
        preferredDate: date,
        preferredTime: time,
        status: { in: ACTIVE_APPOINTMENT_STATUSES },
      },
      select: { id: true, patientId: true, doctor: true },
    })
    if (existing) {
      logger.info("[APPOINTMENT] Duplicate confirmation absorbed — reusing appointment", {
        clinicId,
        appointmentId: existing.id,
      })
      const providerName = await resolveProviderName(existing.doctor)
      return {
        ok: true,
        appointmentId: existing.id,
        patientId: existing.patientId || "",
        providerName,
        duplicate: true,
      }
    }

    // 2) Resolve or create the patient by verified phone (clinic-scoped).
    let patient = await prisma.patient.findFirst({
      where: { clinicId, phone },
      select: { id: true, name: true },
    })
    if (!patient) {
      const created = await prisma.patient.create({
        data: { clinicId, name, phone },
        select: { id: true, name: true },
      })
      patient = created
      logger.info("[APPOINTMENT] Patient created for booking", { clinicId, patientId: created.id })
    } else if (!patient.name && name) {
      await prisma.patient.update({ where: { id: patient.id }, data: { name } })
    }

    // 3) Pick the first staff provider free at the requested slot.
    const providers = await prisma.user.findMany({
      where: {
        clinicId,
        role: { name: { in: ["owner", "admin", "staff"] } },
        isActive: true,
      },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    })
    if (providers.length === 0) {
      logger.error("[APPOINTMENT] APPOINTMENT_CREATE_FAILED — no active providers", { clinicId })
      return { ok: false, reason: "no_provider" }
    }

    // Timezone-safe: interpret the wall clock in the CLINIC's timezone
    // (never the server's). `new Date("2026-09-12T16:00:00")` parses in
    // server-local time and silently shifts the stored slot on servers
    // outside the clinic timezone (production incident class).
    const clinicTzRow = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { timezone: true },
    })
    const clinicTimezone = clinicTzRow?.timezone || "America/New_York"
    let startTime: Date
    try {
      startTime = fromZonedTime(`${date} ${time}`, clinicTimezone)
    } catch {
      logger.error("[APPOINTMENT] APPOINTMENT_CREATE_FAILED — invalid date/time", { clinicId, date, time })
      return { ok: false, reason: "error", error: "invalid_datetime" }
    }
    const endTime = new Date(startTime.getTime() + BOOKING_SLOT_MINUTES * 60_000)
    if (Number.isNaN(startTime.getTime())) {
      logger.error("[APPOINTMENT] APPOINTMENT_CREATE_FAILED — invalid date/time", { clinicId, date, time })
      return { ok: false, reason: "error", error: "invalid_datetime" }
    }

    let chosenProvider: { id: string; name: string } | null = null
    for (const p of providers) {
      try {
        const free = await checkSlotAvailability(clinicId, startTime, endTime, p.id)
        if (free) {
          chosenProvider = p
          break
        }
      } catch (e) {
        logger.warn("[APPOINTMENT] Availability check failed for provider, trying next", {
          clinicId,
          providerId: p.id,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
    if (!chosenProvider) {
      logger.info("[APPOINTMENT] Requested slot unavailable for all providers", { clinicId, date, time })
      return { ok: false, reason: "slot_taken" }
    }

    // 4) Atomic reservation (serializable + unique-constraint guard).
    try {
      const appointment = await reserveSlot(
        clinicId,
        startTime,
        endTime,
        chosenProvider.id,
        patient.id,
        reason,
        name,
        phone,
      )
      logger.info("[APPOINTMENT] APPOINTMENT_CREATED", {
        clinicId,
        appointmentId: appointment.id,
        patientId: patient.id,
        providerName: chosenProvider.name,
        date,
        time,
      })
      return {
        ok: true,
        appointmentId: appointment.id,
        patientId: patient.id,
        providerName: chosenProvider.name,
        duplicate: false,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === "SLOT_NO_LONGER_AVAILABLE") {
        // Lost a race: distinguish "you already booked this" from
        // "someone else just took the slot".
        const raced = await prisma.appointment.findFirst({
          where: {
            clinicId,
            phone,
            preferredDate: date,
            preferredTime: time,
            status: { in: ACTIVE_APPOINTMENT_STATUSES },
          },
          select: { id: true, patientId: true, doctor: true },
        })
        if (raced) {
          const providerName = await resolveProviderName(raced.doctor)
          return {
            ok: true,
            appointmentId: raced.id,
            patientId: raced.patientId || patient.id,
            providerName,
            duplicate: true,
          }
        }
        return { ok: false, reason: "slot_taken" }
      }
      throw e
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.error("[APPOINTMENT] APPOINTMENT_CREATE_FAILED", { clinicId, error: msg })
    return { ok: false, reason: "error", error: "booking_failed" }
  }
}

async function resolveProviderName(doctorId: string | null): Promise<string> {
  if (!doctorId) return "provider"
  try {
    const user = await prisma.user.findUnique({
      where: { id: doctorId },
      select: { name: true },
    })
    return user?.name || "provider"
  } catch {
    return "provider"
  }
}
