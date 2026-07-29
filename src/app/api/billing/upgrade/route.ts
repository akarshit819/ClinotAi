import { NextRequest, NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { changePlan, getAllPlans, getPlanBySlug } from "@/lib/billing"

export async function POST(req: NextRequest) {
  try {
    const { clinicId } = await getClinicId(req)
    const body = await req.json().catch(() => ({}))
    const { plan: newPlan } = body

    if (!newPlan || typeof newPlan !== "string") {
      return NextResponse.json({ error: "Plan slug is required" }, { status: 400 })
    }

    const plan = await getPlanBySlug(newPlan)
    if (!plan) {
      return NextResponse.json({ error: `Plan "${newPlan}" not found` }, { status: 400 })
    }

    await changePlan(clinicId, newPlan)

    const plans = await getAllPlans()
    const planData = plans.find((p) => p.slug === newPlan) || null

    return NextResponse.json({ success: true, plan: newPlan, planData })
  } catch (error: any) {
    const message = error?.message || "Failed to change plan"
    const status = message.includes("No active") || message.includes("Already on") || message.includes("No price") ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}