import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getClinicId, apiError, handleApiError } from "@/lib/api"
import { logger } from "@/lib/logger"
import { reserveSlot } from "@/lib/appointment/availability"
import { toDashboardAppointment } from "@/lib/appointment/present"

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
    const body = await req.json()
    const { patientName, phone, email, reason, preferredDate, preferredTime, endTime, isEmergency, doctor } = body

    if (!patientName || !phone) {
      return NextResponse.json({ error: "Patient name and phone are required" }, { status: 400 })
    }

    if (!preferredDate || !preferredTime) {
      return NextResponse.json({ error: "Preferred date and time are required" }, { status: 400 })
    }

    const startTime = new Date(`${preferredDate}T${preferredTime}:00`)
    const endTimeDate = endTime ? new Date(endTime) : new Date(new Date(preferredDate).getTime() + 30 * 60000)

    try {
      const appointment = await prisma.appointment.create({
        data: {
          patientName: patientName.trim().slice(0, 100),
          phone: phone.trim().slice(0, 20),
          email: email?.trim().slice(0, 200) || null,
          reason: reason?.trim().slice(0, 500) || "",
          preferredDate: preferredDate.trim().slice(0, 20),
          preferredTime: preferredTime.trim().slice(0, 20),
          endTime: endTimeDate.toISOString().split("T")[1].substring(0, 5),
          doctor: doctor || null,
          isEmergency: !!isEmergency,
          status: "confirmed",
          clinicId,
        },
      })

      return NextResponse.json(appointment, { status: 201 })
    } catch (error: any) {
      if (error.code === "P2002") {
        return NextResponse.json({ error: "This time slot is already booked. Please choose another time." }, { status: 409 })
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

    const appointment = await prisma.appointment.update({
      where: { id, clinicId },
      data: { status },
    })

    return NextResponse.json(appointment)
  } catch (error) {
    return handleApiError(error, "Failed to update appointment")
  }
}
