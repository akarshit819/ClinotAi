import { NextRequest, NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { createCheckoutSession, getPlanBySlug } from "@/lib/billing"

export async function POST(req: NextRequest) {
  try {
    const { clinicId } = await getClinicId(req)
    const body = await req.json().catch(() => ({}))
    const { plan } = body

    if (!plan || typeof plan !== "string") {
      return NextResponse.json({ error: "Plan slug is required" }, { status: 400 })
    }

    const planData = await getPlanBySlug(plan)
    if (!planData) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 })
    }

    const session = await createCheckoutSession(clinicId, plan)
    return NextResponse.json(session)
  } catch (error: any) {
    const message = error?.message || "Failed to create checkout session"
    const status = message.includes("No price") || message.includes("Invalid") ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}