import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { addMinutes, startOfDay, endOfDay, format, parse, isBefore, isAfter, addDays, setHours, setMinutes, differenceInMinutes } from "date-fns"
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz"
import {
  MAX_ACTIVE_APPOINTMENTS_PER_PHONE,
  ACTIVE_APPOINTMENT_STATUSES,
  getCandidatePhoneVariants,
} from "./phone-utils"

export interface ClinicHours {
  dayOfWeek: number // 0 = Sunday, 6 = Saturday
  openTime: string // "HH:mm" 24-hour format
  closeTime: string // "HH:mm" 24-hour format
  isClosed: boolean
}

export interface ProviderSchedule {
  providerId: string
  providerName: string
  clinicHours: ClinicHours[]
  exceptions: ScheduleException[]
}

export interface ScheduleException {
  date: string // "YYYY-MM-DD"
  openTime?: string
  closeTime?: string
  isClosed: boolean
  reason?: string
}

export interface TimeSlot {
  startTime: Date
  endTime: Date
  providerId: string
  providerName: string
  available: boolean
}

export interface AvailabilityOptions {
  clinicId: string
  startDate: Date
  endDate: Date
  providerId?: string
  durationMinutes?: number
}

export interface BookedSlot {
  id: string
  startTime: Date
  endTime: Date
  providerId: string
}

const DEFAULT_APPOINTMENT_DURATION = 30

function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(":").map(Number)
  return { hours, minutes }
}

function combineDateAndTime(date: Date, timeStr: string, timezone: string): Date {
  const { hours, minutes } = parseTimeString(timeStr)
  const zonedDate = toZonedTime(date, timezone)
  return setMinutes(setHours(zonedDate, hours), minutes)
}

/**
 * Resolve the clinic timezone to a VALID IANA zone. An invalid stored
 * value (e.g. "IST", "UTC+5:30", "") makes date-fns-tz throw RangeError
 * on every availability computation — which previously surfaced as
 * every slot reporting "taken". Never let a bad timezone poison checks.
 */
export function resolveTimezone(raw: string | null | undefined): string {
  const fallback = "America/New_York"
  if (!raw || typeof raw !== "string" || !raw.trim()) return fallback
  const tz = raw.trim()
  try {
    // Throws RangeError for unknown zones.
    formatInTimeZone(new Date(), tz, "yyyy-MM-dd")
    return tz
  } catch {
    return fallback
  }
}

/** Validated clinic timezone (single DB read, safe default). */
export async function getClinicTimezone(clinicId: string): Promise<string> {
  try {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { timezone: true },
    })
    return resolveTimezone(clinic?.timezone)
  } catch {
    return "America/New_York"
  }
}

export async function getClinicHours(clinicId: string): Promise<ClinicHours[]> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { openingHours: true, timezone: true },
  })

  if (!clinic?.openingHours) {
    return defaultClinicHours()
  }

  try {
    const parsed = JSON.parse(clinic.openingHours)
    if (Array.isArray(parsed)) {
      return parsed.map((h: any) => ({
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime,
        closeTime: h.closeTime,
        isClosed: h.isClosed ?? false,
      }))
    }
  } catch {
    // fallback
  }
  return defaultClinicHours()
}

function defaultClinicHours(): ClinicHours[] {
  return [
    { dayOfWeek: 1, openTime: "09:00", closeTime: "17:00", isClosed: false }, // Monday
    { dayOfWeek: 2, openTime: "09:00", closeTime: "17:00", isClosed: false }, // Tuesday
    { dayOfWeek: 3, openTime: "09:00", closeTime: "17:00", isClosed: false }, // Wednesday
    { dayOfWeek: 4, openTime: "09:00", closeTime: "17:00", isClosed: false }, // Thursday
    { dayOfWeek: 5, openTime: "09:00", closeTime: "16:00", isClosed: false }, // Friday
    { dayOfWeek: 0, openTime: "09:00", closeTime: "13:00", isClosed: false }, // Sunday
    { dayOfWeek: 6, openTime: "09:00", closeTime: "13:00", isClosed: true }, // Saturday
  ]
}

