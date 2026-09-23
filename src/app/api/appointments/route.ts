import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { getClinicId, apiError, handleApiError } from "@/lib/api"
import { logger } from "@/lib/logger"
import { reserveSlot } from "@/lib/appointment/availability"
import { toDashboardAppointment } from "@/lib/appointment/present"
import { notifyAppointmentCancelled } from "@/lib/appointment/cancel-notify"
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/security/rate-limit"
import {
  MAX_ACTIVE_APPOINTMENTS_PER_PHONE,
  ACTIVE_APPOINTMENT_STATUSES,
  getCandidatePhoneVariants,
  normalizePhoneNumber,
  isValidPhoneNumber,
} from "@/lib/appointment/phone-utils"

export async function GET(request: Request) {
  logger.info("[DASHBOARD] DASHBOARD_APPOINTMENTS_REQUEST", {
    url: request.url?.slice(0, 120),
  })
  try {
    const { clinicId } = await getClinicId(request)
    logger.info("[DASHBOARD] DASHBOARD_APPOINTMENTS_QUERY_STARTED", { clinicId })
    const appointments = await prisma.appointment.findMany({
      // Soft-deleted rows stay in the DB but never list.
      where: { clinicId, isDeleted: false },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        patient: { select: { id: true, name: true, phone: true, email: true } },
      },
    })
    // Resolve staff names for the rows that reference a provider.
    const doctorIds: string[] = []
    for (const a of appointments) {
      if (a.doctor && !doctorIds.includes(a.doctor)) doctorIds.push(a.doctor)
    }
    let providerNames: Record<string, string> = {}
    if (doctorIds.length > 0) {
      try {
        const users = await prisma.user.findMany({
          where: { id: { in: doctorIds } },
          select: { id: true, name: true },
        })
        providerNames = Object.fromEntries(users.map((u) => [u.id, u.name]))
      } catch {
        // Provider names are enrichment-only; never fail the list for them.
      }
    }
    // The dashboard reads `date` / `time` / `patientPhone` while the
    // schema stores `preferredDate` / `preferredTime` / `phone`
    // (production incident: blank details). The mapper returns both,
    // preferring linked-patient values when the row itself is sparse.
    const mapped = appointments.map((a) =>
      toDashboardAppointment({
        ...a,
        patientName: a.patientName || a.patient?.name || null,
        phone: a.phone || a.patient?.phone || null,
        email: a.email || a.patient?.email || null,
        providerName: (a.doctor && providerNames[a.doctor]) || null,
      }),
    )
    logger.info("[DASHBOARD] DASHBOARD_APPOINTMENTS_QUERY_SUCCESS", {
      clinicId,
      count: mapped.length,
    })
    return NextResponse.json(mapped)
  } catch (error) {
    logger.error("[DASHBOARD] DASHBOARD_APPOINTMENTS_QUERY_FAILED", {
      error: error instanceof Error ? error.message : String(error),
    })
    return handleApiError(error, "Failed to fetch appointments")
  }
}

