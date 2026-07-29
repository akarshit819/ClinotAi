import { prisma } from "@/lib/db"
import { getClinicId, apiError, apiSuccess } from "@/lib/api"
import { fetchWithCache, getCacheKey, getDashboardCacheTTL } from "@/lib/cache"
import { requireActiveSubscription } from "@/lib/billing"

export async function GET(request: Request) {
  try {
    const { clinicId } = await getClinicId(request)
    await requireActiveSubscription(clinicId)
    const cacheKey = getCacheKey("dashboard", clinicId)
    const data = await fetchWithCache(cacheKey, async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const [totalConversations, appointments, emergencies, leads, recentLeads, conversations] =
        await Promise.all([
          prisma.conversation.count({ where: { clinicId } }),
          prisma.appointment.count({ where: { clinicId, isEmergency: false } }),
          prisma.appointment.count({ where: { clinicId, isEmergency: true } }),
          prisma.lead.count({ where: { clinicId } }),
          prisma.lead.findMany({
            where: { clinicId },
            orderBy: { createdAt: "desc" },
            take: 10,
          }),
          prisma.conversation.findMany({
            where: { clinicId },
            orderBy: { createdAt: "desc" },
            take: 50,
            include: { messages: { where: { role: "user" }, take: 1 } },
          }),
        ])

      const questionCounts: Record<string, number> = {}
      conversations.forEach((conv) => {
        conv.messages.forEach((msg) => {
          const q = msg.content.slice(0, 40)
          questionCounts[q] = (questionCounts[q] || 0) + 1
        })
      })
      const popularQuestions = Object.entries(questionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([question, count]) => ({ question, count }))

      const leadsWithNames = recentLeads.map((l) => ({
        id: l.id,
        name: l.email?.split("@")[0] ?? l.phone ?? "Unknown",
        phone: l.phone ?? "",
        reason: l.interestedIn ?? "General inquiry",
        priority: l.status === "new" ? "urgent" : "normal",
        time: l.createdAt.toISOString(),
        status: l.status,
      }))

      return {
        stats: {
          newLeads: leads,
          appointmentsRequested: appointments + emergencies,
          awaitingCallback: emergencies,
          urgentCases: emergencies,
        },
        leads: leadsWithNames,
        insight: popularQuestions.length > 0
          ? `Patients are asking about "${popularQuestions[0].question}" most frequently (${popularQuestions[0].count} times). Consider adding this to your FAQ.`
          : "Start receiving patient inquiries to get AI-powered insights.",
      }
    }, getDashboardCacheTTL())

    return apiSuccess(data)
  } catch (error) {
    return apiError("Failed to load dashboard data")
  }
}
