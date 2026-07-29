"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Calendar as CalendarIcon, Loader2, ChevronLeft, ChevronRight, Clock, User, Phone, X, CheckCircle, XCircle } from "lucide-react"
import { formatDateTime } from "@/lib/utils"

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function fmtDate(d: Date) {
  return `${monthLabels[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function fmtShort(d: Date) {
  return `${monthLabels[d.getMonth()]} ${d.getDate()}`
}

interface Appointment {
  id: string
  patientName: string | null
  patientPhone: string | null
  patientEmail: string | null
  reason: string | null
  date: string | null
  time: string | null
  isEmergency: boolean
  status: string
  createdAt: string
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"list" | "calendar">("list")
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay())
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [selected, setSelected] = useState<Appointment | null>(null)

  useEffect(() => {
    fetch("/api/appointments")
      .then((r) => r.json())
      .then(setAppointments)
      .finally(() => setLoading(false))
  }, [])

  const updateStatus = async (id: string, status: string) => {
    await fetch("/api/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    })
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
  }

  const weekDays: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    weekDays.push(d)
  }

  const getApptsForDay = (d: Date) =>
    appointments.filter((a) => {
      if (!a.date) return false
      const ad = new Date(a.date)
      return ad.toDateString() === d.toDateString()
    })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500 dark:text-primary-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 dark:text-navy-100">Appointments</h1>
          <p className="text-sm text-navy-400 dark:text-navy-400 mt-1">{appointments.length} total appointments</p>
        </div>
        <div className="flex items-center gap-2 bg-navy-50 dark:bg-navy-800 rounded-xl p-1">
          <button onClick={() => setView("list")} className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${view === "list" ? "bg-white dark:bg-navy-700 shadow-sm text-navy-900 dark:text-navy-100" : "text-navy-500 dark:text-navy-400 hover:text-navy-700 dark:hover:text-navy-200"}`}>List</button>
          <button onClick={() => setView("calendar")} className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${view === "calendar" ? "bg-white dark:bg-navy-700 shadow-sm text-navy-900 dark:text-navy-100" : "text-navy-500 dark:text-navy-400 hover:text-navy-700 dark:hover:text-navy-200"}`}>Calendar</button>
        </div>
      </div>

      {view === "calendar" && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d) }} className="p-2 hover:bg-navy-50 dark:hover:bg-navy-750 rounded-lg"><ChevronLeft className="h-4 w-4 text-navy-500 dark:text-navy-400" /></button>
              <span className="text-sm font-semibold text-navy-900 dark:text-navy-100">
                {fmtShort(weekStart)} - {fmtDate(weekDays[6])}
              </span>
              <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d) }} className="p-2 hover:bg-navy-50 dark:hover:bg-navy-750 rounded-lg"><ChevronRight className="h-4 w-4 text-navy-500 dark:text-navy-400" /></button>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((d, i) => {
                const dayAppts = getApptsForDay(d)
                const isToday = d.toDateString() === new Date().toDateString()
                return (
                  <div key={i} className={`p-2 rounded-xl border ${isToday ? "border-primary-200 dark:border-primary-700 bg-primary-50/30 dark:bg-primary-900/20" : "border-navy-100 dark:border-navy-700"}`}>
                    <div className="text-xs font-medium text-navy-400 dark:text-navy-500 mb-1">{dayLabels[d.getDay()]}</div>
                    <div className={`text-lg font-bold mb-2 ${isToday ? "text-primary-600 dark:text-primary-400" : "text-navy-700 dark:text-navy-200"}`}>{d.getDate()}</div>
                    {dayAppts.length === 0 ? (
                      <div className="text-[10px] text-navy-300 dark:text-navy-600">No appts</div>
                    ) : (
                      <div className="space-y-1">
                        {dayAppts.slice(0, 3).map((a) => (
                          <div key={a.id} className={`text-[10px] p-1 rounded-md cursor-pointer ${
                            a.status === "confirmed" ? "bg-emerald-50 text-emerald-700" :
                            a.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                          }`} onClick={() => setSelected(a)}>
                            <div className="font-medium truncate">{a.time || ""} {a.patientName || ""}</div>
                          </div>
                        ))}
                        {dayAppts.length > 3 && <div className="text-[10px] text-navy-400 dark:text-navy-500">+{dayAppts.length - 3} more</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {view === "list" && (
        <div className="space-y-3">
          {appointments.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <CalendarIcon className="h-12 w-12 mx-auto mb-3 text-navy-300 dark:text-navy-600" />
                <p className="text-navy-500 dark:text-navy-400 font-medium">No appointments yet</p>
              </CardContent>
            </Card>
          ) : (
            appointments.map((a) => (
              <Card key={a.id} hover className="cursor-pointer" onClick={() => setSelected(selected?.id === a.id ? null : a)}>
                <CardContent className="pt-5">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      a.isEmergency ? "bg-red-50 dark:bg-red-900/30" : "bg-primary-50 dark:bg-primary-900/30"
                    }`}>
                      <CalendarIcon className={`h-5 w-5 ${a.isEmergency ? "text-red-500" : "text-primary-500"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-navy-900 dark:text-navy-100">{a.patientName || "Unnamed"}</span>
                        <Badge variant={a.isEmergency ? "danger" : "neutral"}>{a.isEmergency ? "Emergency" : "Routine"}</Badge>
                        <Badge variant={a.status === "confirmed" ? "success" : a.status === "pending" ? "warning" : "danger"}>{a.status}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-navy-400 dark:text-navy-500">
                        {a.date && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(new Date(a.date))} {a.time || ""}</span>}
                        {a.reason && <span className="truncate">{a.reason}</span>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {selected && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100">Appointment Details</h2>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-navy-50 dark:hover:bg-navy-750 rounded"><X className="h-4 w-4 text-navy-400 dark:text-navy-500" /></button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-navy-50/50 dark:bg-navy-750/50">
                <div className="text-xs text-navy-400 dark:text-navy-500 mb-1 flex items-center gap-1"><User className="h-3 w-3" /> Patient</div>
                <div className="text-sm font-medium text-navy-900 dark:text-navy-100">{selected.patientName || "N/A"}</div>
              </div>
              <div className="p-3 rounded-xl bg-navy-50/50 dark:bg-navy-750/50">
                <div className="text-xs text-navy-400 dark:text-navy-500 mb-1 flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</div>
                <div className="text-sm text-navy-900 dark:text-navy-100">{selected.patientPhone || "N/A"}</div>
              </div>
            </div>
            {selected.reason && (
              <div className="p-3 rounded-xl bg-navy-50/50 dark:bg-navy-750/50">
                <div className="text-xs text-navy-400 dark:text-navy-500 mb-1">Reason</div>
                <div className="text-sm text-navy-700 dark:text-navy-300">{selected.reason}</div>
              </div>
            )}
            <div className="p-3 rounded-xl bg-navy-50/50 dark:bg-navy-750/50">
              <div className="text-xs text-navy-400 dark:text-navy-500 mb-1">Created</div>
              <div className="text-sm text-navy-700 dark:text-navy-300">{formatDateTime(selected.createdAt)}</div>
            </div>
            {selected.status !== "confirmed" && (
              <Button onClick={() => updateStatus(selected.id, "confirmed")} className="w-full">
                <CheckCircle className="h-4 w-4" /> Confirm Appointment
              </Button>
            )}
            {selected.status !== "cancelled" && (
              <Button onClick={() => updateStatus(selected.id, "cancelled")} variant="secondary" className="w-full">
                <XCircle className="h-4 w-4" /> Cancel Appointment
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
