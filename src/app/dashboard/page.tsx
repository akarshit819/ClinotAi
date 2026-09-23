import type { Metadata } from "next"
import { Suspense } from "react"
import { cookies } from "next/headers"
import { prisma } from "@/lib/db"
import { verifyAccessToken } from "@/lib/auth"
import { StatsCard } from "@/components/dashboard/StatsCard"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { PageHeader } from "@/components/ui/PageHeader"
import { EmptyState } from "@/components/ui/EmptyState"
import { Users, CalendarCheck, Clock, AlertTriangle, Phone, MessageSquare, CheckCircle, Calendar, Lightbulb, ArrowRight } from "lucide-react"
import Link from "next/link"

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-navy-75 dark:border-navy-700 bg-white dark:bg-navy-800 p-5 space-y-3 animate-pulse">
          <div className="h-4 w-24 rounded-lg bg-navy-50 dark:bg-navy-700" />
          <div className="h-8 w-16 rounded-lg bg-navy-100 dark:bg-navy-600" />
        </div>
      ))}
    </div>
  )
}

function LeadsSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-navy-75 dark:border-navy-700 bg-white dark:bg-navy-800 p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-navy-50 dark:bg-navy-700" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-36 rounded-lg bg-navy-100 dark:bg-navy-600" />
            <div className="h-3 w-24 rounded-lg bg-navy-50 dark:bg-navy-700" />
          </div>
        </div>
      ))}
    </div>
  )
}

async function DashboardStats() {
  const cookieStore = cookies()
  const token = cookieStore.get("access_token")?.value
  if (!token) return null
  const payload = await verifyAccessToken(token)
  if (!payload) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [totalLeads, appointments, emergencies, pendingAppointments] = await Promise.all([
    prisma.lead.count({ where: { clinicId: payload.clinicId } }),
    prisma.appointment.count({ where: { clinicId: payload.clinicId, isEmergency: false } }),
    prisma.appointment.count({ where: { clinicId: payload.clinicId, isEmergency: true } }),
    prisma.appointment.count({
      where: { clinicId: payload.clinicId, status: "pending" },
    }),
  ])

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-stagger">
      <div className="animate-fade-in-up"><StatsCard title="New Leads" value={totalLeads} icon={Users} color="primary" /></div>
      <div className="animate-fade-in-up"><StatsCard title="Appointments" value={appointments} icon={CalendarCheck} color="emerald" /></div>
      <div className="animate-fade-in-up"><StatsCard title="Awaiting Callback" value={pendingAppointments} icon={Clock} color="amber" /></div>
      <div className="animate-fade-in-up"><StatsCard title="Urgent Cases" value={emergencies} icon={AlertTriangle} color="red" /></div>
    </div>
  )
}

async function LeadList() {
  const cookieStore = cookies()
  const token = cookieStore.get("access_token")?.value
  if (!token) return null
  const payload = await verifyAccessToken(token)
  if (!payload) return null

  const recentLeads = await prisma.lead.findMany({
    where: { clinicId: payload.clinicId },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  if (recentLeads.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Ready to capture your first lead?"
        description="Connect your WhatsApp Business account to start answering patient inquiries and capturing leads automatically."
        action={
          <Link href="/dashboard/integrations">
            <Button size="sm">
              Connect WhatsApp
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        }
      />
    )
  }

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-navy-75 dark:divide-navy-700/60">
        {recentLeads.map((lead) => (
          <li key={lead.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-navy-25 dark:hover:bg-navy-750/60 sm:gap-4 sm:px-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-navy-900 dark:text-navy-100">{lead.email?.split("@")[0] ?? lead.phone ?? "Unknown"}</p>
              <p className="truncate text-xs text-navy-400 dark:text-navy-400">{lead.interestedIn ?? "General inquiry"}</p>
            </div>
            <Badge variant={lead.status === "new" ? "primary" : "neutral"} size="sm">
              {lead.status}
            </Badge>
            <span className="hidden shrink-0 text-xs text-navy-300 dark:text-navy-500 sm:inline">{new Date(lead.createdAt).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

async function AIInsight() {
  const cookieStore = cookies()
  const token = cookieStore.get("access_token")?.value
  if (!token) return null
  const payload = await verifyAccessToken(token)
  if (!payload) return null

  const conversations = await prisma.conversation.findMany({
    where: { clinicId: payload.clinicId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { messages: { where: { role: "user" }, take: 1 } },
  })

  const questionCounts: Record<string, number> = {}
  let topQuestion = ""
  let topCount = 0

  conversations.forEach((conv) => {
    conv.messages.forEach((msg) => {
      const q = msg.content.slice(0, 40)
      const count = (questionCounts[q] || 0) + 1
      questionCounts[q] = count
      if (count > topCount) {
        topCount = count
        topQuestion = q
      }
    })
  })

  if (!topQuestion) return null

  return (
    <Card className="p-5 bg-primary-25 dark:bg-primary-900/20 border-primary-100 dark:border-primary-800">
      <div className="flex items-start gap-3">
        <Lightbulb className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-navy-900 dark:text-navy-100 mb-1">AI Insight</p>
          <p className="text-sm text-navy-500 dark:text-navy-400 leading-relaxed">
            Patients are asking about &ldquo;{topQuestion}&rdquo; most frequently ({topCount} times). Consider adding this to your FAQ.
          </p>
        </div>
      </div>
    </Card>
  )
}

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Receptionist"
        description="Overview of patient activity and leads"
      />
      <Suspense fallback={<StatsSkeleton />}>
        <DashboardStats />
      </Suspense>
      <section className="space-y-3" aria-labelledby="recent-leads-heading">
        <h2 id="recent-leads-heading" className="text-sm font-semibold tracking-tight text-navy-900 dark:text-navy-100">Recent Leads</h2>
        <Suspense fallback={<LeadsSkeleton />}>
          <LeadList />
        </Suspense>
      </section>
      <Suspense fallback={null}>
        <AIInsight />
      </Suspense>
    </div>
  )
}
