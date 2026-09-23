"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { PageHeader } from "@/components/ui/PageHeader"
import { EmptyState } from "@/components/ui/EmptyState"
import { Users, Calendar, Clock, Phone, Search, X, Loader2, ChevronDown } from "lucide-react"
import { apiFetch } from "@/lib/client-auth"
import Link from "next/link"

interface Appointment {
  id: string
  patientName: string | null
  patientPhone: string | null
  phone: string
  reason: string | null
  date: string | null
  preferredDate: string | null
  time: string | null
  preferredTime: string | null
  status: string
  createdAt: string
  isEmergency?: boolean
}

interface GroupedPatient {
  key: string
  name: string
  phone: string
  appointments: Appointment[]
  lastVisit: string | null
  total: number
}

const statusVariant: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  confirmed: "success",
  pending: "warning",
  cancelled: "danger",
  completed: "neutral",
  no_show: "danger",
}

function formatDate(d: string | null): string {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return d
  }
}

function monthOptions() {
  const opts: { value: string; label: string }[] = [{ value: "all", label: "All months" }]
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    opts.push({ value: v, label })
  }
  return opts
}

export default function PatientsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [month, setMonth] = useState("all")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch("/api/appointments")
      .then(async (r) => {
        const data = await r.json().catch(() => null)
        if (!r.ok) throw new Error(data?.error || `Request failed (${r.status})`)
        if (!Array.isArray(data)) throw new Error("Unexpected response")
        setAppointments(data as Appointment[])
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load patient history"))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return appointments.filter((a) => {
      const q = search.toLowerCase().trim()
      if (q) {
        const hay = `${a.patientName || ""} ${a.phone || ""} ${a.patientPhone || ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (month !== "all") {
        const d = a.preferredDate || a.date
        if (!d || !d.startsWith(month)) return false
      }
      return true
    })
  }, [appointments, search, month])

  const grouped: GroupedPatient[] = useMemo(() => {
    const map = new Map<string, GroupedPatient>()
    for (const a of filtered) {
      const phone = (a.phone || a.patientPhone || "").trim() || "unknown"
      const name = (a.patientName || "").trim() || "Unnamed"
      const key = phone !== "unknown" ? phone : `name:${name.toLowerCase()}`
      if (!map.has(key)) {
        map.set(key, { key, name, phone: phone === "unknown" ? "—" : phone, appointments: [], lastVisit: null, total: 0 })
      }
      const g = map.get(key)!
      g.appointments.push(a)
      g.total++
    }
    // sort appointments within each patient by date desc, and patients by last visit desc
    for (const g of Array.from(map.values())) {
      g.appointments.sort((x: Appointment, y: Appointment) => {
        const dx = x.preferredDate || x.date || ""
        const dy = y.preferredDate || y.date || ""
        return dy.localeCompare(dx)
      })
      g.lastVisit = g.appointments[0]?.preferredDate || g.appointments[0]?.date || null
    }
    return Array.from(map.values()).sort((a, b) => (b.lastVisit || "").localeCompare(a.lastVisit || ""))
  }, [filtered])

  const months = useMemo(() => monthOptions(), [])

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Patient History" description="Patients who have booked appointments with your clinic" />
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-navy-300 dark:text-navy-600" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Patient History" description="Patients who have booked appointments with your clinic" />
        <Card className="border-danger-200 dark:border-danger-800">
          <CardContent className="p-8 text-center">
            <p className="text-sm font-medium text-danger-700 dark:text-danger-300">{error}</p>
            <Button size="sm" variant="secondary" className="mt-4" onClick={() => window.location.reload()}>Try again</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patient History"
        description={`${appointments.length} appointment${appointments.length === 1 ? "" : "s"} · ${grouped.length} patient${grouped.length === 1 ? "" : "s"} · Grouped by patient with month filter`}
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-400 dark:text-navy-500" />
          <input
            type="text"
            placeholder="Search by patient name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9 pr-8"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-navy-400 dark:text-navy-500" />
            </button>
          )}
        </div>
        <div className="relative">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="input-field pr-8 appearance-none min-w-[180px]"
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-400 dark:text-navy-500 pointer-events-none" />
        </div>
      </div>

      {appointments.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No patient history yet"
          description="When patients book appointments via WhatsApp or the dashboard, they will appear here with visit history grouped by patient."
          action={
            <Link href="/dashboard/appointments">
              <Button size="sm" variant="secondary">View Appointments</Button>
            </Link>
          }
        />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No results"
          description={search ? "No patients match your search." : `No appointments in ${months.find((m) => m.value === month)?.label || month}.`}
        />
      ) : (
        <div className="space-y-4">
          {grouped.map((p) => (
            <Card key={p.key} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
                      <Users className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy-900 dark:text-navy-100">{p.name}</p>
                      <p className="flex items-center gap-1.5 truncate text-xs text-navy-400 dark:text-navy-500">
                        <Phone className="h-3 w-3" />
                        {p.phone}
                        <span className="text-navy-300 dark:text-navy-600">·</span>
                        {p.total} visit{p.total === 1 ? "" : "s"}
                        {p.lastVisit && ` · Last: ${formatDate(p.lastVisit)}`}
                      </p>
                    </div>
                  </div>
                  <Badge variant="neutral" size="sm">{p.total} {p.total === 1 ? "visit" : "visits"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="divide-y divide-navy-75 dark:divide-navy-700/60">
                  {p.appointments.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 py-2.5 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-navy-600 dark:text-navy-300">
                        <Calendar className="h-3.5 w-3.5 text-navy-400 dark:text-navy-500" />
                        {a.preferredDate || a.date ? formatDate(a.preferredDate || a.date) : "—"}
                      </span>
                      {(a.preferredTime || a.time) && (
                        <span className="inline-flex items-center gap-1 text-navy-500 dark:text-navy-400">
                          <Clock className="h-3 w-3" />
                          {a.preferredTime || a.time}
                        </span>
                      )}
                      <Badge variant={statusVariant[a.status] || "neutral"} size="sm">{a.status}</Badge>
                      {a.reason && <span className="text-navy-400 dark:text-navy-500 truncate max-w-[180px]">· {a.reason}</span>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
