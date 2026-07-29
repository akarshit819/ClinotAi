import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getClinicId, apiError, handleApiError } from "@/lib/api"

export async function GET(request: Request) {
  try {
    const { clinicId } = await getClinicId(request)
    const emergencies = await prisma.appointment.findMany({
      where: { clinicId, isEmergency: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    return NextResponse.json(emergencies)
  } catch (error) {
    return handleApiError(error, "Failed to fetch emergency appointments")
  }
}

export async function POST(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)
    const body = await req.json()
    const { patientName, phone, description } = body

    if (!patientName || !phone) {
      return NextResponse.json({ error: "Patient name and phone are required" }, { status: 400 })
    }

    const emergency = await prisma.appointment.create({
      data: {
        patientName: patientName.trim().slice(0, 100),
        phone: phone.trim().slice(0, 20),
        reason: description?.trim().slice(0, 500) || "Emergency",
        isEmergency: true,
        status: "pending",
        clinicId,
      },
    })

    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } })

    return NextResponse.json({
      appointment: emergency,
      emergencyPhone: clinic?.emergencyPhone || null,
      message: "Emergency information received. Please contact the clinic immediately.",
    }, { status: 201 })
  } catch (error) {
    return handleApiError(error, "Failed to create emergency appointment")
  }
}
