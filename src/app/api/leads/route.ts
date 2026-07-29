import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getClinicId, apiError, handleApiError } from "@/lib/api"

export async function GET(request: Request) {
  try {
    const { clinicId } = await getClinicId(request)
    const leads = await prisma.lead.findMany({
      where: { clinicId },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    return NextResponse.json(leads)
  } catch (error) {
    return handleApiError(error, "Failed to fetch leads")
  }
}

export async function POST(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)
    const body = await req.json()
    const { email, phone, interestedIn, source } = body

    if (!email && !phone) {
      return NextResponse.json({ error: "Email or phone is required" }, { status: 400 })
    }

    const lead = await prisma.lead.create({
      data: {
        email: email?.trim().slice(0, 200) || null,
        phone: phone?.trim().slice(0, 20) || null,
        interestedIn: interestedIn?.trim().slice(0, 200) || null,
        source: source?.trim().slice(0, 100) || "chat",
        clinicId,
        status: "new",
      },
    })

    return NextResponse.json(lead, { status: 201 })
  } catch (error) {
    return handleApiError(error, "Failed to create lead")
  }
}

export async function PATCH(req: Request) {
  try {
    const { clinicId } = await getClinicId(req)
    const body = await req.json()
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 })
    }

    const lead = await prisma.lead.updateMany({
      where: { id, clinicId },
      data: { status },
    })

    if (lead.count === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, "Failed to update lead")
  }
}