export async function POST(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)

    // Rate limiting check per IP + phone
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                     req.headers.get("x-real-ip")?.trim() || "127.0.0.1"

    const body = await req.json()
    const { patientName, phone, email, reason, preferredDate, preferredTime, endTime, isEmergency, doctor } = body

    const cleanPhone = typeof phone === "string" ? phone.trim() : ""
    const cleanName = typeof patientName === "string" ? patientName.replace(/[<>]/g, "").trim() : ""
    const cleanReason = typeof reason === "string" ? reason.replace(/[<>]/g, "").trim() : ""
    const cleanDate = typeof preferredDate === "string" ? preferredDate.trim() : ""
    const cleanTime = typeof preferredTime === "string" ? preferredTime.trim() : ""

    const rlResult = checkRateLimit("appointment", rateLimitKey(clientIp, normalizePhoneNumber(cleanPhone) || undefined))
    if (!rlResult.allowed) {
      return NextResponse.json(
        { error: "Too many appointment requests. Please wait a few minutes before trying again." },
        { status: 429, headers: rateLimitHeaders(rlResult) },
      )
    }

    if (!cleanName || cleanName.length < 2) {
      return NextResponse.json({ error: "Please enter a valid patient name (minimum 2 characters)." }, { status: 400 })
    }

    if (!cleanPhone || !isValidPhoneNumber(cleanPhone)) {
      return NextResponse.json({ error: "Please provide a valid phone number with 7 to 15 digits." }, { status: 400 })
    }

    if (!cleanDate || !cleanTime) {
      return NextResponse.json({ error: "Preferred date and time are required." }, { status: 400 })
    }

    // Date validation: must be valid format and not in the past
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(cleanDate)) {
      return NextResponse.json({ error: "Preferred date must be in YYYY-MM-DD format." }, { status: 400 })
    }

    const appointmentDateTime = new Date(`${cleanDate}T${cleanTime.length === 5 ? cleanTime : `${cleanTime}:00`}`)
    if (Number.isNaN(appointmentDateTime.getTime())) {
      return NextResponse.json({ error: "Invalid appointment date or time." }, { status: 400 })
    }

    // Past date check (allow 5-minute buffer for submission delay)
    if (appointmentDateTime.getTime() < Date.now() - 5 * 60_000) {
      return NextResponse.json({ error: "Appointment date and time cannot be in the past." }, { status: 400 })
    }

    const candidatePhones = getCandidatePhoneVariants(cleanPhone)
    const endTimeDate = endTime ? new Date(endTime) : new Date(appointmentDateTime.getTime() + 30 * 60_000)

    // Use a serializable transaction so concurrent requests for the
    // same phone cannot both pass the count/duplicate checks and
    // exceed the 3-active limit. This mirrors the atomic guard in
    // lib/appointment/availability.reserveSlot for WhatsApp bookings.
    try {
      const appointment = await prisma.$transaction(
        async (tx) => {
          const existingSlot = await tx.appointment.findFirst({
            where: {
              clinicId,
              phone: { in: candidatePhones },
              preferredDate: cleanDate,
              preferredTime: cleanTime,
              status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
              isDeleted: false,
            },
          })
          if (existingSlot) {
            throw Object.assign(new Error("DUPLICATE_SLOT"), { code: "DUPLICATE_SLOT" })
          }

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
            throw Object.assign(new Error("MAX_ACTIVE_APPOINTMENTS_REACHED"), { code: "MAX_ACTIVE_APPOINTMENTS_REACHED" })
          }

          return tx.appointment.create({
            data: {
              patientName: cleanName.slice(0, 100),
              phone: cleanPhone.slice(0, 20),
              email: typeof email === "string" ? email.trim().slice(0, 200) : null,
              reason: cleanReason.slice(0, 500) || "General Consultation",
              preferredDate: cleanDate.slice(0, 20),
              preferredTime: cleanTime.slice(0, 20),
              endTime: endTimeDate.toISOString().split("T")[1].substring(0, 5),
              doctor: doctor || null,
              isEmergency: !!isEmergency,
              status: "confirmed",
              clinicId,
            },
          })
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )

      return NextResponse.json(appointment, { status: 201 })
    } catch (error: any) {
      if (error.code === "DUPLICATE_SLOT") {
        return NextResponse.json(
          { error: "You already have an appointment scheduled for this date and time." },
          { status: 409 },
        )
      }
      if (error.code === "MAX_ACTIVE_APPOINTMENTS_REACHED") {
        return NextResponse.json(
          { error: "Maximum limit of 3 active appointments reached for this phone number. Please reschedule or cancel an existing appointment." },
          { status: 400 },
        )
      }
      if (error.code === "P2002") {
        return NextResponse.json({ error: "This time slot is already booked. Please choose another time." }, { status: 409 })
      }
      if (error.code === "P2034") {
        return NextResponse.json(
          { error: "Booking conflict detected. Please try again." },
          { status: 409 },
        )
      }
      throw error
    }
  } catch (error) {
    return handleApiError(error, "Failed to create appointment")
  }
}

export async function DELETE(req: Request) {
  // Manual soft delete from the dashboard: hides the appointment while
  // keeping the row (and its history) safe in the database. Nothing in
  // the system auto-deletes — only this endpoint, only on explicit user
  // action from the dashboard confirmation dialog.
  try {
    const { clinicId } = await getClinicId(req)
    const body = await req.json().catch(() => ({}))
    const { id } = body as { id?: string }

    if (!id) {
      return NextResponse.json({ error: "Appointment ID is required" }, { status: 400 })
    }

    const existing = await prisma.appointment.findFirst({
      where: { id, clinicId, isDeleted: false },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    })
    logger.info("[DASHBOARD] Appointment soft-deleted by dashboard user", {
      clinicId,
      appointmentId: appointment.id,
    })
    return NextResponse.json({ success: true, id: appointment.id })
  } catch (error) {
    return handleApiError(error, "Failed to delete appointment")
  }
}

export async function PATCH(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)
    const { id, status } = await req.json()

    if (!id || !status) {
      return NextResponse.json({ error: "ID and status are required" }, { status: 400 })
    }

    // Scope to this clinic's visible rows (the raw `where: { id, clinicId }`
    // update requires a unique filter and could touch other clinics' rows
    // or throw — fetch first, then update by id).
    const existing = await prisma.appointment.findFirst({
      where: { id, clinicId, isDeleted: false },
    })
    if (!existing) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
    }

    // Already in the target state → no-op. In particular, re-cancelling
    // must NOT re-notify the patient.
    if (existing.status === status) {
      return NextResponse.json({ ...existing, notification: { sent: false, reason: "no_state_change" } })
    }

    const appointment = await prisma.appointment.update({
      where: { id: existing.id },
      data: { status },
    })

    // Owner cancellation → notify the patient on WhatsApp, but ONLY after
    // the write above succeeded. Notification failures never fail the
    // cancellation itself (logged only).
    let notification: { sent: boolean; reason?: string } = { sent: false, reason: "not_cancelled" }
    if (status === "cancelled") {
      try {
        const result = await notifyAppointmentCancelled({
          clinicId,
          appointmentId: appointment.id,
          patientName: appointment.patientName,
          phone: appointment.phone,
          preferredDate: appointment.preferredDate,
          preferredTime: appointment.preferredTime,
        })
        notification = result.sent ? { sent: true } : { sent: false, reason: result.reason }
      } catch (e) {
        logger.error("[DASHBOARD] Cancellation notice error (cancellation kept)", {
          clinicId,
          appointmentId: appointment.id,
          error: e instanceof Error ? e.message : String(e),
        })
        notification = { sent: false, reason: "error" }
      }
    }

    return NextResponse.json({ ...appointment, notification })
  } catch (error) {
    return handleApiError(error, "Failed to update appointment")
  }
}
