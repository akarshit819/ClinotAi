import { NextRequest, NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { reactivateSubscription } from "@/lib/billing"

export async function POST(req: NextRequest) {
  try {
    const { clinicId } = await getClinicId(req)
    await reactivateSubscription(clinicId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    const message = error?.message || "Failed to reactivate subscription"
    const status = message.includes("No subscription") || message.includes("not scheduled") ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}