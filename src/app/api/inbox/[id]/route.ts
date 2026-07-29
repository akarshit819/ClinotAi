import { NextRequest, NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { requireFeatureAccess } from "@/lib/billing"
import { getConversationDetail, markConversationRead, updateConversationStatus } from "@/messaging"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { clinicId } = await getClinicId(req)
    await requireFeatureAccess(clinicId, "messaging")
    const conversation = await getConversationDetail(params.id, clinicId)

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    }

    await markConversationRead(params.id, clinicId)

    return NextResponse.json(conversation)
  } catch (error: any) {
    if (error?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    console.error("Conversation error:", error)
    return NextResponse.json({ error: "Failed to load conversation" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { clinicId } = await getClinicId(req)
    await requireFeatureAccess(clinicId, "messaging")
    const body = await req.json()

    if (body.status) {
      await updateConversationStatus(params.id, clinicId, body.status)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    return NextResponse.json({ error: "Failed to update conversation" }, { status: 500 })
  }
}
