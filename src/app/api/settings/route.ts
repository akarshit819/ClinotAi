import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getClinicId, apiError } from "@/lib/api"

export async function GET(request: Request) {
  try {
    const { clinicId } = await getClinicId(request)
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
    })

    if (!clinic) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 })
    }

    return NextResponse.json({
      clinicName: clinic.name,
      clinicAddress: clinic.address || "",
      clinicPhone: clinic.phone || "",
      timezone: clinic.timezone,
      language: clinic.language,
      businessHours: clinic.openingHours || "",
      welcomeMessage: clinic.welcomeMessage || "",
      afterHoursMessage: clinic.afterHoursMessage || "",
      notificationsEmail: clinic.notificationsEmail || "",
      notificationsPhone: clinic.notificationsPhone || "",
    })
  } catch {
    return apiError("Failed to fetch settings")
  }
}

export async function PUT(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)
    const body = await req.json()
    const allowedFields = [
      "name", "logo", "phone", "email", "address",
      "emergencyPhone", "openingHours", "primaryColor",
      "timezone", "language", "welcomeMessage", "afterHoursMessage",
      "notificationsEmail", "notificationsPhone",
    ]

    const fieldMap: Record<string, string> = {
      clinicName: "name",
      clinicAddress: "address",
      clinicPhone: "phone",
      businessHours: "openingHours",
    }

    const updateData: Record<string, string> = {}
    for (const [key, value] of Object.entries(body)) {
      const dbField = fieldMap[key] || key
      if (allowedFields.includes(dbField) && value !== undefined) {
        updateData[dbField] = String(value).trim()
      }
    }

    await prisma.clinic.update({
      where: { id: clinicId },
      data: updateData,
    })

    return NextResponse.json({ success: true })
  } catch {
    return apiError("Failed to update settings")
  }
}
