"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  CreditCard,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  FileText,
  Calendar,
  DollarSign,
  RefreshCw,
  Shield,
  Sparkles,
  Clock,
  Ban,
  Play,
  Loader2,
  ChevronRight,
  TrendingUp,
  MessageSquare,
  BarChart3,
} from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"

type PlanId = "starter" | "professional" | "enterprise"
type SubscriptionStatus = "active" | "past_due" | "cancelled" | "incomplete" | "unpaid" | "paused" | "expired" | "inactive"

interface InvoiceData {
  id: string
  amount: number
  currency: string
  status: string
  paidAt: string | null
  invoiceUrl: string | null
  periodEnd: string | null
}

interface BillingData {
  plan: PlanId
  status: SubscriptionStatus
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  lastPaymentDate: string | null
  nextBillingDate: string | null
  paymentMethod: string | null
  paymentMethodBrand: string | null
  paymentMethodLast4: string | null
  upcomingInvoice: { amount: number; currency: string; periodEnd: string | null } | null
  invoices: InvoiceData[]
}

interface UsageData {
  usage: { conversations: number; promptTokens: number; completionTokens: number; totalTokens: number }
  limit: { allowed: boolean; used: number; limit: number }
}

const PLAN_DETAILS: Record<PlanId, { name: string; price: number; features: string[] }> = {
  starter: { name: "Starter", price: 49, features: ["500 conversations/month", "AI receptionist 24/7", "Appointment requests", "Basic analytics", "Email support"] },
  professional: { name: "Professional", price: 199, features: ["2,000 conversations/month", "AI receptionist 24/7", "Appointment requests", "Advanced analytics", "Priority support", "Multi-language", "Custom branding"] },
  enterprise: { name: "Enterprise", price: 0, features: ["Unlimited conversations", "AI receptionist 24/7", "Appointment requests", "Enterprise analytics", "Dedicated support", "Custom integrations", "SLA guarantee"] },
}

const STATUS_BADGE: Record<SubscriptionStatus, { variant: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  active: { variant: "success", label: "Active" },
  past_due: { variant: "warning", label: "Past Due" },
  cancelled: { variant: "neutral", label: "Cancelled" },
  incomplete: { variant: "warning", label: "Incomplete" },
  unpaid: { variant: "danger", label: "Unpaid" },
  paused: { variant: "neutral", label: "Paused" },
  expired: { variant: "danger", label: "Expired" },
  inactive: { variant: "neutral", label: "Not Subscribed" },
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-6 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-2">
          <div className="h-3 w-24 bg-navy-50 rounded" />
          <div className="h-5 w-40 bg-navy-50 rounded" />
        </div>
        <div className="h-8 w-20 bg-navy-50 rounded-full" />
      </div>
      <div className="flex gap-4">
        <div className="h-3 w-28 bg-navy-50 rounded" />
        <div className="h-3 w-28 bg-navy-50 rounded" />
      </div>
    </div>
  )
}

function SkeletonTable() {
  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-6 animate-pulse">
      <div className="h-4 w-32 bg-navy-50 rounded mb-4" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between py-3 border-b border-navy-50 last:border-0">
          <div className="space-y-1">
            <div className="h-3 w-20 bg-navy-50 rounded" />
            <div className="h-2.5 w-32 bg-navy-50 rounded" />
          </div>
          <div className="h-6 w-16 bg-navy-50 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function StatusIcon({ status }: { status: SubscriptionStatus }) {
  switch (status) {
    case "active": return <CheckCircle className="h-5 w-5 text-success-500" />
    case "past_due": return <AlertTriangle className="h-5 w-5 text-warning-500" />
    case "cancelled": return <Ban className="h-5 w-5 text-navy-300" />
    case "incomplete": return <Clock className="h-5 w-5 text-warning-500" />
    case "unpaid": return <XCircle className="h-5 w-5 text-danger-500" />
    case "paused": return <Play className="h-5 w-5 text-navy-300" />
    case "expired": return <XCircle className="h-5 w-5 text-danger-500" />
    default: return <CreditCard className="h-5 w-5 text-navy-300" />
  }
}

