import { NextRequest, NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { requireFeatureAccess } from "@/lib/billing"
import { sendReply } from "@/messaging"
import { prisma } from "@/lib/db"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { clinicId } = await getClinicId(req)
    await requireFeatureAccess(clinicId, "messaging")
    const body = await req.json()

    if (!body.content || typeof body.content !== "string") {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 })
    }

    await sendReply(clinicId, params.id, body.content)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    console.error("Send message error:", error)
    return NextResponse.json({ error: error?.message || "Failed to send message" }, { status: 500 })
  }
}
