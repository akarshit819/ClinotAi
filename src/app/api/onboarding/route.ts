import { NextRequest, NextResponse } from "next/server"
import { extractBearerToken, verifyAccessToken } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    const token = extractBearerToken(req)
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    const payload = await verifyAccessToken(token)
    if (!payload) return NextResponse.json({ error: "Session expired" }, { status: 401 })

    const clinic = await prisma.clinic.findUnique({
      where: { id: payload.clinicId },
      select: {
        id: true, name: true, slug: true, logo: true, timezone: true, country: true, language: true,
        specialty: true, businessHours: true, phone: true, email: true, address: true,
        emergencyPhone: true, openingHours: true, welcomeMessage: true, afterHoursMessage: true,
        primaryColor: true, isOnboarded: true, onboardingStep: true,
      },
    })

    if (!clinic) return NextResponse.json({ error: "Clinic not found" }, { status: 404 })

    return NextResponse.json({ clinic })
  } catch {
    return NextResponse.json({ error: "Failed to get onboarding status" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const token = extractBearerToken(req)
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    const payload = await verifyAccessToken(token)
    if (!payload) return NextResponse.json({ error: "Session expired" }, { status: 401 })

    const body = await req.json()
    const { step, data } = body

    if (typeof step !== "number" || step < 1 || step > 5) {
      return NextResponse.json({ error: "Invalid onboarding step" }, { status: 400 })
    }

    const updateData: any = { onboardingStep: step }

    if (data) {
      if (data.name) updateData.name = data.name
      if (data.logo) updateData.logo = data.logo
      if (data.timezone) updateData.timezone = data.timezone
      if (data.country) updateData.country = data.country
      if (data.language) updateData.language = data.language
      if (data.specialty) updateData.specialty = data.specialty
      if (data.phone) updateData.phone = data.phone
      if (data.email) updateData.email = data.email
      if (data.address) updateData.address = data.address
      if (data.emergencyPhone) updateData.emergencyPhone = data.emergencyPhone
      if (data.openingHours) updateData.openingHours = data.openingHours
      if (data.businessHours) updateData.businessHours = JSON.stringify(data.businessHours)
      if (data.welcomeMessage) updateData.welcomeMessage = data.welcomeMessage
      if (data.afterHoursMessage) updateData.afterHoursMessage = data.afterHoursMessage
      if (data.primaryColor) updateData.primaryColor = data.primaryColor
    }

    if (step >= 5) {
      updateData.isOnboarded = true
    }

    await prisma.clinic.update({
      where: { id: payload.clinicId },
      data: updateData,
    })

    return NextResponse.json({ success: true, isOnboarded: step >= 5, onboardingStep: step })
  } catch {
    return NextResponse.json({ error: "Failed to save onboarding data" }, { status: 500 })
  }
}
