"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { CreditCard, Calendar, Clock, RefreshCw, AlertTriangle } from "lucide-react"
import { apiFetch } from "@/lib/client-auth"

type PlanId = "starter" | "professional" | "enterprise"

interface BillingData {
  plan: PlanId
  status: string
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  nextBillingDate: string | null
  createdAt?: string | null
}

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  past_due: "Past Due",
  cancelled: "Cancelled",
  incomplete: "Incomplete",
  unpaid: "Unpaid",
  paused: "Paused",
  expired: "Expired",
  inactive: "Inactive",
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  active: "success",
  past_due: "warning",
  cancelled: "neutral",
  incomplete: "warning",
  unpaid: "danger",
  paused: "neutral",
  expired: "danger",
  inactive: "neutral",
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch("/api/billing")
      const body = await res.json().catch(() => null) as { error?: string } | null
      if (!res.ok) {
        throw new Error(body?.error || `Billing unavailable (${res.status})`)
      }
      // Api returns billing data object; ensure we have at least plan/status
      const billing = body as unknown as BillingData
      setData(billing as BillingData)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load billing data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-navy-900 dark:text-navy-100 tracking-tight">Billing</h1>
          <p className="text-sm text-navy-400 dark:text-navy-500 mt-1">Your subscription overview</p>
        </div>
        <div className="rounded-2xl border border-navy-100 dark:border-navy-700 bg-white dark:bg-navy-800 p-6 animate-pulse space-y-4">
          <div className="h-4 w-32 bg-navy-50 dark:bg-navy-700 rounded" />
          <div className="h-6 w-48 bg-navy-50 dark:bg-navy-700 rounded" />
          <div className="h-4 w-full bg-navy-50 dark:bg-navy-700 rounded" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-navy-900 dark:text-navy-100 tracking-tight">Billing</h1>
          <p className="text-sm text-navy-400 dark:text-navy-500 mt-1">Your subscription overview</p>
        </div>
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20">
          <CardContent className="p-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 mx-auto mb-3">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-navy-900 dark:text-navy-100">Billing is temporarily unavailable</h3>
            <p className="text-xs text-navy-500 dark:text-navy-400 mt-1 max-w-sm mx-auto">{error}</p>
            <Button size="sm" variant="secondary" className="mt-4" onClick={fetchData}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const plan = (data?.plan as PlanId) || "starter"
  const status = data?.status || "inactive"
  const purchasedOn = data?.currentPeriodStart || (data as any)?.createdAt || null
  // Prefer nextBillingDate for recurring, else currentPeriodEnd for expiry
  const renewsOn = data?.nextBillingDate || data?.currentPeriodEnd || null
  const isRecurring = Boolean(data?.nextBillingDate)

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-navy-900 dark:text-navy-100 tracking-tight">Billing</h1>
        <p className="text-sm text-navy-400 dark:text-navy-500 mt-1">Essential subscription information for your clinic</p>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 shrink-0">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-navy-900 dark:text-navy-100 capitalize">{plan}</h2>
                <Badge variant={STATUS_VARIANT[status] || "neutral"} size="sm">{STATUS_LABEL[status] || status}</Badge>
              </div>
              <p className="text-xs text-navy-400 dark:text-navy-500 mt-1">Subscription status is updated automatically from Stripe</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 rounded-xl border border-navy-100 dark:border-navy-700 bg-navy-25/50 dark:bg-navy-800/50 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-xs font-medium text-navy-500 dark:text-navy-400">
                <CreditCard className="h-3.5 w-3.5" />
                Current Plan
              </span>
              <span className="text-sm font-semibold text-navy-900 dark:text-navy-100 capitalize">{plan}</span>
            </div>
            <div className="h-px bg-navy-100 dark:bg-navy-700" />
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-xs font-medium text-navy-500 dark:text-navy-400">
                <Calendar className="h-3.5 w-3.5" />
                Purchased On
              </span>
              <span className="text-sm font-medium text-navy-900 dark:text-navy-100">{formatDate(purchasedOn)}</span>
            </div>
            <div className="h-px bg-navy-100 dark:bg-navy-700" />
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-xs font-medium text-navy-500 dark:text-navy-400">
                <Clock className="h-3.5 w-3.5" />
                {isRecurring ? "Renews On" : "Expires On"}
              </span>
              <span className="text-sm font-medium text-navy-900 dark:text-navy-100">{formatDate(renewsOn)}</span>
            </div>
          </div>

          <p className="text-2xs leading-relaxed text-navy-400 dark:text-navy-500 mt-3">
            Dates are shown in your local timezone. If a date shows as “—”, it is not yet available for your subscription and will appear once Stripe confirms the period.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
