import { NextRequest, NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { createPortalSession } from "@/lib/billing"

export async function POST(req: NextRequest) {
  try {
    const { clinicId } = await getClinicId(req)
    const session = await createPortalSession(clinicId)
    return NextResponse.json(session)
  } catch (error: any) {
    const message = error?.message || "Failed to create portal session"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}