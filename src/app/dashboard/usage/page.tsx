import { cookies } from "next/headers"
import { prisma } from "@/lib/db"
import { verifyAccessToken } from "@/lib/auth"
import { getMonthlyUsage, isUnlimited, getPlanBySlug } from "@/lib/billing"
import { Card, CardContent, CardHeader } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Bot, MessageSquare, Code2, CreditCard, AlertTriangle } from "lucide-react"
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
      where: { clinicId: payload.clinicId, status: "active" },
      orderBy: { createdAt: "desc" },
    }),
  ])

  const planSlug = subscription?.plan || "starter"
  const planData = await getPlanBySlug(planSlug)
  const pLimits = planData?.limits || { conversations: 500, tokens: 500000, aiRequests: 500, channels: 1, teamMembers: 2, storage: 0, attachments: 0 }
  const conversationsLimit = isUnlimited(pLimits.conversations) ? Infinity : pLimits.conversations
  const tokensLimit = isUnlimited(pLimits.tokens) ? Infinity : pLimits.tokens

  const conversationsPercent = Math.min(100, Math.round((usage.totalConversations / (conversationsLimit || 1)) * 100))
  const tokensPercent = Math.min(100, Math.round((usage.totalTokens / (tokensLimit || 1)) * 100))

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-navy-400 dark:text-navy-400 font-medium">Conversations</p>
                <p className="text-2xl font-bold text-navy-900 dark:text-navy-100">{usage.totalConversations.toLocaleString()}</p>
              </div>
            </div>
            <div className="mt-4 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-navy-500 dark:text-navy-400">Of {isUnlimited(pLimits.conversations) ? "Unlimited" : pLimits.conversations.toLocaleString()}</span>
                {!isUnlimited(pLimits.conversations) && (
                  <span className={`font-medium ${conversationsPercent >= 90 ? "text-danger-600 dark:text-danger-400" : "text-navy-700 dark:text-navy-300"}`}>
                    {conversationsPercent}%
                  </span>
                )}
              </div>
              {!isUnlimited(pLimits.conversations) && (
                <div className="h-1.5 bg-navy-50 dark:bg-navy-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${conversationsPercent >= 90 ? "bg-danger-500" : "bg-primary-500"}`}
                    style={{ width: `${conversationsPercent}%` }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                <Code2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-navy-400 dark:text-navy-400 font-medium">Total Tokens</p>
                <p className="text-2xl font-bold text-navy-900 dark:text-navy-100">
                  {usage.totalTokens >= 1_000_000
                    ? `${(usage.totalTokens / 1_000_000).toFixed(1)}M`
                    : usage.totalTokens >= 1_000
                      ? `${(usage.totalTokens / 1_000).toFixed(1)}K`
                      : usage.totalTokens.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-navy-500 dark:text-navy-400">Of {isUnlimited(pLimits.tokens) ? "Unlimited" : pLimits.tokens.toLocaleString()}</span>
                {!isUnlimited(pLimits.tokens) && (
                  <span className={`font-medium ${tokensPercent >= 90 ? "text-danger-600 dark:text-danger-400" : "text-navy-700 dark:text-navy-300"}`}>
                    {tokensPercent}%
                  </span>
                )}
              </div>
                {!isUnlimited(pLimits.tokens) && (
                <div className="h-1.5 bg-navy-50 dark:bg-navy-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${tokensPercent >= 90 ? "bg-danger-500" : "bg-amber-500"}`}
                    style={{ width: `${tokensPercent}%` }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100">Current Plan</h2>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-navy-900 dark:text-navy-100 capitalize">{planSlug}</span>
                  <Badge variant={subscription?.status === "active" ? "success" : "neutral"} size="sm">
                    {subscription?.status || "inactive"}
                  </Badge>
                </div>
                <p className="text-xs text-navy-400 dark:text-navy-400 mt-0.5">
                  {usage.byProvider.length > 0 && usage.byProvider[0].provider === "clinot"
                    ? "AI Included in subscription"
                    : "You are billed directly by your AI provider"}
                </p>
              </div>
            </div>
            <p className="text-sm font-bold text-navy-900 dark:text-navy-100">
              ${(planData?.price || 0) / 100}/mo
            </p>
          </div>
        </CardContent>
      </Card>

      {usage.byProvider.length > 0 && usage.byProvider[0].provider !== "clinot" && (
        <Card className="border-amber-100 dark:border-amber-800 bg-amber-25/50 dark:bg-amber-900/20">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-navy-900 dark:text-navy-100">Using your own AI provider</p>
                <p className="text-xs text-navy-500 dark:text-navy-400 mt-1">
                  You are billed directly by your AI provider. Usage shown here is estimated based on token counts.
                  Actual billing is handled by your provider.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {usage.byProvider.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100">Usage by Provider</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {usage.byProvider.map((u) => (
                <div key={u.provider} className="flex items-center justify-between py-2 border-b border-navy-50 dark:border-navy-700 last:border-0">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-navy-400 dark:text-navy-500" />
                    <span className="text-sm text-navy-700 dark:text-navy-300 capitalize">{u.provider}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-navy-900 dark:text-navy-100 font-medium">{u.conversations} conversations</p>
                    <p className="text-xs text-navy-400 dark:text-navy-500">{u.totalTokens.toLocaleString()} tokens</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function UsageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 gap-6">
        <div className="h-32 bg-navy-25 dark:bg-navy-800 rounded-2xl" />
        <div className="h-32 bg-navy-25 dark:bg-navy-800 rounded-2xl" />
      </div>
      <div className="h-24 bg-navy-25 dark:bg-navy-800 rounded-2xl" />
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
        <p className="text-sm text-navy-400 dark:text-navy-400 mt-1">Monitor your AI usage and plan limits</p>
      </div>
      <Suspense fallback={<UsageSkeleton />}>
        <UsageContent />
      </Suspense>
    </div>
  )
}
