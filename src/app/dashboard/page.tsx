import type { Metadata } from "next"
import { Suspense } from "react"
import { cookies } from "next/headers"
import { prisma } from "@/lib/db"
import { verifyAccessToken } from "@/lib/auth"
import { StatsCard } from "@/components/dashboard/StatsCard"
import { Card, CardContent, CardHeader } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { PageHeader } from "@/components/ui/PageHeader"
import { EmptyState } from "@/components/ui/EmptyState"
import {
  Users,
  CalendarCheck,
  Clock,
  AlertTriangle,
  MessageSquare,
  Calendar,
  Lightbulb,
  ArrowRight,
  Inbox,
  Link2,
  BookOpen,
  Settings,
  Activity,
  ShieldCheck,
  TrendingUp,
} from "lucide-react"
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

function AppointmentsSkeleton() {
  return (
    <Card className="p-5 space-y-3 animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-navy-50 dark:bg-navy-700" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 rounded bg-navy-100 dark:bg-navy-600" />
            <div className="h-2.5 w-24 rounded bg-navy-50 dark:bg-navy-700" />
          </div>
        </div>
      ))}
    </Card>
  )
}

async function DashboardStats() {
  const cookieStore = cookies()
  const token = cookieStore.get("access_token")?.value
  if (!token) return null
  const payload = await verifyAccessToken(token)
  if (!payload) return null

  const [totalLeads, appointments, emergencies, pendingAppointments, unreadConversations] = await Promise.all([
    prisma.lead.count({ where: { clinicId: payload.clinicId } }),
    prisma.appointment.count({ where: { clinicId: payload.clinicId, isDeleted: false } }),
    prisma.appointment.count({ where: { clinicId: payload.clinicId, isEmergency: true, isDeleted: false } }),
    prisma.appointment.count({ where: { clinicId: payload.clinicId, status: "pending", isDeleted: false } }),
    prisma.conversation.count({ where: { clinicId: payload.clinicId, unreadCount: { gt: 0 } } }),
  ])

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-stagger">
      <div className="animate-fade-in-up"><StatsCard title="Total Leads" value={totalLeads} icon={Users} color="primary" /></div>
      <div className="animate-fade-in-up"><StatsCard title="Appointments" value={appointments} icon={CalendarCheck} color="emerald" /></div>
      <div className="animate-fade-in-up"><StatsCard title="Pending Review" value={pendingAppointments} icon={Clock} color="amber" /></div>
      <div className="animate-fade-in-up"><StatsCard title="Urgent / Unread" value={emergencies + unreadConversations} icon={AlertTriangle} color="red" /></div>
    </div>
  )
}

