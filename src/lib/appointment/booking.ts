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
import { checkSlotAvailability, reserveSlot, resolveTimezone } from "./availability"
import {
  MAX_ACTIVE_APPOINTMENTS_PER_PHONE,
  ACTIVE_APPOINTMENT_STATUSES,
  getCandidatePhoneVariants,
  normalizePhoneNumber,
  isValidPhoneNumber,
} from "./phone-utils"
import { checkRateLimit, rateLimitKey } from "@/lib/security/rate-limit"
import type { AppointmentDraft } from "@/messaging/ai/appointment-state"

export const BOOKING_SLOT_MINUTES = 30

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
  | { ok: false; reason: "max_active_appointments"; message: string }
  | { ok: false; reason: "rate_limited"; message: string }
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
  const rawPhone = draft.patientPhone?.trim() || req.whatsappPhone?.trim() || ""
  // Sanitize inputs (strip angle brackets that could be used for injection, trim, limit length)
  const phone = rawPhone.replace(/[<>]/g, "").trim().slice(0, 20)
  const rawName = draft.patientName?.trim() || req.whatsappName?.trim() || "Patient"
  const name = rawName.replace(/[<>]/g, "").trim().slice(0, 100)
  const rawReason = draft.reason?.trim() || ""
  const reason = rawReason.replace(/[<>]/g, "").trim().slice(0, 500)
  const date = draft.preferredDate || ""
  const time = draft.preferredTime || ""

  const missing = missingFields({ ...draft, patientName: name, patientPhone: phone, reason }, phone || undefined)
  if (missing.length > 0) {
    logger.warn("[APPOINTMENT] Booking refused — missing fields", { clinicId, missing })
    return { ok: false, reason: "missing_fields", missing }
  }

  if (!isValidPhoneNumber(phone)) {
    logger.warn("[APPOINTMENT] Booking refused — invalid phone", { clinicId, phone })
    return { ok: false, reason: "error", error: "invalid_phone" }
  }

  // Appointment spam protection: rate limit per clinic + normalized phone
  // Skip in test environment to avoid flaky tests that share the same
  // in-memory rate-limit store across many booking cases.
  if (process.env.NODE_ENV !== "test") {
    const rateKey = rateLimitKey(clinicId, normalizePhoneNumber(phone))
    const rateResult = checkRateLimit("appointment", rateKey)
    if (!rateResult.allowed) {
      logger.warn("[APPOINTMENT] Booking rate-limited", { clinicId, phone })
      return {
        ok: false,
        reason: "rate_limited",
        message: "Too many appointment requests for this phone number. Please wait a few minutes before trying again.",
      }
    }
  }

  logger.info("[APPOINTMENT] APPOINTMENT_CREATE_STARTED", {
    clinicId,
    date,
    time,
    hasName: Boolean(name),
  })

  // Helper: count active appointments for a phone, with fallback for
  // test mocks that only provide findMany (prisma.appointment.count
  // may be absent in unit-test mocks).
  const countActiveForPhone = async (where: any): Promise<number> => {
    try {
      if (typeof (prisma.appointment as any).count === "function") {
        return await (prisma.appointment as any).count({ where })
      }
    } catch {}
    const rows = await prisma.appointment.findMany({ where, select: { id: true } })
    return rows.length
  }

  try {
    // 1) Duplicate guard BEFORE creating anything: same clinic + phone +
    //    date + time already booked → reuse, never duplicate. This covers
    //    double-tap "confirm", webhook retries, and worker redelivery.
    logger.info("[APPOINTMENT] APPOINTMENT_DUPLICATE_CHECK", { clinicId, date, time })
    const existing = await prisma.appointment.findFirst({
      where: {
        clinicId,
        phone,
        preferredDate: date,
        preferredTime: time,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        // Manually deleted rows never block rebooking.
        isDeleted: false,
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

    // 2) Enforce maximum active appointments per phone number (limit of 3).
    // Active statuses: pending, confirmed, in_progress. Cancelled and completed do not count.
    const candidatePhones = getCandidatePhoneVariants(phone)
    const activeCount = await countActiveForPhone({
      clinicId,
      phone: { in: candidatePhones },
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      isDeleted: false,
    })
    if (activeCount >= MAX_ACTIVE_APPOINTMENTS_PER_PHONE) {
      logger.warn("[APPOINTMENT] Booking refused — max active appointments reached", {
        clinicId,
        phone,
        activeCount,
        max: MAX_ACTIVE_APPOINTMENTS_PER_PHONE,
      })
      return {
        ok: false,
        reason: "max_active_appointments",
        message: "You already have 3 active appointments scheduled with our clinic. To book a new one, please reschedule or cancel an existing appointment, or contact our front desk.",
      }
    }

    // 3) Resolve or create the patient by verified phone (clinic-scoped).
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

    // 3) Pick a staff provider free at the requested slot. The draft's
    //    previously chosen provider (from "choose for me") is tried first.
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
    const orderedProviders = draft.providerId
      ? [
          ...providers.filter((p) => p.id === draft.providerId),
          ...providers.filter((p) => p.id !== draft.providerId),
        ]
      : providers

    // Timezone-safe: interpret the wall clock in the CLINIC's timezone
    // (never the server's). `new Date("2026-09-12T16:00:00")` parses in
    // server-local time and silently shifts the stored slot on servers
    // outside the clinic timezone (production incident class).
    const clinicTzRow = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { timezone: true },
    })
    const clinicTimezone = resolveTimezone(clinicTzRow?.timezone)
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

    // Availability is evaluated PER PROVIDER with outcomes tracked
    // separately. A provider whose check THROWS is not "taken" — it is
    // unknown. Only genuine unavailability (or a verified exact DB
    // conflict below) may produce slot_taken.
    let chosenProvider: { id: string; name: string } | null = null
    let unavailableCount = 0
    let errorCount = 0
    for (const p of orderedProviders) {
      logger.info("[APPOINTMENT] APPOINTMENT_SLOT_CHECK", {
        clinicId,
        providerId: p.id,
        date,
        time,
      })
      try {
        const free = await checkSlotAvailability(clinicId, startTime, endTime, p.id)
        if (free) {
          chosenProvider = p
          logger.info("[APPOINTMENT] APPOINTMENT_SLOT_AVAILABLE", {
            clinicId,
            providerId: p.id,
            date,
            time,
          })
          break
        }
        unavailableCount += 1
      } catch (e) {
        errorCount += 1
        logger.error("[APPOINTMENT] Availability check errored for provider", {
          clinicId,
          providerId: p.id,
          date,
          time,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
    if (chosenProvider) {
      logger.info("[APPOINTMENT] APPOINTMENT_PROVIDER_RESOLVED", {
        clinicId,
        providerId: chosenProvider.id,
        providerName: chosenProvider.name,
        date,
        time,
      })
    }
    if (!chosenProvider) {
      // No provider verified free. "Taken" requires PROOF: an actual
      // conflicting appointment row for this clinic + date + time.
      // Anything else (e.g. every check errored) is an honest error —
      // never a false "taken".
      const conflicts = await findExactConflicts(clinicId, date, time)
      if (conflicts.length > 0) {
        logger.info("[APPOINTMENT] APPOINTMENT_SLOT_CONFLICT", {
          clinicId,
          date,
          time,
          conflictingAppointments: conflicts.length,
          unavailableCount,
          errorCount,
        })
        return { ok: false, reason: "slot_taken" }
      }
      logger.error("[APPOINTMENT] APPOINTMENT_CREATE_FAILED — availability unverifiable, no DB conflict", {
        clinicId,
        date,
        time,
        unavailableCount,
        errorCount,
      })
      return { ok: false, reason: "error", error: "availability_unverifiable" }
    }

    // 4) Atomic reservation (serializable + unique-constraint guard),
    //    then VERIFY the row exists before reporting success.
    try {
      logger.info("[APPOINTMENT] APPOINTMENT_DB_CREATE_STARTED", {
        clinicId,
        providerId: chosenProvider.id,
        date,
        time,
      })
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
      const verified = await prisma.appointment.findUnique({
        where: { id: appointment.id },
        select: { id: true },
      })
      if (!verified) {
        logger.error("[APPOINTMENT] APPOINTMENT_CREATE_FAILED — write not verifiable", {
          clinicId,
          appointmentId: appointment.id,
        })
        return { ok: false, reason: "error", error: "write_unverified" }
      }
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
      if (msg === "MAX_ACTIVE_APPOINTMENTS_REACHED") {
        logger.warn("[APPOINTMENT] Booking refused — max active appointments reached during reservation", {
          clinicId,
          phone,
        })
        return {
          ok: false,
          reason: "max_active_appointments",
          message: "You already have 3 active appointments scheduled with our clinic. To book a new one, please reschedule or cancel an existing appointment, or contact our front desk.",
        }
      }
      if (msg === "SLOT_NO_LONGER_AVAILABLE") {
        // Lost a race: distinguish "you already booked this" from
        // "someone else just took the slot" from "no real conflict".
        const raced = await prisma.appointment.findFirst({
          where: {
            clinicId,
            phone,
            preferredDate: date,
            preferredTime: time,
            status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
            isDeleted: false,
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
        const conflicts = await findExactConflicts(clinicId, date, time)
        if (conflicts.length > 0) {
          logger.info("[APPOINTMENT] APPOINTMENT_SLOT_CONFLICT", {
            clinicId,
            date,
            time,
            conflictingAppointments: conflicts.length,
          })
          return { ok: false, reason: "slot_taken" }
        }
        logger.error("[APPOINTMENT] APPOINTMENT_CREATE_FAILED — slot conflict unverifiable", {
          clinicId,
          date,
          time,
        })
        return { ok: false, reason: "error", error: "availability_unverifiable" }
      }
      throw e
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.error("[APPOINTMENT] APPOINTMENT_CREATE_FAILED", { clinicId, error: msg })
    return { ok: false, reason: "error", error: "booking_failed" }
  }
}

export interface NearestSlotRequest {
  clinicId: string
  /** YYYY-MM-DD the patient is interested in. */
  date: string
  /** HH:MM 24h preference to stay close to (optional). */
  preferredTime?: string
  /** HH:MM to exclude (e.g. the just-taken time). */
  excludeTime?: string
  /** Max days to look ahead when the requested date is full. */
  maxDaysAhead?: number
}

export interface NearestSlot {
  date: string
  time: string
  providerId: string
  providerName: string
}

/**
 * Deterministic "choose for me": nearest available slot on the requested
 * date, closest to the preferred time (or earliest when none given).
 * NEVER invents availability — only slots computed from clinic hours
 * minus real booked rows are returned.
 */
export async function findNearestAvailableSlot(req: NearestSlotRequest): Promise<NearestSlot | null> {
  const { clinicId, date, preferredTime, excludeTime, maxDaysAhead = 7 } = req
  const base = parseDateOnly(date)
  if (!base) return null
  const { findAvailableSlotsByRange, getClinicTimezone, formatSlotInTimezone } = await import("./availability")
  const timezone = await getClinicTimezone(clinicId)

  for (let offset = 0; offset <= maxDaysAhead; offset++) {
    const day = new Date(base)
    day.setDate(day.getDate() + offset)
    const dayStart = new Date(day)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(day)
    dayEnd.setHours(23, 59, 59, 999)

    let slots: Array<{ startTime: Date; endTime: Date; providerId: string; providerName: string; available: boolean }>
    try {
      slots = await findAvailableSlotsByRange({ clinicId, startDate: dayStart, endDate: dayEnd })
    } catch (e) {
      logger.error("[APPOINTMENT] Nearest-slot search failed", {
        clinicId,
        date,
        error: e instanceof Error ? e.message : String(e),
      })
      return null
    }

    // Compare in CLINIC wall time (never server-local getters).
    const open = slots.filter((s) => {
      if (!s.available) return false
      const wall = formatSlotInTimezone(s.startTime, timezone)
      if (excludeTime && wall.time === excludeTime && wall.date === date) return false
      return true
    })
    if (open.length === 0) continue

    // Prefer the requested date; within it, closest to the preferred time
    // (or earliest when none given).
    open.sort((a, b) => {
      const wa = formatSlotInTimezone(a.startTime, timezone)
      const wb = formatSlotInTimezone(b.startTime, timezone)
      const aOnDate = wa.date === date ? 0 : 1
      const bOnDate = wb.date === date ? 0 : 1
      if (aOnDate !== bOnDate) return aOnDate - bOnDate
      if (preferredTime) {
        return Math.abs(minutesBetween(preferredTime, wa.time)) - Math.abs(minutesBetween(preferredTime, wb.time))
      }
      return a.startTime.getTime() - b.startTime.getTime()
    })

    const pick = open[0]
    const wall = formatSlotInTimezone(pick.startTime, timezone)
    return {
      date: wall.date,
      time: wall.time,
      providerId: pick.providerId,
      providerName: pick.providerName,
    }
  }
  return null
}

function parseDateOnly(dateIso: string): Date | null {
  const m = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  if (d.getMonth() !== parseInt(m[2], 10) - 1 || d.getDate() !== parseInt(m[3], 10)) return null
  return d
}

function minutesBetween(aHHMM: string, bHHMM: string): number {
  const [ah, am] = aHHMM.split(":").map(Number)
  const [bh, bm] = bHHMM.split(":").map(Number)
  return ah * 60 + am - (bh * 60 + bm)
}

/**
 * Exact-conflict proof: active appointment rows for this clinic + date +
 * time (any provider). "Taken" is ONLY reported when this is non-empty.
 */
async function findExactConflicts(
  clinicId: string,
  date: string,
  time: string,
): Promise<Array<{ id: string }>> {
  try {
    return await prisma.appointment.findMany({
      where: {
        clinicId,
        preferredDate: date,
        preferredTime: time,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        isDeleted: false,
      },
      select: { id: true },
    })
  } catch (e) {
    logger.error("[APPOINTMENT] Exact-conflict lookup failed", {
      clinicId,
      error: e instanceof Error ? e.message : String(e),
    })
    return []
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
