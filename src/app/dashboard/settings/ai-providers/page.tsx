"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/Button"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Bot, CheckCircle, ChevronDown, Key, RefreshCw, Trash2, Zap } from "lucide-react"
import { apiFetch } from "@/lib/client-auth"

type BYOProvider = "openai" | "anthropic" | "gemini" | "groq" | "openrouter"

interface ProviderInfo {
  key: string
  model: string
  active: boolean
}

interface PageData {
  useClinotAi: boolean
  aiProvider: string
  providers: Record<string, ProviderInfo>
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
}

const PROVIDER_ICONS: Record<string, string> = {
  openai: "🤖",
  anthropic: "🧠",
  gemini: "🔮",
  groq: "⚡",
  openrouter: "🌐",
}

async function fetchData(): Promise<PageData> {
  const res = await apiFetch("/api/settings/ai-providers")
  if (!res.ok) throw new Error("Failed to load")
  return res.json()
}

async function updateSetting(body: Record<string, unknown>) {
  const res = await apiFetch("/api/settings/ai-providers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.json()).error || "Failed to update")
  return res.json()
}

export default function AIProvidersPage() {
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [expanded, setExpanded] = useState(false)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [testResults, setTestResults] = useState<Record<string, "success" | "fail" | null>>({})

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError("")
      const d = await fetchData()
      setData(d)
    } catch {
      setError("Failed to load settings")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const switchToClinot = async () => {
    setSaving(true)
    setError("")
    setSuccess("")
    try {
      await updateSetting({ useClinotAi: true })
      setData((prev) => prev ? { ...prev, useClinotAi: true } : prev)
      setSuccess("Switched to Clinot AI")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const connectProvider = async (provider: string) => {
    const key = apiKeys[provider]
    if (!key || key.length < 10) {
      setError("Please enter a valid API key")
      return
    }

    setSaving(true)
    setError("")
    setSuccess("")
    try {
      await updateSetting({
        useClinotAi: false,
        aiProvider: provider,
        apiKey: key,
        provider,
      })
      setData((prev) => prev ? { ...prev, useClinotAi: false, aiProvider: provider } : prev)
      setSuccess(`Connected to ${PROVIDER_LABELS[provider]}`)
      setApiKeys((prev) => ({ ...prev, [provider]: "" }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async (provider: string) => {
    const key = apiKeys[provider] || data?.providers[provider]?.key
    if (!key) {
      setError("No API key to test")
      return
    }

    setTesting((prev) => ({ ...prev, [provider]: true }))
    setTestResults((prev) => ({ ...prev, [provider]: null }))
    setError("")

    try {
      const res = await apiFetch("/api/api-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: key }),
      })
      setTestResults((prev) => ({ ...prev, [provider]: res.ok ? "success" : "fail" }))
    } catch {
      setTestResults((prev) => ({ ...prev, [provider]: "fail" }))
    } finally {
      setTesting((prev) => ({ ...prev, [provider]: false }))
    }
  }

  const disconnectProvider = async (provider: string) => {
    setSaving(true)
    setError("")
    setSuccess("")
    try {
      await updateSetting({ disconnectProvider: provider })
      setData((prev) => {
        if (!prev) return prev
        const newProviders = { ...prev.providers }
        delete newProviders[provider]
        return { ...prev, providers: newProviders }
      })
      setSuccess(`Disconnected ${PROVIDER_LABELS[provider]}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-navy-50 dark:bg-navy-700 rounded-lg" />
        <div className="h-32 bg-navy-25 dark:bg-navy-800 rounded-2xl" />
      </div>
    )
  }

  const isClinot = data?.useClinotAi ?? true
  const currentProvider = data?.aiProvider || "clinot"

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-navy-900 dark:text-navy-100 tracking-tight">AI Providers</h1>
        <p className="text-sm text-navy-400 dark:text-navy-400 mt-1">Manage how AI responses are generated for your clinic</p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-danger-50 dark:bg-danger-900/30 border border-danger-100 dark:border-danger-800 text-xs text-danger-700 dark:text-danger-300">{error}</div>
      )}
      {success && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300">{success}</div>
      )}

      <Card className="border-emerald-100 dark:border-emerald-800 bg-emerald-25/50 dark:bg-emerald-900/20">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
              <Bot className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold text-navy-900 dark:text-navy-100">Clinot AI</span>
                <Badge variant="primary" size="sm">Recommended</Badge>
                {isClinot && <Badge variant="success" size="sm">Active</Badge>}
              </div>
              <p className="text-sm text-navy-400 dark:text-navy-400 mt-1.5">
                Managed by Clinot &bull; Included in your subscription &bull; No setup required
              </p>
              <p className="text-xs text-navy-300 dark:text-navy-500 mt-0.5">
                Automatically routes through the best AI model. You never need to manage API keys.
              </p>
            </div>
            {!isClinot && (
              <Button size="sm" onClick={switchToClinot} loading={saving}>
                <CheckCircle className="h-4 w-4" />
                Use Clinot AI
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-semibold text-navy-600 dark:text-navy-400 hover:text-navy-900 dark:hover:text-navy-200 transition-colors"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          Advanced — Bring Your Own AI Provider
        </button>
        <p className="text-xs text-navy-400 dark:text-navy-500 mt-1 ml-6">
          For organizations that want complete control over AI billing and provider selection.
        </p>
      </div>

      {expanded && (
        <div className="space-y-4">
          {(["openai", "anthropic", "gemini", "groq", "openrouter"] as BYOProvider[]).map((provider) => {
            const connected = !!data?.providers[provider]
            const isActiveProvider = !isClinot && currentProvider === provider

            return (
              <Card key={provider} className={`${isActiveProvider ? "border-primary-200 dark:border-primary-700 bg-primary-25/30 dark:bg-primary-900/20" : ""}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-25 dark:bg-navy-750 text-lg">
                        {PROVIDER_ICONS[provider]}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-navy-900 dark:text-navy-100">{PROVIDER_LABELS[provider]}</span>
                          {connected && <Zap className="h-3.5 w-3.5 text-emerald-500" />}
                          {isActiveProvider && <Badge variant="primary" size="sm">Active</Badge>}
                        </div>
                          {connected && data?.providers[provider]?.model && (
                          <p className="text-xs text-navy-400 dark:text-navy-500 mt-0.5">Model: {data.providers[provider].model}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {testResults[provider] === "success" && (
                        <Badge variant="success" size="sm">Connected</Badge>
                      )}
                      {testResults[provider] === "fail" && (
                        <Badge variant="danger" size="sm">Failed</Badge>
                      )}
                    </div>
                  </div>

                  {connected ? (
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => disconnectProvider(provider)}
                        disabled={saving}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-danger-500" />
                        Remove Key
                      </Button>
                      {!isActiveProvider && !isClinot && (
                        <Button size="sm" onClick={() => connectProvider(provider)} loading={saving}>
                          <Zap className="h-3.5 w-3.5" />
                          Switch to {PROVIDER_LABELS[provider]}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={apiKeys[provider] || ""}
                          onChange={(e) => setApiKeys((prev) => ({ ...prev, [provider]: e.target.value }))}
                          className="flex-1 px-3.5 py-2 rounded-xl border border-navy-100 dark:border-navy-600 bg-white dark:bg-navy-800 text-sm text-navy-900 dark:text-navy-100 placeholder:text-navy-300 dark:placeholder:text-navy-500 focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500"
                          placeholder={`Enter ${PROVIDER_LABELS[provider]} API key`}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testConnection(provider)}
                          loading={testing[provider]}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Test
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => connectProvider(provider)}
                          loading={saving}
                        >
                          <Key className="h-3.5 w-3.5" />
                          Connect
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="p-4 rounded-2xl bg-amber-25 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          <strong>Security:</strong> API keys are encrypted at rest and never exposed to the frontend.
          They are only decrypted server-side during AI requests.
        </p>
      </div>
    </div>
  )
}