export async function getProvidersForClinic(clinicId: string): Promise<ProviderSchedule[]> {
  const providers = await prisma.user.findMany({
    where: {
      clinicId,
      role: { name: { in: ["owner", "admin", "staff"] } },
      isActive: true,
    },
    select: { id: true, name: true, role: { select: { name: true } } },
  })

  const clinicHours = await getClinicHours(clinicId)

  return providers.map((p) => ({
    providerId: p.id,
    providerName: p.name,
    clinicHours,
    exceptions: [],
  }))
}

/**
 * Strict interval overlap: two half-open ranges [start, end) conflict when
 * one starts before the other ends and vice versa. Touching endpoints
 * (slot A ends exactly when slot B starts) do NOT conflict.
 */
function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return isBefore(aStart, bEnd) && isAfter(aEnd, bStart)
}

async function getBookedSlots(
  clinicId: string,
  startDate: Date,
  endDate: Date,
  providerId?: string,
  client: Prisma.TransactionClient = prisma as unknown as Prisma.TransactionClient
): Promise<BookedSlot[]> {
  // Widen by a day on each side: the caller passes server-local day
  // bounds, but stored preferredDates are clinic-local wall dates. A
  // clinic day near midnight can fall outside the server day window.
  // Precision comes from interval overlap below, not from this filter.
  const startDateStr = format(addDays(startDate, -1), "yyyy-MM-dd")
  const endDateStr = format(addDays(endDate, 1), "yyyy-MM-dd")

  const where: any = {
    clinicId,
    status: { in: ["pending", "confirmed", "in_progress"] },
    isEmergency: false,
    // Manually soft-deleted rows never occupy a slot.
    isDeleted: false,
    preferredDate: {
      gte: startDateStr,
      lte: endDateStr,
    },
  }

  if (providerId) {
    where.doctor = providerId
  }

  const appointments = await client.appointment.findMany({
    where,
    select: {
      id: true,
      preferredDate: true,
      preferredTime: true,
      endTime: true,
      doctor: true,
      clinicId: true,
    },
  })

  // Fetch timezone once — validated, so one malformed clinic row or
  // appointment can never poison the whole availability check.
  const clinic = await client.clinic.findUnique({
    where: { id: clinicId },
    select: { timezone: true },
  })
  const timezone = resolveTimezone(clinic?.timezone)

  const slots: BookedSlot[] = []
  for (const a of appointments) {
    if (!a.preferredDate || !a.preferredTime || !a.doctor) continue
    try {
      // TRUE instants in clinic wall time (NOT server-local shifted
      // dates): fromZonedTime interprets "YYYY-MM-DD HH:mm" as wall
      // time in the clinic timezone, so comparisons against requested
      // slots are correct on any server timezone.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.preferredDate)) continue
      if (!/^\d{1,2}:\d{2}$/.test(a.preferredTime)) continue
      const startTime = fromZonedTime(`${a.preferredDate} ${a.preferredTime}`, timezone)
      if (Number.isNaN(startTime.getTime())) continue
      // Use the stored end time when present; fall back to the default duration
      const endTime =
        a.endTime && /^\d{1,2}:\d{2}$/.test(a.endTime)
          ? fromZonedTime(`${a.preferredDate} ${a.endTime}`, timezone)
          : addMinutes(startTime, DEFAULT_APPOINTMENT_DURATION)
      if (Number.isNaN(endTime.getTime())) continue
      slots.push({ id: a.id, startTime, endTime, providerId: a.doctor })
    } catch {
      // A single malformed appointment row must never fail the check.
      continue
    }
  }
  return slots
}

