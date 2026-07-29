import { NextRequest, NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { getBillingData } from "@/lib/billing"

export async function GET(req: NextRequest) {
  try {
    const { clinicId } = await getClinicId(req)
    const data = await getBillingData(clinicId)
    return NextResponse.json(data)
  } catch (error: any) {
    const message = error?.message || "Failed to fetch billing data"
    const status = message.includes("subscription") || message.includes("Authentication") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}