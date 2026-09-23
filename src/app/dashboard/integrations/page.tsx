"use client"

import { useState, useEffect, useCallback } from "react"
import {
  MessageCircle, Camera, MessageSquare, Send, Mail,
  Building2, Smartphone, Phone, PhoneCall, Users,
  Link2, Unlink, ExternalLink, CheckCircle, XCircle, Loader2,
  RefreshCw, AlertCircle, ShieldCheck, Webhook, Clock,
  Ban,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/client-auth"

type IntegrationStatusValue = "disconnected" | "connecting" | "connected" | "error" | "expired"

interface IntegrationStatus {
  platform: string
  enabled: boolean
  connected: boolean
  status: IntegrationStatusValue
  lastSyncAt: string | null
  lastErrorAt: string | null
  lastErrorMessage: string | null
  permissions: string[]
  webhookConfigured: boolean
  webhookUrl: string | null
  tokenExpiresAt: string | null
  providerName: string | null
  providerAvatar: string | null
}

interface ActiveModal {
  platform: string
  type: "telegram" | "email-smtp" | "whatsapp" | "confirm-disconnect"
}

const PLATFORM_DETAILS: Record<string, {
  name: string
  icon: any
  color: string
  bgLight: string
  description: string
  docUrl?: string
  authType: "oauth" | "token" | "credentials"
  statusPath?: string
}> = {
  whatsapp: {
    name: "WhatsApp Business",
    icon: MessageCircle,
    color: "text-emerald-600",
    bgLight: "bg-emerald-50",
    description: "Connect your WhatsApp Business account to handle patient messages via Meta Cloud API.",
    docUrl: "https://developers.facebook.com/docs/whatsapp",
    authType: "credentials",
  },
  instagram: {
    name: "Instagram",
    icon: Camera,
    color: "text-pink-600",
    bgLight: "bg-pink-50",
    description: "Receive and reply to Instagram Direct Messages through your business account.",
    docUrl: "https://developers.facebook.com/docs/instagram-api",
    authType: "oauth",
  },
  facebook: {
    name: "Facebook Messenger",
    icon: MessageSquare,
    color: "text-blue-600",
    bgLight: "bg-blue-50",
    description: "Connect your Facebook Page to handle Messenger conversations.",
    docUrl: "https://developers.facebook.com/docs/messenger-platform",
    authType: "oauth",
  },
  telegram: {
    name: "Telegram",
    icon: Send,
    color: "text-sky-600",
    bgLight: "bg-sky-50",
    description: "Set up a Telegram Bot for patient communication. Create one via @BotFather.",
    docUrl: "https://core.telegram.org/bots/api",
    authType: "token",
  },
  email: {
    name: "Email",
    icon: Mail,
    color: "text-red-600",
    bgLight: "bg-red-50",
    description: "Connect Gmail, Outlook, or custom SMTP for AI-powered email replies.",
    authType: "oauth",
  },
  google_business: {
    name: "Google Business Messages", icon: Building2, color: "text-blue-600", bgLight: "bg-blue-50",
    description: "Connect Google Business Messages.",
    docUrl: "https://developers.google.com/business-communications/business-messages",
    authType: "oauth",
  },
  apple_messages: {
    name: "Apple Messages", icon: Smartphone, color: "text-neutral-900", bgLight: "bg-neutral-100",
    description: "Apple Business Chat integration.",
    docUrl: "https://developer.apple.com/business-chat/",
    authType: "oauth",
  },
  sms: {
    name: "SMS", icon: Phone, color: "text-gray-600", bgLight: "bg-gray-50",
    description: "Twilio SMS integration for text messaging.",
    authType: "token",
  },
  voice_ai: {
    name: "Voice AI", icon: PhoneCall, color: "text-purple-600", bgLight: "bg-purple-50",
    description: "AI-powered voice receptionist.",
    authType: "oauth",
  },
  teams: {
    name: "Microsoft Teams", icon: Users, color: "text-indigo-600", bgLight: "bg-indigo-50",
    description: "Microsoft Teams messaging integration.",
    authType: "oauth",
  },
  slack: {
    name: "Slack", icon: MessageSquare, color: "text-purple-600", bgLight: "bg-purple-50",
    description: "Slack workspace integration.",
    authType: "oauth",
  },
}

const connectablePlatforms = ["whatsapp", "instagram", "facebook", "telegram", "sms"]
const UNAVAILABLE_COMING_SOON = new Set(["instagram", "facebook", "telegram", "sms"])
const comingSoonPlatforms = ["google_business", "apple_messages", "voice_ai", "teams", "slack"]

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-navy-100 dark:border-navy-700 bg-white dark:bg-navy-800 p-5 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-navy-50" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 bg-navy-50 rounded" />
          <div className="h-3 w-full bg-navy-50 rounded" />
          <div className="h-3 w-3/4 bg-navy-50 rounded" />
        </div>
      </div>
    </div>
  )
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null)
  const [telegramToken, setTelegramToken] = useState("")
  const [smtpForm, setSmtpForm] = useState({
    host: "", port: "587", username: "", password: "", fromEmail: "", fromName: "",
  })
  const [whatsappForm, setWhatsappForm] = useState({
    accessToken: "", phoneNumberId: "", wabaId: "", businessId: "",
  })

  const fetchIntegrations = useCallback(async () => {
    setLoading(true)
    setStatusError(null)
    try {
      const res = await apiFetch("/api/integrations")
      if (res.ok) {
        const data = await res.json()
        setIntegrations(data.integrations || [])
      } else if (res.status === 401) {
        setStatusError("Authentication required. Please log in.")
      } else {
        setStatusError("Failed to load integrations")
      }
    } catch {
      setStatusError("Network error loading integrations")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchIntegrations() }, [fetchIntegrations])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get("error")
    const success = params.get("success")
    if (error) {
      setStatusError(decodeURIComponent(error))
      window.history.replaceState({}, "", "/dashboard/integrations")
    }
    if (success) {
      fetchIntegrations()
      window.history.replaceState({}, "", "/dashboard/integrations")
    }
  }, [fetchIntegrations])

  const handleConnect = async (platform: string, authType: string) => {
    if (UNAVAILABLE_COMING_SOON.has(platform)) {
      return
    }

    if (authType === "oauth") {
      setConnecting(platform)
      try {
        window.location.href = `/api/integrations/${platform}/auth`
      } catch {
        setConnecting(null)
        setStatusError("Failed to initiate connection")
      }
      return
    }

    if (authType === "token") {
      setActiveModal({ platform, type: "telegram" })
      return
    }

    if (authType === "credentials") {
      setActiveModal({ platform, type: platform === "whatsapp" ? "whatsapp" : "email-smtp" })
      return
    }
  }

  const handleTelegramConnect = async () => {
    if (!telegramToken.trim()) return
    setConnecting("telegram")
    setActiveModal(null)
    try {
      const res = await apiFetch("/api/integrations/telegram/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: telegramToken.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setTelegramToken("")
        await fetchIntegrations()
      } else {
        setStatusError(data.error || "Failed to connect Telegram")
      }
    } catch {
      setStatusError("Network error connecting Telegram")
    } finally {
      setConnecting(null)
    }
  }

  const handleSmtpConnect = async () => {
    const { host, port, username, password, fromEmail, fromName } = smtpForm
    if (!host || !username || !password || !fromEmail) return
    setConnecting("email")
    setActiveModal(null)
    try {
      const res = await apiFetch("/api/integrations/email-smtp/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port: parseInt(port), username, password, fromEmail, fromName }),
      })
      const data = await res.json()
      if (res.ok) {
        setSmtpForm({ host: "", port: "587", username: "", password: "", fromEmail: "", fromName: "" })
        await fetchIntegrations()
      } else {
        setStatusError(data.error || "Failed to connect SMTP")
      }
    } catch {
      setStatusError("Network error connecting SMTP")
    } finally {
      setConnecting(null)
    }
  }

  const handleWhatsAppConnect = async () => {
    const { accessToken, phoneNumberId, wabaId, businessId } = whatsappForm
    if (!accessToken.trim() || !phoneNumberId.trim() || !wabaId.trim()) return
    setConnecting("whatsapp")
    setActiveModal(null)
    try {
      const res = await apiFetch("/api/integrations/whatsapp/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: accessToken.trim(),
          phoneNumberId: phoneNumberId.trim(),
          wabaId: wabaId.trim(),
          businessId: businessId.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setWhatsappForm({ accessToken: "", phoneNumberId: "", wabaId: "", businessId: "" })
        await fetchIntegrations()
      } else {
        setStatusError(data.error || "Failed to connect WhatsApp")
      }
    } catch {
      setStatusError("Network error connecting WhatsApp")
    } finally {
      setConnecting(null)
    }
  }

  const handleDisconnect = async (platform: string) => {
    setDisconnecting(platform)
    try {
      const res = await fetch(`/api/integrations/${platform}/disconnect`, { method: "POST" })
      if (res.ok) {
        await fetchIntegrations()
      } else {
        const data = await res.json()
        setStatusError(data.error || "Failed to disconnect")
      }
    } catch {
      setStatusError("Network error disconnecting")
    } finally {
      setDisconnecting(null)
      setActiveModal(null)
    }
  }

  const handleRefresh = () => {
    fetchIntegrations()
  }

  const getBadge = (status: IntegrationStatusValue) => {
    switch (status) {
      case "connected":
        return <Badge variant="success" size="sm"><CheckCircle className="h-3 w-3 mr-1" />Connected</Badge>
      case "error":
        return <Badge variant="danger" size="sm"><XCircle className="h-3 w-3 mr-1" />Error</Badge>
      case "expired":
        return <Badge variant="warning" size="sm"><Ban className="h-3 w-3 mr-1" />Expired</Badge>
      case "connecting":
        return <Badge variant="neutral" size="sm"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Connecting</Badge>
      default:
        return <Badge variant="neutral" size="sm">Not Connected</Badge>
    }
  }

  const getIntegration = (platform: string) => integrations.find((i) => i.platform === platform)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy-900 dark:text-navy-100 tracking-tight">Integrations</h1>
          <p className="text-sm text-navy-400 dark:text-navy-500 mt-1">Connect your clinic to messaging platforms.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {statusError && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">{statusError}</p>
          </div>
          <button onClick={() => setStatusError(null)} className="text-red-400 hover:text-red-600">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      <div>
        <h2 className="text-xs font-semibold text-navy-500 dark:text-navy-400 uppercase tracking-wider mb-3">Messaging Platforms</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            connectablePlatforms.map((platform) => {
              const integration = getIntegration(platform)
              const details = PLATFORM_DETAILS[platform]
              if (!details) return null
              const isComingSoon = UNAVAILABLE_COMING_SOON.has(platform)
              const isConnected = !isComingSoon && integration?.connected === true
              const status = integration?.status || "disconnected"
              const Icon = details.icon

              return (
                <Card key={platform} hover className={isComingSoon ? "opacity-75" : ""}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
                        isConnected ? details.bgLight : isComingSoon ? "bg-navy-50" : "bg-navy-25",
                      )}>
                        <Icon className={cn("h-5 w-5", isConnected ? details.color : isComingSoon ? "text-navy-400" : "text-navy-300")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-navy-900 dark:text-navy-100">{details.name}</h3>
                          {isComingSoon ? (
                            <Badge variant="neutral" size="sm">Coming Soon</Badge>
                          ) : (
                            getBadge(status)
                          )}
                        </div>
                        <p className="text-xs text-navy-400 leading-relaxed mb-2">{details.description}</p>

                        {!isComingSoon && isConnected && integration && (
                          <div className="mb-3 space-y-1.5">
                            {integration.providerName && (
                              <p className="text-2xs text-navy-500 dark:text-navy-400 flex items-center gap-1.5">
                                <CheckCircle className="h-3 w-3 text-emerald-500" />
                                Connected as <span className="font-medium">{integration.providerName}</span>
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {integration.webhookConfigured && (
                                <span className="text-2xs text-navy-400 flex items-center gap-1">
                                  <Webhook className="h-3 w-3" />Webhook Active
                                </span>
                              )}
                              {integration.permissions.length > 0 && (
                                <span className="text-2xs text-navy-400 flex items-center gap-1">
                                  <ShieldCheck className="h-3 w-3" />
                                  {integration.permissions.length} Permission{integration.permissions.length > 1 ? "s" : ""}
                                </span>
                              )}
                              {integration.tokenExpiresAt && (
                                <span className="text-2xs text-navy-400 flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Expires {new Date(integration.tokenExpiresAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            {integration.lastSyncAt && (
                              <p className="text-2xs text-navy-300">
                                Last sync: {new Date(integration.lastSyncAt).toLocaleString()}
                              </p>
                            )}
                            {status === "error" && (
                              <p className="text-2xs text-red-500 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Connection error. Reconnect to restore.
                              </p>
                            )}
                            {status === "expired" && (
                              <p className="text-2xs text-amber-600 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Token expired. Reconnect to refresh.
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          {isComingSoon ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled
                              className="cursor-not-allowed opacity-60 text-navy-400 bg-navy-50 border-navy-100 dark:border-navy-700"
                            >
                              Coming Soon
                            </Button>
                          ) : isConnected ? (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setActiveModal({ platform, type: "confirm-disconnect" })}
                                disabled={disconnecting === platform}
                              >
                                {disconnecting === platform ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                ) : (
                                  <Unlink className="h-3.5 w-3.5 mr-1.5" />
                                )}
                                Disconnect
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleConnect(platform, details.authType)}
                                disabled={connecting === platform}
                              >
                                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                Reconnect
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleConnect(platform, details.authType)}
                              disabled={connecting === platform}
                            >
                              {connecting === platform ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              ) : (
                                <Link2 className="h-3.5 w-3.5 mr-1.5" />
                              )}
                              Connect
                            </Button>
                          )}
                          {details.docUrl && (
                            <a href={details.docUrl} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="sm">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-navy-300 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-navy-700 dark:text-navy-200 mb-0.5">How integrations work</p>
            <p className="text-xs text-navy-400 leading-relaxed">
              Each connected channel feeds patient messages into Clinot's universal inbox. The AI Receptionist
              responds automatically. Your team only gets notified for appointments, emergencies, or when confidence
              is low. Real webhooks, real APIs, no fake data.
            </p>
          </div>
        </CardContent>
      </Card>

      {activeModal?.type === "telegram" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setActiveModal(null)}>
          <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-navy-900 dark:text-navy-100 mb-1">Connect Telegram Bot</h3>
            <p className="text-xs text-navy-400 mb-4">
              Create a bot via <strong>@BotFather</strong> on Telegram and paste the token below.
            </p>
            <input
              type="text"
              placeholder="Enter your bot token (e.g. 123456:ABC-DEF...)"
              value={telegramToken}
              onChange={(e) => setTelegramToken(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-navy-400"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setActiveModal(null); setTelegramToken("") }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleTelegramConnect} disabled={!telegramToken.trim()}>
                Connect
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeModal?.type === "email-smtp" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setActiveModal(null)}>
          <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-navy-900 dark:text-navy-100 mb-1">Connect SMTP Email</h3>
            <p className="text-xs text-navy-400 mb-4">
              Enter your SMTP server details to send and receive emails via Clinot.
            </p>
            <div className="space-y-3">
              <input type="text" placeholder="SMTP Host (e.g. smtp.gmail.com)" value={smtpForm.host}
                onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
              <input type="text" placeholder="Port (default: 587)" value={smtpForm.port}
                onChange={(e) => setSmtpForm({ ...smtpForm, port: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
              <input type="text" placeholder="Username" value={smtpForm.username}
                onChange={(e) => setSmtpForm({ ...smtpForm, username: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
              <input type="password" placeholder="Password" value={smtpForm.password}
                onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
              <input type="email" placeholder="From Email" value={smtpForm.fromEmail}
                onChange={(e) => setSmtpForm({ ...smtpForm, fromEmail: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
              <input type="text" placeholder="From Name (optional)" value={smtpForm.fromName}
                onChange={(e) => setSmtpForm({ ...smtpForm, fromName: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" size="sm" onClick={() => { setActiveModal(null); setSmtpForm({ host: "", port: "587", username: "", password: "", fromEmail: "", fromName: "" }) }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSmtpConnect}
                disabled={!smtpForm.host || !smtpForm.username || !smtpForm.password || !smtpForm.fromEmail}>
                Connect
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeModal?.type === "whatsapp" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setActiveModal(null)}>
          <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-navy-900 dark:text-navy-100 mb-1">Connect WhatsApp Business</h3>
            <p className="text-xs text-navy-400 mb-4">
              Paste your existing Meta WhatsApp Cloud API credentials from the Meta Developer Dashboard. The values are
              validated against the Graph API and encrypted before storing.
            </p>
            <div className="space-y-3">
              <input type="password" placeholder="System User Access Token" value={whatsappForm.accessToken}
                onChange={(e) => setWhatsappForm({ ...whatsappForm, accessToken: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
              <input type="text" placeholder="Phone Number ID" value={whatsappForm.phoneNumberId}
                onChange={(e) => setWhatsappForm({ ...whatsappForm, phoneNumberId: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
              <input type="text" placeholder="WABA ID (WhatsApp Business Account ID)" value={whatsappForm.wabaId}
                onChange={(e) => setWhatsappForm({ ...whatsappForm, wabaId: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
              <input type="text" placeholder="Business ID (optional)" value={whatsappForm.businessId}
                onChange={(e) => setWhatsappForm({ ...whatsappForm, businessId: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost" size="sm" onClick={() => { setActiveModal(null); setWhatsappForm({ accessToken: "", phoneNumberId: "", wabaId: "", businessId: "" }) }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleWhatsAppConnect}
                disabled={!whatsappForm.accessToken.trim() || !whatsappForm.phoneNumberId.trim() || !whatsappForm.wabaId.trim() || connecting === "whatsapp"}>
                {connecting === "whatsapp" ? "Connecting..." : "Connect"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeModal?.type === "confirm-disconnect" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setActiveModal(null)}>
          <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-navy-900 dark:text-navy-100 mb-1">Disconnect {PLATFORM_DETAILS[activeModal.platform]?.name}?</h3>
            <p className="text-xs text-navy-400 mb-4">
              This will remove the connection and stop message processing. You can reconnect anytime.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setActiveModal(null)}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={() => handleDisconnect(activeModal.platform)}
                disabled={disconnecting === activeModal.platform}>
                {disconnecting === activeModal.platform ? "Disconnecting..." : "Disconnect"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
