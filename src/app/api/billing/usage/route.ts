import { NextRequest, NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { getCurrentUsage, getUsageWithLimits } from "@/lib/billing"

export async function GET(req: NextRequest) {
  try {
    const { clinicId } = await getClinicId(req)
    const [usage, limits] = await Promise.all([
      getCurrentUsage(clinicId),
      getUsageWithLimits(clinicId),
    ])
    return NextResponse.json({ usage, limits })
  } catch (error: any) {
    const message = error?.message || "Failed to fetch usage data"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}