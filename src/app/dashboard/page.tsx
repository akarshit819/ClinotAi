import type { Metadata } from "next"
import { Suspense } from "react"
import { cookies } from "next/headers"
import { prisma } from "@/lib/db"
import { verifyAccessToken } from "@/lib/auth"
import { StatsCard } from "@/components/dashboard/StatsCard"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatsCard title="New Leads" value={totalLeads} icon={Users} color="primary" />
      <StatsCard title="Appointments" value={appointments} icon={CalendarCheck} color="emerald" />
      <StatsCard title="Awaiting Callback" value={pendingAppointments} icon={Clock} color="amber" />
      <StatsCard title="Urgent Cases" value={emergencies} icon={AlertTriangle} color="red" />
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
      <Card className="p-10 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mb-4">
          <Users className="h-6 w-6" />
        </div>
        <p className="text-base font-semibold text-navy-900 dark:text-navy-100 mb-1">Ready to capture your first lead?</p>
        <p className="text-sm text-navy-400 dark:text-navy-400 mb-4 max-w-sm mx-auto">
          Install the Clinot widget on your website to start answering patient questions and collecting leads automatically.
        </p>
        <Link href="/dashboard/website-integration">
          <Button size="sm">
            Install Widget
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {recentLeads.map((lead) => (
        <Card key={lead.id} className="p-4">
          <CardContent className="p-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-navy-900 dark:text-navy-100">{lead.email?.split("@")[0] ?? lead.phone ?? "Unknown"}</p>
                  <p className="text-xs text-navy-400 dark:text-navy-400">{lead.interestedIn ?? "General inquiry"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={lead.status === "new" ? "primary" : "neutral"} size="sm">
                  {lead.status}
                </Badge>
                <span className="text-xs text-navy-300 dark:text-navy-500">{new Date(lead.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
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
    <div className="space-y-8">
      <div className="animate-fade-in">
        <h1 className="text-xl font-bold text-navy-900 dark:text-navy-100 tracking-tight">AI Receptionist</h1>
        <p className="text-sm text-navy-400 dark:text-navy-400 mt-1">Overview of patient activity and leads</p>
      </div>
      <Suspense fallback={<StatsSkeleton />}>
        <DashboardStats />
      </Suspense>
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100">Recent Leads</h2>
        <Suspense fallback={<LeadsSkeleton />}>
          <LeadList />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <AIInsight />
      </Suspense>
    </div>
  )
}
