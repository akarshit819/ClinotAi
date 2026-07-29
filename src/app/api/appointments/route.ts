import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getClinicId, apiError, handleApiError } from "@/lib/api"

export async function GET(request: Request) {
  try {
    const { clinicId } = await getClinicId(request)
    const appointments = await prisma.appointment.findMany({
      where: { clinicId },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    return NextResponse.json(appointments)
  } catch (error) {
    return handleApiError(error, "Failed to fetch appointments")
  }
}

export async function POST(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)
    const body = await req.json()
    const { patientName, phone, email, reason, preferredDate, preferredTime, isEmergency } = body

    if (!patientName || !phone) {
      return NextResponse.json({ error: "Patient name and phone are required" }, { status: 400 })
    }

    const sanitized = {
      patientName: patientName.trim().slice(0, 100),
      phone: phone.trim().slice(0, 20),
      email: email?.trim().slice(0, 200) || null,
      reason: reason?.trim().slice(0, 500) || "",
      preferredDate: preferredDate?.trim().slice(0, 20) || null,
      preferredTime: preferredTime?.trim().slice(0, 20) || null,
      isEmergency: !!isEmergency,
    }

    const appointment = await prisma.appointment.create({
      data: { ...sanitized, clinicId, status: "pending" },
    })

    return NextResponse.json(appointment, { status: 201 })
  } catch (error) {
    return handleApiError(error, "Failed to create appointment")
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