export async function generateAvailableSlots(
  options: AvailabilityOptions
): Promise<TimeSlot[]> {
  const {
    clinicId,
    startDate,
    endDate,
    providerId,
    durationMinutes = DEFAULT_APPOINTMENT_DURATION,
  } = options

  const timezone = await getClinicTimezone(clinicId)
  const clinicHours = await getClinicHours(clinicId)
  const providers = await getProvidersForClinic(clinicId)

  const targetProviders = providerId
    ? providers.filter((p) => p.providerId === providerId)
    : providers

  const bookedSlots = await getBookedSlots(clinicId, startDate, endDate, providerId)

  const slots: TimeSlot[] = []

  // Iterate CLINIC-LOCAL days (not server days): the bounds are instants,
  // each of which falls on a definite clinic calendar day. Slots are TRUE
  // instants via fromZonedTime, so overlap checks and isAfter(now) hold
  // on any server timezone.
  const startDayStr = formatInTimeZone(startDate, timezone, "yyyy-MM-dd")
  const endDayStr = formatInTimeZone(endDate, timezone, "yyyy-MM-dd")
  for (
    let day = parse(startDayStr, "yyyy-MM-dd", new Date());
    format(day, "yyyy-MM-dd") <= endDayStr;
    day = addDays(day, 1)
  ) {
    const dayStr = format(day, "yyyy-MM-dd")
    const dayOfWeek = day.getDay()
    const dayHours = clinicHours.find((h) => h.dayOfWeek === dayOfWeek)

    if (!dayHours || dayHours.isClosed) continue

    for (const provider of targetProviders) {
      let currentTime: Date
      let dayEndTime: Date
      try {
        currentTime = fromZonedTime(`${dayStr} ${dayHours.openTime}`, timezone)
        dayEndTime = fromZonedTime(`${dayStr} ${dayHours.closeTime}`, timezone)
      } catch {
        continue
      }
      if (Number.isNaN(currentTime.getTime()) || Number.isNaN(dayEndTime.getTime())) continue

      while (isBefore(addMinutes(currentTime, durationMinutes), dayEndTime) ||
        differenceInMinutes(dayEndTime, currentTime) >= durationMinutes) {
        const slotEnd = addMinutes(currentTime, durationMinutes)

        // Check if slot is booked — conflict must be with the SAME provider
        // (parenthesization matters: without it, another provider's booking
        // would incorrectly block this provider's slot)
        const isBooked = bookedSlots.some(
          (booked) =>
            booked.providerId === provider.providerId &&
            intervalsOverlap(currentTime, slotEnd, booked.startTime, booked.endTime)
        )

        slots.push({
          startTime: currentTime,
          endTime: slotEnd,
          providerId: provider.providerId,
          providerName: provider.providerName,
          available: !isBooked,
        })

        currentTime = addMinutes(currentTime, durationMinutes)
      }
    }
  }

  return slots
}

/**
 * Clinic-local wall-clock date/time strings for a TRUE instant.
 * Use these (never server-local getters) when presenting slots.
 */
export function formatSlotInTimezone(d: Date, timezone: string): { date: string; time: string } {
  return {
    date: formatInTimeZone(d, timezone, "yyyy-MM-dd"),
    time: formatInTimeZone(d, timezone, "HH:mm"),
  }
}

export async function findAvailableSlots(
  clinicId: string,
  date: Date,
  providerId?: string,
  durationMinutes = DEFAULT_APPOINTMENT_DURATION
): Promise<TimeSlot[]> {
  const start = startOfDay(date)
  const end = endOfDay(date)
  return generateAvailableSlots({
    clinicId,
    startDate: start,
    endDate: end,
    providerId,
    durationMinutes,
  })
}

export async function findAvailableSlotsByRange(options: AvailabilityOptions): Promise<TimeSlot[]> {
  return generateAvailableSlots(options)
}

export async function getNextAvailableSlots(
  clinicId: string,
  count: number = 5,
  providerId?: string,
  durationMinutes = DEFAULT_APPOINTMENT_DURATION
): Promise<TimeSlot[]> {
  const now = new Date()
  const start = startOfDay(now)
  const end = addDays(start, 30)

  const allSlots = await generateAvailableSlots({
    clinicId,
    startDate: start,
    endDate: end,
    providerId,
    durationMinutes,
  })

  const available = allSlots.filter((s) => s.available && isAfter(s.startTime, now))
  return available.slice(0, count)
}

