"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/Card"
import { PageHeader } from "@/components/ui/PageHeader"
import { MessageSquare, Users, CalendarCheck, Clock, TrendingUp, Loader2 } from "lucide-react"
import { apiFetch } from "@/lib/client-auth"

const defaultStats = {
  conversations: 0,
  leads: 0,
  appointments: 0,
  busiestDay: "—",
  topRequest: "—",
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState(defaultStats)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch("/api/analytics")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setStats(defaultStats))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-navy-400 dark:text-navy-500" /></div>
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Activity Overview" description="Key metrics for your practice" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 animate-stagger">
        {[
          { icon: MessageSquare, label: "Conversations", value: stats.conversations, tint: "bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400" },
          { icon: Users, label: "Leads Captured", value: stats.leads, tint: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" },
          { icon: CalendarCheck, label: "Appointments", value: stats.appointments, tint: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" },
        ].map((item) => (
          <Card key={item.label} className="p-5 animate-fade-in-up">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.tint}`}>
                <item.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-navy-400 dark:text-navy-500">{item.label}</p>
                <p className="text-xl font-bold tracking-tight text-navy-900 dark:text-navy-100">{item.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5 animate-fade-in">
          <div className="mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary-500" />
            <p className="text-sm font-semibold text-navy-900 dark:text-navy-100">Busiest Day</p>
          </div>
          <p className="text-lg font-bold tracking-tight text-navy-900 dark:text-navy-100">{stats.busiestDay}</p>
        </Card>
        <Card className="p-5 animate-fade-in">
          <div className="mb-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary-500" />
            <p className="text-sm font-semibold text-navy-900 dark:text-navy-100">Most Requested Service</p>
          </div>
          <p className="truncate text-lg font-bold tracking-tight text-navy-900 dark:text-navy-100">{stats.topRequest}</p>
        </Card>
      </div>
    </div>
  )
}
