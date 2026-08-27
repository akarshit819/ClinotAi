import { prisma } from "@/lib/db"
import { addMinutes, startOfDay, endOfDay, format, parse, isWithinInterval, addDays, isBefore, isAfter, setHours, setMinutes, differenceInMinutes } from "date-fns"
import { toZonedTime, formatInTimeZone } from "date-fns-tz"

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

async function getBookedSlots(
  clinicId: string,
  startDate: Date,
  endDate: Date,
  providerId?: string
): Promise<BookedSlot[]> {
  const where: any = {
    clinicId,
    status: { in: ["pending", "confirmed", "in_progress"] },
    isEmergency: false,
    createdAt: {
      gte: startOfDay(startDate),
      lte: endOfDay(endDate),
    },
  }

  if (providerId) {
    where.doctor = providerId
  }

  const appointments = await prisma.appointment.findMany({
    where,
    select: {
      id: true,
      preferredDate: true,
      preferredTime: true,
      doctor: true,
      clinicId: true,
    },
  })

  // Fetch timezone once
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { timezone: true },
  })
  const timezone = clinic?.timezone || "America/New_York"

  return appointments
    .filter((a) => a.preferredDate && a.preferredTime)
    .map((a) => {
      const startTime = combineDateAndTime(
        parse(a.preferredDate!, "yyyy-MM-dd", new Date()),
        a.preferredTime!,
        timezone
      )
      const endTime = addMinutes(startTime, DEFAULT_APPOINTMENT_DURATION)

      return {
        id: a.id,
        startTime,
        endTime,
        providerId: a.doctor || "",
      }
    })
    .filter((s) => s.providerId)
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

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { timezone: true },
  })

  const timezone = clinic?.timezone || "America/New_York"
  const clinicHours = await getClinicHours(clinicId)
  const providers = await getProvidersForClinic(clinicId)

  const targetProviders = providerId
    ? providers.filter((p) => p.providerId === providerId)
    : providers

  const bookedSlots = await getBookedSlots(clinicId, startDate, endDate, providerId)

  const slots: TimeSlot[] = []

  for (let day = startOfDay(startDate); day <= endDate; day = addDays(day, 1)) {
    const dayOfWeek = day.getDay()
    const dayHours = clinicHours.find((h) => h.dayOfWeek === dayOfWeek)

    if (!dayHours || dayHours.isClosed) continue

    for (const provider of targetProviders) {
      const { hours, minutes } = parseTimeString(dayHours.openTime)
      const closeTime = parseTimeString(dayHours.closeTime)

      let currentTime = combineDateAndTime(day, dayHours.openTime, timezone)
      const dayEndTime = combineDateAndTime(day, dayHours.closeTime, timezone)

      while (isBefore(addMinutes(currentTime, durationMinutes), dayEndTime) ||
        differenceInMinutes(dayEndTime, currentTime) >= durationMinutes) {
        const slotEnd = addMinutes(currentTime, durationMinutes)

        // Check if slot is booked
        const isBooked = bookedSlots.some(
          (booked) =>
            booked.providerId === provider.providerId &&
            isWithinInterval(currentTime, { start: booked.startTime, end: booked.endTime }) ||
            isWithinInterval(slotEnd, { start: booked.startTime, end: booked.endTime }) ||
            (isBefore(currentTime, booked.startTime) && isAfter(slotEnd, booked.endTime))
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

  return !bookedSlots.some(
    (booked) =>
      isWithinInterval(startTime, { start: booked.startTime, end: booked.endTime }) ||
      isWithinInterval(endTime, { start: booked.startTime, end: booked.endTime }) ||
      (isBefore(startTime, booked.startTime) && isAfter(endTime, booked.endTime))
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
  return await prisma.$transaction(async (tx) => {
    // Re-check availability within transaction
    const bookedSlots = await getBookedSlots(
      clinicId,
      startOfDay(startTime),
      endOfDay(startTime),
      providerId
    )

    const isBooked = bookedSlots.some(
      (booked) =>
        booked.providerId === providerId &&
        (isWithinInterval(startTime, { start: booked.startTime, end: booked.endTime }) ||
          isWithinInterval(endTime, { start: booked.startTime, end: booked.endTime }) ||
          (isBefore(startTime, booked.startTime) && isAfter(endTime, booked.endTime)))
    )

    if (isBooked) {
      throw new Error("SLOT_NO_LONGER_AVAILABLE")
    }

    // Create appointment
    const appointment = await tx.appointment.create({
      data: {
        clinicId,
        patientId,
        doctor: providerId,
        preferredDate: startTime.toISOString().split("T")[0],
        preferredTime: startTime.toTimeString().substring(0, 5),
        endTime: endTime.toISOString().split("T")[1].substring(0, 5),
        reason,
        patientName: patientName,
        phone: phone,
        email: email || null,
        status: "confirmed",
        isEmergency: false,
      },
    })

    return appointment
  })
}