async function UpcomingAppointments() {
  const cookieStore = cookies()
  const token = cookieStore.get("access_token")?.value
  if (!token) return null
  const payload = await verifyAccessToken(token)
  if (!payload) return null

  const todayStr = new Date().toISOString().slice(0, 10)

  let appointments: Array<{
    id: string
    patientName: string
    phone: string
    preferredDate: string | null
    preferredTime: string | null
    status: string
    reason: string
  }> = []
  try {
    appointments = await prisma.appointment.findMany({
      where: {
        clinicId: payload.clinicId,
        isDeleted: false,
        status: { in: ["pending", "confirmed"] },
        preferredDate: { gte: todayStr },
      },
      orderBy: [{ preferredDate: "asc" }, { preferredTime: "asc" }],
      take: 5,
      select: { id: true, patientName: true, phone: true, preferredDate: true, preferredTime: true, status: true, reason: true },
    })
  } catch {
    appointments = []
  }

  if (appointments.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight text-navy-900 dark:text-navy-100 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary-500" />
              Upcoming Appointments
            </h3>
            <Link href="/dashboard/appointments" className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">View all</Link>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col items-center py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-50 dark:bg-navy-800 text-navy-400 dark:text-navy-500 mb-3">
              <CalendarCheck className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-navy-700 dark:text-navy-200">No upcoming appointments</p>
            <p className="text-xs text-navy-400 dark:text-navy-500 mt-1 max-w-[260px]">Confirmed appointments in the next 7 days will appear here. New bookings from WhatsApp land instantly.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight text-navy-900 dark:text-navy-100 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary-500" />
            Upcoming Appointments
          </h3>
          <Link href="/dashboard/appointments" className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">View all →</Link>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-navy-75 dark:divide-navy-700/60">
          {appointments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                <CalendarCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-navy-900 dark:text-navy-100">{a.patientName || "Unnamed"}</p>
                <p className="truncate text-xs text-navy-400 dark:text-navy-500">
                  {a.preferredDate ? new Date(a.preferredDate).toLocaleDateString() : "—"} {a.preferredTime ? `· ${a.preferredTime}` : ""} {a.reason ? `· ${a.reason.slice(0, 28)}` : ""}
                </p>
              </div>
              <Badge variant={a.status === "confirmed" ? "success" : "warning"} size="sm">{a.status}</Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function QuickActions() {
  const actions = [
    { href: "/dashboard/inbox", label: "Open Inbox", desc: "Reply to patients", icon: Inbox, color: "bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400" },
    { href: "/dashboard/appointments", label: "Appointments", desc: "Calendar & status", icon: CalendarCheck, color: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" },
    { href: "/dashboard/integrations", label: "Connect Channel", desc: "WhatsApp setup", icon: Link2, color: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" },
    { href: "/dashboard/knowledge", label: "Knowledge Base", desc: "Train Clinot AI", icon: BookOpen, color: "bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400" },
  ]
  return (
    <Card>
      <CardHeader className="pb-3">
        <h3 className="text-sm font-semibold tracking-tight text-navy-900 dark:text-navy-100 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary-500" />
          Quick Actions
        </h3>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-3">
          {actions.map((a) => {
            const Icon = a.icon
            return (
              <Link key={a.href} href={a.href} className="group flex flex-col items-start gap-2 rounded-xl border border-navy-100 dark:border-navy-700 bg-navy-25/50 dark:bg-navy-800/50 p-3.5 hover:bg-white dark:hover:bg-navy-750 hover:shadow-card hover:border-navy-150 dark:hover:border-navy-600 transition-all">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${a.color}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-xs font-semibold text-navy-900 dark:text-navy-100">{a.label}</span>
                  <span className="block text-2xs text-navy-400 dark:text-navy-500">{a.desc}</span>
                </span>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

async function SystemStatus() {
  const cookieStore = cookies()
  const token = cookieStore.get("access_token")?.value
  if (!token) return null
  const payload = await verifyAccessToken(token)
  if (!payload) return null

  let whatsappConnected = false
  let pendingCount = 0
  let unread = 0
  try {
    const [integration, pending, unreadConv] = await Promise.all([
      prisma.integration.findFirst({ where: { clinicId: payload.clinicId, platform: "whatsapp" } }),
      prisma.appointment.count({ where: { clinicId: payload.clinicId, status: "pending", isDeleted: false } }),
      prisma.conversation.count({ where: { clinicId: payload.clinicId, unreadCount: { gt: 0 } } }),
    ])
    whatsappConnected = integration?.status === "connected" && integration?.enabled === true
    pendingCount = pending
    unread = unreadConv
  } catch {
    // graceful fallback
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <h3 className="text-sm font-semibold tracking-tight text-navy-900 dark:text-navy-100 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary-500" />
          System Status
        </h3>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-navy-100 dark:border-navy-700 bg-navy-25/70 dark:bg-navy-800/50 px-3 py-2.5">
          <span className="flex items-center gap-2 text-xs font-medium text-navy-700 dark:text-navy-200">
            <span className={`h-2 w-2 rounded-full ${whatsappConnected ? "bg-emerald-500" : "bg-amber-500"}`} />
            WhatsApp
          </span>
          <Badge variant={whatsappConnected ? "success" : "warning"} size="sm">{whatsappConnected ? "Connected" : "Not connected"}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-navy-100 dark:border-navy-700 bg-white dark:bg-navy-800 p-3">
            <p className="text-2xs font-semibold tracking-wider uppercase text-navy-400 dark:text-navy-500">Pending</p>
            <p className="text-lg font-bold text-navy-900 dark:text-navy-100 mt-1">{pendingCount}</p>
            <p className="text-2xs text-navy-400 dark:text-navy-500">Need review</p>
          </div>
          <div className="rounded-xl border border-navy-100 dark:border-navy-700 bg-white dark:bg-navy-800 p-3">
            <p className="text-2xs font-semibold tracking-wider uppercase text-navy-400 dark:text-navy-500">Unread</p>
            <p className="text-lg font-bold text-navy-900 dark:text-navy-100 mt-1">{unread}</p>
            <p className="text-2xs text-navy-400 dark:text-navy-500">Inbox</p>
          </div>
        </div>
        {!whatsappConnected && (
          <Link href="/dashboard/integrations" className="flex items-center justify-center gap-1.5 rounded-xl bg-primary-500 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-600 transition-colors">
            Connect WhatsApp
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
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
    take: 5,
  })

  if (recentLeads.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <h3 className="text-sm font-semibold tracking-tight text-navy-900 dark:text-navy-100 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary-500" />
            Recent Leads
          </h3>
        </CardHeader>
        <CardContent className="pt-0">
          <EmptyState
            icon={Users}
            title="No leads yet"
            description="When visitors leave contact info, they appear here with status and follow-up actions."
            action={
              <Link href="/dashboard/integrations">
                <Button size="sm" variant="secondary">
                  Connect WhatsApp
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            }
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-navy-900 dark:text-navy-100 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary-500" />
          Recent Leads
        </h3>
        <Link href="/dashboard/leads" className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">View all →</Link>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-navy-75 dark:divide-navy-700/60">
          {recentLeads.map((lead) => (
            <li key={lead.id} className="flex items-center gap-3 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                <Users className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-navy-900 dark:text-navy-100">{lead.email?.split("@")[0] ?? lead.phone ?? "Anonymous"}</p>
                <p className="truncate text-xs text-navy-400 dark:text-navy-500">{lead.interestedIn ?? "General inquiry"}</p>
              </div>
              <Badge variant={lead.status === "new" ? "primary" : "neutral"} size="sm">
                {lead.status}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
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
    <Card className="p-4 bg-primary-25 dark:bg-primary-900/20 border-primary-100 dark:border-primary-800">
      <div className="flex items-start gap-3">
        <Lightbulb className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-navy-900 dark:text-navy-100 mb-1">AI Insight</p>
          <p className="text-sm text-navy-600 dark:text-navy-300 leading-relaxed">
            Patients ask about &ldquo;{topQuestion}&rdquo; ({topCount}×). Add it to your FAQ to reduce repeat questions.
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
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clinic Overview"
        description={`${today} · Live operations from WhatsApp, appointments, and patient leads`}
        actions={
          <Link href="/dashboard/inbox">
            <Button size="sm" variant="secondary">
              <MessageSquare className="h-4 w-4" />
              Open Inbox
            </Button>
          </Link>
        }
      />

      <Suspense fallback={<StatsSkeleton />}>
        <DashboardStats />
      </Suspense>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Suspense fallback={<AppointmentsSkeleton />}>
            <UpcomingAppointments />
          </Suspense>
          <Suspense fallback={<LeadsSkeleton />}>
            <LeadList />
          </Suspense>
        </div>
        <div className="space-y-6">
          <QuickActions />
          <Suspense fallback={<div className="rounded-2xl border border-navy-100 dark:border-navy-700 bg-white dark:bg-navy-800 p-5 animate-pulse h-32" />}>
            <SystemStatus />
          </Suspense>
          <Suspense fallback={null}>
            <AIInsight />
          </Suspense>
          <Card className="p-4 bg-navy-900 dark:bg-navy-800 text-white dark:text-navy-100 border-navy-800 dark:border-navy-700">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 shrink-0">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold">Need more patients?</p>
                <p className="text-xs text-white/70 leading-relaxed mt-1">Add Clinot to your Google Business profile and website to capture 3× more inquiries.</p>
                <Link href="/dashboard/integrations" className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-white underline decoration-white/30 hover:decoration-white">
                  Connect a channel <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
