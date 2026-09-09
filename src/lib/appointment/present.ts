/**
 * Dashboard presentation mapping for appointments.
 *
 * The Prisma schema stores `phone` / `preferredDate` / `preferredTime`,
 * while the dashboard UI reads `patientPhone` / `date` / `time`
 * (production incident: booked appointments appeared with blank date,
 * time, and phone). This mapper returns a SUPERSET — every raw column
 * plus the UI aliases — so no existing consumer breaks.
 */

export interface DashboardAppointment {
  id: string
  patientName: string | null
  phone: string | null
  patientPhone: string | null
  email: string | null
  patientEmail: string | null
  reason: string | null
  preferredDate: string | null
  date: string | null
  preferredTime: string | null
  time: string | null
  providerName: string | null
  isEmergency: boolean
  status: string
  isDeleted?: boolean
  deletedAt?: unknown
  createdAt: unknown
}

type AppointmentRow = {
  id: string
  patientName?: string | null
  phone?: string | null
  email?: string | null
  reason?: string | null
  preferredDate?: string | null
  preferredTime?: string | null
  providerName?: string | null
  isEmergency?: boolean
  status?: string
  createdAt?: unknown
  [key: string]: unknown
}

export function toDashboardAppointment(row: AppointmentRow): DashboardAppointment {
  return {
    ...(row as Record<string, unknown>),
    id: row.id,
    patientName: row.patientName ?? null,
    phone: row.phone ?? null,
    patientPhone: row.phone ?? null,
    email: row.email ?? null,
    patientEmail: row.email ?? null,
    reason: row.reason ?? null,
    preferredDate: row.preferredDate ?? null,
    date: row.preferredDate ?? null,
    preferredTime: row.preferredTime ?? null,
    time: row.preferredTime ?? null,
    providerName: row.providerName ?? null,
    isEmergency: Boolean(row.isEmergency),
    status: typeof row.status === "string" ? row.status : "pending",
    createdAt: row.createdAt ?? null,
  } as DashboardAppointment
}
