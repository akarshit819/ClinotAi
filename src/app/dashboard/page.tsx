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
  Calendar,
  Lightbulb,
  ArrowRight,
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

  const [totalPatients, appointments, pendingAppointments, emergencies] = await Promise.all([
    prisma.patient.count({ where: { clinicId: payload.clinicId } }),
    prisma.appointment.count({ where: { clinicId: payload.clinicId, isDeleted: false } }),
    prisma.appointment.count({ where: { clinicId: payload.clinicId, isEmergency: true, isDeleted: false } }),
    prisma.appointment.count({ where: { clinicId: payload.clinicId, status: "pending", isDeleted: false } }),
  ])

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-stagger">
      <div className="animate-fade-in-up"><StatsCard title="Total Patients" value={totalPatients} icon={Users} color="primary" /></div>
      <div className="animate-fade-in-up"><StatsCard title="Appointments" value={appointments} icon={CalendarCheck} color="emerald" /></div>
      <div className="animate-fade-in-up"><StatsCard title="Pending Review" value={pendingAppointments} icon={Clock} color="amber" /></div>
      <div className="animate-fade-in-up"><StatsCard title="Urgent Cases" value={emergencies} icon={AlertTriangle} color="red" /></div>
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
            <p className="text-xs text-navy-400 dark:text-navy-500 mt-1 max-w-[260px]">Confirmed appointments will appear here. New bookings from WhatsApp land instantly.</p>
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

async function RecentPatientHistory() {
  const cookieStore = cookies()
  const token = cookieStore.get("access_token")?.value
  if (!token) return null
  const payload = await verifyAccessToken(token)
  if (!payload) return null

  let recentAppointments: Array<{
    id: string
    patientName: string
    phone: string
    preferredDate: string | null
    preferredTime: string | null
    status: string
    createdAt: Date
  }> = []
  try {
    recentAppointments = await prisma.appointment.findMany({
      where: { clinicId: payload.clinicId, isDeleted: false },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, patientName: true, phone: true, preferredDate: true, preferredTime: true, status: true, createdAt: true },
    })
  } catch {
    recentAppointments = []
  }

  if (recentAppointments.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <h3 className="text-sm font-semibold tracking-tight text-navy-900 dark:text-navy-100 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary-500" />
            Recent Appointments
          </h3>
        </CardHeader>
        <CardContent className="pt-0">
          <EmptyState
            icon={Users}
            title="No patient history yet"
            description="When patients book appointments, their visit history will appear here grouped by patient with date, time, and status."
            action={
              <Link href="/dashboard/patients">
                <Button size="sm" variant="secondary">
                  View Patient History
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
          Recent Patient History
        </h3>
        <Link href="/dashboard/patients" className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">View all →</Link>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-navy-75 dark:divide-navy-700/60">
          {recentAppointments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                <Users className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-navy-900 dark:text-navy-100">{a.patientName || "Unnamed"}</p>
                <p className="truncate text-xs text-navy-400 dark:text-navy-500">
                  {a.preferredDate ? new Date(a.preferredDate).toLocaleDateString() : new Date(a.createdAt).toLocaleDateString()} {a.preferredTime ? `· ${a.preferredTime}` : ""} · {a.phone || "No phone"}
                </p>
              </div>
              <Badge variant={a.status === "confirmed" ? "success" : a.status === "cancelled" ? "danger" : a.status === "completed" ? "neutral" : "warning"} size="sm">
                {a.status}
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
        description={`${today} · Live appointments and patient history from your clinic`}
      />

      <Suspense fallback={<StatsSkeleton />}>
        <DashboardStats />
      </Suspense>

      <Suspense fallback={<AppointmentsSkeleton />}>
        <UpcomingAppointments />
      </Suspense>

      <Suspense fallback={<div className="rounded-2xl border border-navy-75 dark:border-navy-700 bg-white dark:bg-navy-800 p-5 animate-pulse h-24" />}>
        <RecentPatientHistory />
      </Suspense>

      <Suspense fallback={null}>
        <AIInsight />
      </Suspense>
    </div>
  )
}