export async function checkSlotAvailability(
  clinicId: string,
  startTime: Date,
  endTime: Date,
  providerId: string
): Promise<boolean> {
  const bookedSlots = await getBookedSlots(
    clinicId,
    startOfDay(startTime),
    endOfDay(startTime),
    providerId
  )

  // Belt and suspenders: the DB query already filters by provider, but the
  // overlap check re-verifies it so a filter failure can never block an
  // unrelated provider's slot (or vice versa).
  return !bookedSlots.some(
    (booked) => booked.providerId === providerId && intervalsOverlap(startTime, endTime, booked.startTime, booked.endTime)
  )
}

export async function reserveSlot(
  clinicId: string,
  startTime: Date,
  endTime: Date,
  providerId: string,
  patientId: string,
  reason: string,
  patientName: string,
  phone: string,
  email?: string
) {
  // Serializable isolation + a transaction-scoped availability re-check makes
  // concurrent bookings for the same provider/slot abort instead of double
  // booking; the [clinicId, doctor, preferredDate, preferredTime] unique
  // constraint is the final DB-level guard (P2002).
  const maxRetries = 3
  let lastError: unknown

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const clinic = await tx.clinic.findUnique({
            where: { id: clinicId },
            select: { timezone: true },
          })
          const timezone = clinic?.timezone || "America/New_York"

          // Re-check availability WITHIN the transaction (tx-scoped read)
          const bookedSlots = await getBookedSlots(
            clinicId,
            startOfDay(startTime),
            endOfDay(startTime),
            providerId,
            tx
          )

          const isBooked = bookedSlots.some(
            (booked) =>
              booked.providerId === providerId &&
              intervalsOverlap(startTime, endTime, booked.startTime, booked.endTime)
          )

          if (isBooked) {
            throw new Error("SLOT_NO_LONGER_AVAILABLE")
          }

          // Atomic check: enforce maximum active appointments per phone number
          const candidatePhones = getCandidatePhoneVariants(phone)
          let activeCount: number
          try {
            if (typeof (tx.appointment as any).count === "function") {
              activeCount = await (tx.appointment as any).count({
                where: {
                  clinicId,
                  phone: { in: candidatePhones },
                  status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
                  isDeleted: false,
                },
              })
            } else {
              const rows = await tx.appointment.findMany({
                where: {
                  clinicId,
                  phone: { in: candidatePhones },
                  status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
                  isDeleted: false,
                },
                select: { id: true },
              })
              activeCount = rows.length
            }
          } catch {
            const rows = await tx.appointment.findMany({
              where: {
                clinicId,
                phone: { in: candidatePhones },
                status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
                isDeleted: false,
              },
              select: { id: true },
            })
            activeCount = rows.length
          }

          if (activeCount >= MAX_ACTIVE_APPOINTMENTS_PER_PHONE) {
            throw new Error("MAX_ACTIVE_APPOINTMENTS_REACHED")
          }

          // Store the clinic-local wall clock so the read path
          // (getBookedSlots via combineDateAndTime) round-trips exactly.
          const appointment = await tx.appointment.create({
            data: {
              clinicId,
              patientId,
              doctor: providerId,
              preferredDate: formatInTimeZone(startTime, timezone, "yyyy-MM-dd"),
              preferredTime: formatInTimeZone(startTime, timezone, "HH:mm"),
              endTime: formatInTimeZone(endTime, timezone, "HH:mm"),
              reason,
              patientName: patientName,
              phone: phone,
              email: email || null,
              status: "confirmed",
              isEmergency: false,
            },
          })

          return appointment
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    } catch (error: any) {
      lastError = error
      // P2034: serialization conflict — retry with a small backoff
      if (error?.code === "P2034" && attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
        continue
      }
      // P2002: unique constraint on [clinicId, doctor, preferredDate, preferredTime]
      // lost the race — surface as a slot conflict
      if (error?.code === "P2002") {
        throw new Error("SLOT_NO_LONGER_AVAILABLE")
      }
      throw error
    }
  }
  throw lastError
}