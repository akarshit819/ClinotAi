import { NextRequest, NextResponse } from "next/server"
import { getClinicId } from "@/lib/api"
import { requireFeatureAccess } from "@/lib/billing"
import { getConversations, getUnreadCount } from "@/messaging"

export async function GET(req: NextRequest) {
  try {
    const { clinicId } = await getClinicId(req)
    await requireFeatureAccess(clinicId, "messaging")

    const { searchParams } = new URL(req.url)
    const filter = {
      status: searchParams.get("status") || undefined,
      platform: searchParams.get("platform") as any || undefined,
      intent: searchParams.get("intent") as any || undefined,
      isEmergency: searchParams.has("emergency") ? searchParams.get("emergency") === "true" : undefined,
      search: searchParams.get("search") || undefined,
      page: parseInt(searchParams.get("page") || "1"),
      pageSize: parseInt(searchParams.get("pageSize") || "50"),
    }

    const [result, unread] = await Promise.all([
      getConversations(clinicId, filter),
      getUnreadCount(clinicId),
    ])

    return NextResponse.json({ ...result, unreadTotal: unread })
  } catch (error: any) {
    if (error?.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    console.error("Inbox error:", error)
    return NextResponse.json({ error: "Failed to load inbox" }, { status: 500 })
  }
}
