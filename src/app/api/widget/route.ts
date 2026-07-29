import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getClinicIdOptional, apiError } from "@/lib/api"

export async function GET(request: Request) {
  try {
    const { clinicId } = await getClinicIdOptional(request)
    if (!clinicId) {
      return NextResponse.json({
        clinic: null,
        position: "right",
        greeting: "Hi! How can we help you today?",
      })
    }
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        name: true,
        phone: true,
        emergencyPhone: true,
        openingHours: true,
        primaryColor: true,
      },
    })

    return NextResponse.json({
      clinic: clinic || null,
      position: "right",
      greeting: "Hi! How can we help you today?",
    })
  } catch {
    return apiError("Failed to fetch widget config")
  }
}
