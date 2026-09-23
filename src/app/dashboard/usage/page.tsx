import { cookies } from "next/headers"
import { prisma } from "@/lib/db"
import { verifyAccessToken } from "@/lib/auth"
import { getMonthlyUsage, isUnlimited, getPlanBySlug } from "@/lib/billing"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { MessageSquare } from "lucide-react"
import { Suspense } from "react"

async function UsageContent() {
  const cookieStore = cookies()
  const token = cookieStore.get("access_token")?.value
  if (!token) return null
  const payload = await verifyAccessToken(token)
  if (!payload) return null

  const [usage, subscription] = await Promise.all([
    getMonthlyUsage(payload.clinicId),
    prisma.subscription.findFirst({
      where: { clinicId: payload.clinicId },
      orderBy: { createdAt: "desc" },
    }),
  ])

  const planSlug = subscription?.plan || "starter"
  const planData = await getPlanBySlug(planSlug)
  const pLimits = planData?.limits || { conversations: 500 }
  const limit = isUnlimited((pLimits as any).conversations) ? null : (pLimits as any).conversations as number
  const used = usage.totalConversations
  const remaining = limit === null ? null : Math.max(0, limit - used)
  const percent = limit === null || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100))

  const statusLabel = subscription?.status ? subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1) : "Inactive"
  const statusVariant = subscription?.status === "active" ? "success" : subscription?.status === "past_due" ? "warning" : "neutral"

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-wider uppercase text-navy-400 dark:text-navy-500">Monthly Usage</p>
              <p className="text-2xl font-bold tracking-tight text-navy-900 dark:text-navy-100 mt-1">
                {used.toLocaleString()} <span className="text-sm font-medium text-navy-400 dark:text-navy-500">conversations</span>
              </p>
              <p className="text-xs text-navy-400 dark:text-navy-500 mt-1">
                {limit === null ? "Unlimited conversations on your plan" : `${remaining?.toLocaleString()} remaining of ${limit.toLocaleString()} this period`}
              </p>
            </div>
            <Badge variant={statusVariant as any} size="sm">{statusLabel}</Badge>
          </div>

          {limit !== null && (
            <div className="mt-5">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-navy-500 dark:text-navy-400">{used.toLocaleString()} used</span>
                <span className={`font-medium ${percent >= 90 ? "text-danger-600 dark:text-danger-400" : "text-navy-600 dark:text-navy-300"}`}>{percent}%</span>
              </div>
              <div className="h-2 rounded-full bg-navy-50 dark:bg-navy-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${percent >= 90 ? "bg-danger-500" : percent >= 75 ? "bg-amber-500" : "bg-primary-500"}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-2xs text-navy-400 dark:text-navy-500 mt-1.5">Resets with your billing period. Conversations include all patient messages handled by Clinot AI.</p>
            </div>
          )}

          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-navy-75 dark:border-navy-700 pt-4">
            <div>
              <p className="text-2xs font-semibold tracking-wider uppercase text-navy-400 dark:text-navy-500">Plan</p>
              <p className="text-sm font-semibold text-navy-900 dark:text-navy-100 capitalize mt-0.5">{planSlug}</p>
            </div>
            <div>
              <p className="text-2xs font-semibold tracking-wider uppercase text-navy-400 dark:text-navy-500">Limit</p>
              <p className="text-sm font-semibold text-navy-900 dark:text-navy-100 mt-0.5">{limit === null ? "Unlimited" : limit.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-2xs font-semibold tracking-wider uppercase text-navy-400 dark:text-navy-500">Remaining</p>
              <p className="text-sm font-semibold text-navy-900 dark:text-navy-100 mt-0.5">{limit === null ? "—" : remaining?.toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-navy-100 dark:border-navy-700 bg-navy-25/50 dark:bg-navy-800/50">
        <CardContent className="p-4 flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-navy-900 dark:text-navy-100">How usage is counted</p>
            <p className="text-xs leading-relaxed text-navy-500 dark:text-navy-400 mt-1">
              One conversation is one patient chat session handled by Clinot, regardless of message count. Limits are per billing period and reset automatically.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function UsageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-40 rounded-2xl bg-navy-25 dark:bg-navy-800" />
      <div className="h-20 rounded-2xl bg-navy-25 dark:bg-navy-800" />
    </div>
  )
}

export const metadata = {
  title: "AI Usage",
  robots: { index: false, follow: false },
}

export default function UsagePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-navy-900 dark:text-navy-100 tracking-tight">AI Usage</h1>
        <p className="text-sm text-navy-400 dark:text-navy-500 mt-1">Simple monthly usage for your clinic</p>
      </div>
      <Suspense fallback={<UsageSkeleton />}>
        <UsageContent />
      </Suspense>
    </div>
  )
}
