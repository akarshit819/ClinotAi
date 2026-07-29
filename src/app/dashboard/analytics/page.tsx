"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/Card"
import { MessageSquare, Users, CalendarCheck, Clock, TrendingUp, Loader2 } from "lucide-react"

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
    fetch("/api/analytics")
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
      <div>
        <h1 className="text-2xl font-bold text-navy-900 dark:text-navy-100">Activity Overview</h1>
        <p className="text-sm text-navy-400 dark:text-navy-400 mt-1">Key metrics for your practice</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-900/30">
            <MessageSquare className="h-5 w-5 text-primary-500" />
          </div>
          <div>
            <p className="text-xs text-navy-400 dark:text-navy-400">Conversations</p>
            <p className="text-xl font-bold text-navy-900 dark:text-navy-100">{stats.conversations}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
            <Users className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-xs text-navy-400 dark:text-navy-400">Leads Captured</p>
            <p className="text-xl font-bold text-navy-900 dark:text-navy-100">{stats.leads}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
            <CalendarCheck className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-navy-400 dark:text-navy-400">Appointments</p>
            <p className="text-xl font-bold text-navy-900 dark:text-navy-100">{stats.appointments}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-2">
          <Clock className="h-4 w-4 text-primary-500" />
          <p className="text-sm font-semibold text-navy-900 dark:text-navy-100">Busiest Day</p>
          </div>
          <p className="text-lg font-bold text-navy-900 dark:text-navy-100">{stats.busiestDay}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-4 w-4 text-primary-500" />
          <p className="text-sm font-semibold text-navy-900 dark:text-navy-100">Services</p>
          </div>
          <p className="text-lg font-bold text-navy-900 dark:text-navy-100">{stats.topRequest}</p>
        </Card>
      </div>
    </div>
  )
}