export default function BillingPage() {
  const router = useRouter()
  const [data, setData] = useState<BillingData | null>(null)
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [billingRes, usageRes] = await Promise.all([
        fetch("/api/billing"),
        fetch("/api/billing/usage"),
      ])
      if (billingRes.ok) {
        const billingData = await billingRes.json()
        setData(billingData)
      }
      if (usageRes.ok) {
        const usageData = await usageRes.json()
        setUsage(usageData)
      }
    } catch (err) {
      setError("Failed to load billing data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAction = async (action: string, url: string, options?: RequestInit) => {
    setActionLoading(action)
    setError(null)
    try {
      const res = await fetch(url, { method: "POST", ...options })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Action failed")
      if (body.url) {
        window.location.href = body.url
        return
      }
      await fetchData()
    } catch (err: any) {
      setError(err.message || "Action failed. Please try again.")
    } finally {
      setActionLoading(null)
    }
  }

  const handleSubscribe = async (plan: PlanId) => {
    await handleAction("subscribe", "/api/checkout", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    })
  }

  const handlePortal = async () => {
    await handleAction("portal", "/api/billing/portal")
  }

  const handleCancel = async () => {
    await handleAction("cancel", "/api/billing/cancel")
    setShowCancelConfirm(false)
  }

  const handleReactivate = async () => {
    await handleAction("reactivate", "/api/billing/reactivate")
  }

  const handleChangePlan = async (plan: PlanId) => {
    await handleAction("change", "/api/billing/upgrade", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    })
  }

  const isSubscribed = data && data.status !== "inactive" && data.status !== "incomplete"
  const planDetails = data ? PLAN_DETAILS[data.plan] || PLAN_DETAILS.starter : PLAN_DETAILS.starter
  const usagePercent = usage && usage.limit.limit > 0 ? Math.round((usage.limit.used / usage.limit.limit) * 100) : 0

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-7 w-32 bg-navy-50 rounded animate-pulse" />
        <SkeletonCard />
        <div className="grid sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonTable />
      </div>
    )
  }

  if (!isSubscribed) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-xl font-bold text-navy-900 dark:text-navy-100 tracking-tight">Billing</h1>
          <p className="text-sm text-navy-400 mt-1">Choose a plan to get started with Clinot.</p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-danger-50 border border-danger-100 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-danger-500 mt-0.5 shrink-0" />
            <p className="text-xs text-danger-700">{error}</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <Card hover className="relative overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-primary-500" />
                <h3 className="text-sm font-semibold text-navy-900">Starter</h3>
              </div>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold text-navy-900">$49</span>
                <span className="text-xs text-navy-400">/month</span>
              </div>
              <ul className="space-y-2 mb-6">
                {PLAN_DETAILS.starter.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-navy-500">
                    <CheckCircle className="h-3.5 w-3.5 text-success-500 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                onClick={() => handleSubscribe("starter")}
                loading={actionLoading === "subscribe"}
              >
                Subscribe
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>

          <Card hover gradient className="relative overflow-hidden">
            <div className="absolute top-0 right-0">
              <div className="bg-primary-500 text-white text-2xs font-semibold px-3 py-1 rounded-bl-xl">Popular</div>
            </div>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-primary-500" />
                <h3 className="text-sm font-semibold text-navy-900">Professional</h3>
              </div>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold text-navy-900">$199</span>
                <span className="text-xs text-navy-400">/month</span>
              </div>
              <ul className="space-y-2 mb-6">
                {PLAN_DETAILS.professional.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-navy-500">
                    <CheckCircle className="h-3.5 w-3.5 text-success-500 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                onClick={() => handleSubscribe("professional")}
                loading={actionLoading === "subscribe"}
              >
                Subscribe
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm font-semibold text-navy-700 mb-1">Need more?</p>
            <p className="text-xs text-navy-400 mb-4">Enterprise plan with custom pricing, dedicated support, and SLA guarantee.</p>
            <Button variant="secondary" onClick={() => window.location.href = "/#pricing"}>
              Contact Sales
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy-900 dark:text-navy-100 tracking-tight">Billing</h1>
          <p className="text-sm text-navy-400 mt-1">Manage your Clinot subscription and billing.</p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-danger-50 border border-danger-100 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-danger-500 mt-0.5 shrink-0" />
          <p className="text-xs text-danger-700">{error}</p>
        </div>
      )}

      {data.status === "past_due" && (
        <div className="p-4 rounded-xl bg-warning-50 border border-warning-100 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-warning-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-warning-700 mb-0.5">Payment Past Due</p>
            <p className="text-xs text-warning-600">Your latest payment failed. Update your payment method to avoid service interruption.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={handlePortal} loading={actionLoading === "portal"}>
            Update Payment
            <ExternalLink className="ml-1.5 h-3 w-3" />
          </Button>
        </div>
      )}

      {data.status === "incomplete" && (
        <div className="p-4 rounded-xl bg-warning-50 border border-warning-100 flex items-start gap-3">
          <Clock className="h-4 w-4 text-warning-500 mt-0.5 shrink-0" />
          <p className="text-xs text-warning-700">Your subscription is being set up. You will receive a confirmation once the initial payment is processed.</p>
        </div>
      )}

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                data.status === "active" ? "bg-success-50" :
                data.status === "past_due" ? "bg-warning-50" :
                data.status === "cancelled" ? "bg-navy-25" : "bg-navy-25"
              }`}>
                <StatusIcon status={data.status} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-bold text-navy-900 dark:text-navy-100">
                    {planDetails.name}
                  </h2>
                  <Badge variant={STATUS_BADGE[data.status].variant} size="sm">
                    {STATUS_BADGE[data.status].label}
                  </Badge>
                </div>
                <p className="text-sm text-navy-400">
                  ${planDetails.price}/month
                  {data.cancelAtPeriodEnd && (
                    <span className="text-warning-600 ml-2">· Cancels at period end</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {data.cancelAtPeriodEnd ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleReactivate}
                  loading={actionLoading === "reactivate"}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Reactivate
                </Button>
              ) : data.status === "active" || data.status === "past_due" ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handlePortal}
                    loading={actionLoading === "portal"}
                  >
                    Manage
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                  {!showCancelConfirm ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger-500 hover:text-danger-600 hover:bg-danger-50"
                      onClick={() => setShowCancelConfirm(true)}
                    >
                      Cancel
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-navy-400">Confirm?</span>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleCancel}
                        loading={actionLoading === "cancel"}
                      >
                        Yes, Cancel
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowCancelConfirm(false)}
                      >
                        No
                      </Button>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {data.status === "active" && usage && (
        <div>
          <h3 className="text-sm font-semibold text-navy-900 mb-3">Current Billing Period Usage</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-navy-900">{usage.usage.conversations.toLocaleString()}</div>
                <div className="text-xs text-navy-400 mb-2">Conversations</div>
                <div className="w-full bg-navy-50 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      usagePercent > 80 ? "bg-warning-500" : usagePercent > 50 ? "bg-primary-500" : "bg-success-500"
                    }`}
                    style={{ width: `${Math.min(usagePercent, 100)}%` }}
                  />
                </div>
                <div className="text-2xs text-navy-400 mt-1">
                  {usage.limit.used.toLocaleString()} / {usage.limit.limit.toLocaleString()} ({usagePercent}%)
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-navy-900">{usage.usage.totalTokens.toLocaleString()}</div>
                <div className="text-xs text-navy-400">Total Tokens Used</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                    <Calendar className="h-4 w-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-navy-900">
                  {data.nextBillingDate ? new Date(data.nextBillingDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                </div>
                <div className="text-xs text-navy-400">Next Reset Date</div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-navy-900 dark:text-navy-100">Plan Details</h3>
            {(data.plan === "starter" || data.plan === "professional") && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleChangePlan(data.plan === "starter" ? "professional" : "starter")}
                loading={actionLoading === "change"}
              >
                {data.plan === "starter" ? "Upgrade to Professional" : "Downgrade to Starter"}
                {data.plan === "starter" && <ChevronRight className="ml-1 h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div className="p-3 rounded-xl bg-navy-25">
              <p className="text-2xs text-navy-400 mb-0.5">Current Period</p>
              <p className="text-xs font-semibold text-navy-700">
                {data.currentPeriodStart ? new Date(data.currentPeriodStart).toLocaleDateString() : "—"}
                {" — "}
                {data.currentPeriodEnd ? new Date(data.currentPeriodEnd).toLocaleDateString() : "—"}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-navy-25">
              <p className="text-2xs text-navy-400 mb-0.5">Next Payment</p>
              <p className="text-xs font-semibold text-navy-700">
                {data.nextBillingDate ? new Date(data.nextBillingDate).toLocaleDateString() : "—"}
                {data.upcomingInvoice && <> · ${(data.upcomingInvoice.amount / 100).toFixed(2)}</>}
              </p>
            </div>
          </div>

          <div className="border-t border-navy-100 pt-4">
            <p className="text-2xs font-semibold text-navy-500 mb-2 uppercase tracking-wider">Included Features</p>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {planDetails.features.map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-navy-500">
                  <CheckCircle className="h-3 w-3 text-success-500 shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {data.upcomingInvoice && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                  <DollarSign className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-navy-900">Upcoming Invoice</p>
                  <p className="text-2xs text-navy-400">
                    {data.upcomingInvoice.periodEnd ? new Date(data.upcomingInvoice.periodEnd).toLocaleDateString() : "Next billing date"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-navy-900">
                  ${(data.upcomingInvoice.amount / 100).toFixed(2)}
                </p>
                <p className="text-2xs text-navy-400 uppercase">{data.upcomingInvoice.currency}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-navy-900 dark:text-navy-100">Invoice History</h3>
        </CardHeader>
        <CardContent>
          {data.invoices.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-10 w-10 mx-auto mb-2 text-navy-300" />
              <p className="text-sm text-navy-500">No invoices yet</p>
              <p className="text-xs text-navy-400 mt-1">Invoices will appear after your first billing cycle.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {data.invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-navy-25 transition-colors -mx-3"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      inv.status === "paid" ? "bg-success-50 text-success-600" :
                      inv.status === "failed" ? "bg-danger-50 text-danger-600" : "bg-navy-25 text-navy-400"
                    }`}>
                      {inv.status === "paid" ? <CheckCircle className="h-4 w-4" /> :
                       inv.status === "failed" ? <XCircle className="h-4 w-4" /> :
                       <FileText className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-navy-700">
                        ${(inv.amount / 100).toFixed(2)} {inv.currency.toUpperCase()}
                      </p>
                      <p className="text-2xs text-navy-400">
                        {inv.periodEnd ? new Date(inv.periodEnd).toLocaleDateString() : "—"}
                        {inv.paidAt && ` · Paid ${new Date(inv.paidAt).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={inv.status === "paid" ? "success" : inv.status === "failed" ? "danger" : "neutral"}
                      size="sm"
                    >
                      {inv.status}
                    </Badge>
                    {inv.invoiceUrl && (
                      <a
                        href={inv.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-navy-50 text-navy-400 hover:text-navy-600 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600 shrink-0">
              <Shield className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-navy-900">Payment Methods & Billing Details</p>
              <p className="text-xs text-navy-400 mt-0.5">
                {data.paymentMethodBrand ? (
                  <>Card ending in {data.paymentMethodLast4} · {data.paymentMethodBrand}</>
                ) : (
                  "Manage your payment methods and billing information securely through Stripe."
                )}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePortal}
            loading={actionLoading === "portal"}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Manage
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
