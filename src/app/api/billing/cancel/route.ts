import { NextRequest, NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { cancelSubscription } from "@/lib/billing"

export async function POST(req: NextRequest) {
  try {
    const { clinicId } = await getClinicId(req)
    const body = await req.json().catch(() => ({}))
    const immediately = body.immediately === true
    await cancelSubscription(clinicId, immediately)
    return NextResponse.json({ success: true, immediately })
  } catch (error: any) {
    const message = error?.message || "Failed to cancel subscription"
    const status = message.includes("No active") || message.includes("cannot be cancelled") ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}