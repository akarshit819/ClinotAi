import type { SendMessageResult, CalendarSlot } from "./types"

const CALENDAR_API = "https://www.googleapis.com/calendar/v3"

export interface GoogleCalendarConfig {
  accessToken: string
  refreshToken?: string
  calendarId?: string
}

export interface GoogleCalendarEvent {
  id: string
  summary: string
  description?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  status?: string
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>
  created?: string
  updated?: string
}

async function fetchCalendar(
  accessToken: string,
  path: string,
  options: RequestInit = {},
): Promise<any> {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error?.message || `Calendar API error: ${res.status}`)
  }
  return data
}

export async function listCalendars(
  accessToken: string,
): Promise<Array<{ id: string; summary: string; primary: boolean }>> {
  try {
    const data = await fetchCalendar(accessToken, "/users/me/calendarList")
    return (data.items || []).map((cal: any) => ({
      id: cal.id,
      summary: cal.summary || cal.id,
      primary: cal.primary || false,
    }))
  } catch {
    return []
  }
}

export async function getAvailableSlots(
  config: GoogleCalendarConfig,
  date: Date,
  timezone: string,
): Promise<CalendarSlot[]> {
  try {
    const dayStart = new Date(date)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date)
    dayEnd.setHours(23, 59, 59, 999)

    const events = await fetchCalendar(config.accessToken, "/calendars/primary/events", {
      method: "POST",
      body: JSON.stringify({
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        timeZone: timezone,
        singleEvents: true,
        orderBy: "startTime",
      }),
    })

    const busySlots: Array<{ start: Date; end: Date }> = (events.items || [])
      .filter((e: GoogleCalendarEvent) => e.status !== "cancelled")
      .map((e: GoogleCalendarEvent) => ({
        start: new Date(e.start.dateTime || e.start.date!),
        end: new Date(e.end.dateTime || e.end.date!),
      }))

    const workingHours = [
      { start: 9, end: 12 },
      { start: 13, end: 17 },
    ]

    const slots: CalendarSlot[] = []
    for (const period of workingHours) {
      let current = new Date(date)
      current.setHours(period.start, 0, 0, 0)
      const periodEnd = new Date(date)
      periodEnd.setHours(period.end, 0, 0, 0)

      while (current < periodEnd) {
        const slotEnd = new Date(current.getTime() + 30 * 60000)
        const isBusy = busySlots.some(
          (busy) => current < busy.end && slotEnd > busy.start,
        )
        slots.push({
          start: new Date(current),
          end: slotEnd,
          available: !isBusy,
        })
        current = slotEnd
      }
    }

    return slots
  } catch {
    return []
  }
}

export async function createCalendarEvent(
  config: GoogleCalendarConfig,
  event: {
    summary: string
    description?: string
    startTime: string
    endTime: string
    timezone: string
    attendeeEmail?: string
    attendeeName?: string
  },
): Promise<SendMessageResult> {
  try {
    const body: any = {
      summary: event.summary,
      description: event.description || "",
      start: {
        dateTime: event.startTime,
        timeZone: event.timezone,
      },
      end: {
        dateTime: event.endTime,
        timeZone: event.timezone,
      },
    }

    if (event.attendeeEmail) {
      body.attendees = [
        {
          email: event.attendeeEmail,
          displayName: event.attendeeName || event.attendeeEmail,
        },
      ]
    }

    const data = await fetchCalendar(
      config.accessToken,
      `/calendars/${config.calendarId || "primary"}/events`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    )

    return { success: true, messageId: data.id }
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create event" }
  }
}

export async function checkCalendarAccess(
  accessToken: string,
): Promise<{ hasAccess: boolean; calendarCount: number; primaryName: string }> {
  try {
    const calendars = await listCalendars(accessToken)
    const primary = calendars.find((c) => c.primary)
    return {
      hasAccess: calendars.length > 0,
      calendarCount: calendars.length,
      primaryName: primary?.summary || "None",
    }
  } catch {
    return { hasAccess: false, calendarCount: 0, primaryName: "" }
  }
}

export async function revokeGoogleToken(accessToken: string): Promise<boolean> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
    return true
  } catch {
    return false
  }
}
