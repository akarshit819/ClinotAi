import { prisma } from "@/lib/db"
import { getClinicId, apiError, apiSuccess } from "@/lib/api"

export async function GET(request: Request) {
  try {
    const { clinicId } = await getClinicId(request)

    const [totalConversations, totalLeads, totalAppointments, services, conversations, subscription, totalInvoices, paidRevenue] = await Promise.all([
      prisma.conversation.count({ where: { clinicId } }),
      prisma.lead.count({ where: { clinicId } }),
      prisma.appointment.count({ where: { clinicId } }),
      prisma.service.findMany({ where: { clinicId } }),
      prisma.conversation.findMany({
        where: { clinicId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.subscription.findFirst({
        where: { clinicId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.invoice.count({ where: { clinicId } }),
      prisma.invoice.aggregate({
        where: { clinicId, status: "paid" },
        _sum: { amount: true },
      }),
    ])

    const dayCounts: Record<string, number> = {}
    conversations.forEach((c) => {
      const day = c.createdAt.toLocaleDateString("en-US", { weekday: "long" })
      dayCounts[day] = (dayCounts[day] || 0) + 1
    })
    const busiestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"

    const topRequest = services.length > 0 ? `${services.length} services` : "—"

    return apiSuccess({
      conversations: totalConversations,
      leads: totalLeads,
      appointments: totalAppointments,
      busiestDay,
      topRequest,
      billing: {
        plan: subscription?.plan || "starter",
        status: subscription?.status || "inactive",
        totalInvoices,
        paidRevenue: paidRevenue._sum?.amount || 0,
        cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd || false,
      },
    })
  } catch (error) {
    return apiError("Failed to load analytics")
  }
}
