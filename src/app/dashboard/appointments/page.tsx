"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { PageHeader } from "@/components/ui/PageHeader"
import { EmptyState } from "@/components/ui/EmptyState"
import { Modal } from "@/components/ui/Modal"
import { AiPresence } from "@/components/ui/AiPresence"
import { Calendar as CalendarIcon, Loader2, ChevronLeft, ChevronRight, Clock, User, Phone, X, CheckCircle, XCircle, Trash2 } from "lucide-react"
import { formatDateTime } from "@/lib/utils"
import { apiFetch } from "@/lib/client-auth"

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
  providerName?: string | null
  isEmergency: boolean
  status: string
  createdAt: string
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<"list" | "calendar">("list")
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay())
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [selected, setSelected] = useState<Appointment | null>(null)
  // Manual delete flow: which appointment is awaiting confirmation in the
  // popup, and which delete request is in flight. Nothing auto-deletes —
  // rows disappear only after the user confirms here.
  const [pendingDelete, setPendingDelete] = useState<Appointment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await apiFetch("/api/appointments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pendingDelete.id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !(data && data.success)) {
        throw new Error((data && data.error) || `Delete failed (${res.status})`)
      }
      // Soft delete on the server: drop it from the visible list only.
      setAppointments((prev) => prev.filter((a) => a.id !== pendingDelete.id))
      if (selected?.id === pendingDelete.id) setSelected(null)
      setPendingDelete(null)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Delete failed"
      console.error("[dashboard/appointments] delete failed:", message)
      setDeleteError(message)
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    // Defensive: the API returns { error } shapes on auth/DB failures.
    // Setting that object as the list crashed the page into the error
    // boundary ("Failed to load dashboard data"). Validate instead.
    apiFetch("/api/appointments")
      .then(async (r) => {
        const data = await r.json().catch(() => null)
        if (!r.ok) {
          throw new Error(
            (data && data.error) || `Request failed (${r.status})`,
          )
        }
        if (!Array.isArray(data)) {
          throw new Error("Unexpected response shape")
        }
        setAppointments(data)
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load appointments"
        // Safe dev exposure: full message only in development logs/UI;
        // production keeps the generic card (details stay server-side).
        console.error("[dashboard/appointments] load failed:", message)
        setLoadError(
          process.env.NODE_ENV === "development"
            ? `Failed to load appointments: ${message}`
            : "Failed to load appointments. Please try again.",
        )
      })
      .finally(() => setLoading(false))
  }, [])

  // Elegant confirmation when Clinot notifies the patient about a
  // dashboard cancellation (surfaced from PATCH `notification.sent`).
  const [cancelNoticeId, setCancelNoticeId] = useState<string | null>(null)

  useEffect(() => {
    setCancelNoticeId(null)
  }, [selected?.id])

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await apiFetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error((data && data.error) || `Update failed (${res.status})`)
      }
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
      setSelected((prev) => (prev?.id === id ? { ...prev, status } : prev))
      if (status === "cancelled" && data?.notification?.sent) {
        setCancelNoticeId(id)
      } else {
        setCancelNoticeId(null)
      }
    } catch (err: unknown) {
      console.error("[dashboard/appointments] status update failed:", err instanceof Error ? err.message : err)
    }
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
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500 dark:text-primary-400" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Appointments" description="Manage upcoming patient visits" />
        <EmptyState
          icon={CalendarIcon}
          title="Couldn't load appointments"
          description={loadError}
          action={<Button onClick={() => window.location.reload()}>Try again</Button>}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointments"
        description={`${appointments.length} total appointment${appointments.length === 1 ? "" : "s"}`}
        actions={
          <div
            role="tablist"
            aria-label="Appointment view"
            className="flex items-center gap-0.5 rounded-xl border border-navy-100 dark:border-navy-700 bg-navy-50 p-1 dark:border-navy-700 dark:bg-navy-800"
          >
            {(["list", "calendar"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-all duration-150 ${
                  view === v
                    ? "bg-white dark:bg-navy-800 text-navy-900 dark:text-navy-100 shadow-sm dark:bg-navy-700 dark:text-navy-100"
                    : "text-navy-500 dark:text-navy-400 hover:text-navy-700 dark:text-navy-400 dark:hover:text-navy-200"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />

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
                    <div className="text-xs font-medium text-navy-400 dark:text-navy-500 dark:text-navy-400 mb-1">{dayLabels[d.getDay()]}</div>
                    <div className={`text-lg font-bold mb-2 ${isToday ? "text-primary-600 dark:text-primary-400" : "text-navy-700 dark:text-navy-200"}`}>{d.getDate()}</div>
                    {dayAppts.length === 0 ? (
                      <div className="text-[10px] text-navy-300 dark:text-navy-600 dark:text-navy-300">No appts</div>
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
                        {dayAppts.length > 3 && <div className="text-[10px] text-navy-400 dark:text-navy-500 dark:text-navy-400">+{dayAppts.length - 3} more</div>}
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
        appointments.length === 0 ? (
          <EmptyState
            icon={CalendarIcon}
            title="No appointments yet"
            description="Booked appointments will appear here with patient details, date, time, and status."
          />
        ) : (
          <Card className="animate-fade-in overflow-hidden">
            <ul className="divide-y divide-navy-75 dark:divide-navy-700/60">
              {appointments.map((a) => {
                const isSelected = selected?.id === a.id
                return (
                  <li key={a.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(isSelected ? null : a)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setSelected(isSelected ? null : a)
                        }
                      }}
                      className={`flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors duration-150 sm:px-5 ${
                        isSelected
                          ? "bg-primary-25 dark:bg-primary-900/20"
                          : "hover:bg-navy-25 dark:hover:bg-navy-750/60"
                      }`}
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          a.isEmergency ? "bg-danger-50 text-danger-500 dark:bg-danger-900/30" : "bg-primary-50 text-primary-500 dark:bg-primary-900/30"
                        }`}
                      >
                        <CalendarIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate text-sm font-semibold text-navy-900 dark:text-navy-100">
                            {a.patientName || "Unnamed"}
                          </span>
                          <Badge variant={a.status === "confirmed" ? "success" : a.status === "pending" ? "warning" : "danger"} size="sm">
                            {a.status}
                          </Badge>
                          {a.isEmergency && (
                            <Badge variant="danger" size="sm">Emergency</Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-navy-400 dark:text-navy-500 dark:text-navy-400">
                          {a.date && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {fmtDate(new Date(a.date))}{a.time ? ` · ${a.time}` : ""}
                            </span>
                          )}
                          {a.patientPhone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{a.patientPhone}</span>}
                          {a.reason && <span className="truncate">{a.reason}</span>}
                        </div>
                      </div>
                      <button
                        aria-label={`Delete appointment for ${a.patientName || "patient"}`}
                        title="Delete appointment"
                        onClick={(e) => { e.stopPropagation(); setDeleteError(null); setPendingDelete(a) }}
                        className="shrink-0 rounded-lg p-1.5 text-navy-300 transition-colors hover:bg-danger-50 hover:text-danger-500 dark:text-navy-600 dark:hover:bg-danger-900/20 dark:hover:text-danger-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      )}

      {selected && (
        <Card className="animate-fade-in">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-navy-900 dark:text-navy-100">Appointment Details</h2>
                <Badge variant={selected.status === "confirmed" ? "success" : selected.status === "pending" ? "warning" : "danger"} size="sm">
                  {selected.status}
                </Badge>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close details" className="rounded-lg p-1.5 text-navy-400 transition-colors hover:bg-navy-50 hover:text-navy-600 dark:text-navy-500 dark:hover:bg-navy-700 dark:hover:text-navy-300"><X className="h-4 w-4" /></button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {cancelNoticeId === selected.id && (
              <div className="flex items-center gap-2.5 rounded-xl border border-success-200 bg-success-50 px-4 py-3 dark:border-success-800 dark:bg-success-900/20 animate-fade-in" role="status">
                <CheckCircle className="h-4 w-4 shrink-0 text-success-600 dark:text-success-400" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-success-700 dark:text-success-300">Patient notified via WhatsApp</p>
                  <div className="mt-0.5"><AiPresence label="Sent by Clinot AI" /></div>
                </div>
              </div>
            )}
            <dl className="divide-y divide-navy-75 rounded-xl border border-navy-100 dark:divide-navy-700/60 dark:border-navy-700">
              <DetailRow icon={<User className="h-3.5 w-3.5" />} label="Patient" value={selected.patientName || "N/A"} strong />
              <DetailRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={selected.patientPhone || "N/A"} />
              <DetailRow icon={<Clock className="h-3.5 w-3.5" />} label="When" value={selected.date ? `${fmtDate(new Date(selected.date))}${selected.time ? ` · ${selected.time}` : ""}` : "N/A"} />
              {selected.reason && <DetailRow label="Reason" value={selected.reason} />}
              {selected.providerName && <DetailRow label="Provider" value={selected.providerName} />}
              <DetailRow label="Created" value={formatDateTime(selected.createdAt)} muted />
            </dl>
            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              {selected.status !== "confirmed" && (
                <Button onClick={() => updateStatus(selected.id, "confirmed")} className="flex-1">
                  <CheckCircle className="h-4 w-4" /> Confirm
                </Button>
              )}
              {selected.status !== "cancelled" && (
                <Button onClick={() => updateStatus(selected.id, "cancelled")} variant="secondary" className="flex-1">
                  <XCircle className="h-4 w-4" /> Cancel
                </Button>
              )}
              <Button
                onClick={() => { setDeleteError(null); setPendingDelete(selected) }}
                variant="danger"
                className="flex-1"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal
        open={pendingDelete !== null}
        onClose={() => { if (!deleting) setPendingDelete(null) }}
        title="Delete appointment?"
        description={
          pendingDelete
            ? `${pendingDelete.patientName || "This appointment"}${
                pendingDelete.date ? ` on ${fmtDate(new Date(pendingDelete.date))}` : ""
              }${
                pendingDelete.time ? ` at ${pendingDelete.time}` : ""
              } will be removed from the dashboard. The record stays safe in the database — nothing is permanently erased.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" onClick={confirmDelete} loading={deleting}>
              Delete
            </Button>
          </>
        }
      >
        {deleteError && (
          <p role="alert" className="text-sm font-medium text-danger-600 dark:text-danger-400">{deleteError}</p>
        )}
      </Modal>
    </div>
  )
}

function DetailRow({
  icon,
  label,
  value,
  strong,
  muted,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-navy-400 dark:text-navy-500 dark:text-navy-400">
        {icon}
        {label}
      </dt>
      <dd
        className={`truncate text-right text-sm ${
          strong
            ? "font-semibold text-navy-900 dark:text-navy-100"
            : muted
              ? "text-navy-400 dark:text-navy-500 dark:text-navy-400"
              : "text-navy-700 dark:text-navy-200"
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
