"use client"

import { useState, useEffect } from "react"
import { Card, CardHeader, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Key, Loader2, Save, Check, X, Shield, Eye, EyeOff, Cpu, Zap } from "lucide-react"
import { apiFetch } from "@/lib/client-auth"

interface ApiConfig {
  provider: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

const providerModels: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4", "gpt-3.5-turbo"],
  anthropic: ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash"],
}

const providerColors: Record<string, "primary" | "emerald" | "amber" | "purple"> = {
  openai: "primary",
  anthropic: "emerald",
  gemini: "amber",
}

export default function ApiConfigPage() {
  const [config, setConfig] = useState<ApiConfig>({
    provider: "openai", apiKey: "", model: "gpt-4o", temperature: 0.7, maxTokens: 1024,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    apiFetch("/api/api-config")
      .then((r) => r.json())
      .then((data) => { if (data) setConfig(data) })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    await apiFetch("/api/api-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
    setSaving(false)
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await apiFetch("/api/api-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      setTestResult(res.ok ? "success" : "error")
    } catch {
      setTestResult("error")
    }
    setTesting(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 flex items-center gap-2">
            <Key className="h-6 w-6 text-primary-500" /> API Configuration
          </h1>
          <p className="text-sm text-navy-400 mt-1">Connect your own AI provider API key</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={testConnection} disabled={testing || !config.apiKey}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {testing ? "Testing..." : "Test"}
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {testResult && (
        <Card>
          <CardContent className="pt-5">
            <div className={`flex items-center gap-2 text-sm ${testResult === "success" ? "text-emerald-600" : "text-red-600"}`}>
              {testResult === "success" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              {testResult === "success" ? "Connection successful! Your API key is valid." : "Connection failed. Check your API key and provider settings."}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-navy-900 flex items-center gap-2"><Cpu className="h-4 w-4" /> Provider</h2></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-navy-500 mb-1.5 block">AI Provider</label>
                <select value={config.provider} onChange={(e) => { setConfig({ ...config, provider: e.target.value, model: providerModels[e.target.value]?.[0] || "" }) }} className="input-field">
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-500 mb-1.5 block">API Key</label>
                <div className="relative">
                  <input type={showKey ? "text" : "password"} value={config.apiKey} onChange={(e) => setConfig({ ...config, apiKey: e.target.value })} className="input-field pr-9" placeholder="sk-..." />
                  <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2">
                    {showKey ? <EyeOff className="h-4 w-4 text-navy-400" /> : <Eye className="h-4 w-4 text-navy-400" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-500 mb-1.5 block">Model</label>
                <select value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} className="input-field">
                  {(providerModels[config.provider] || []).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-navy-900">Model Parameters</h2></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-navy-500 mb-1.5 block">Temperature: {config.temperature}</label>
                <input type="range" min="0" max="2" step="0.1" value={config.temperature} onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })} className="w-full accent-primary-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-500 mb-1.5 block">Max Tokens: {config.maxTokens}</label>
                <input type="range" min="256" max="4096" step="128" value={config.maxTokens} onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) })} className="w-full accent-primary-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-navy-900">Usage & Limits</h2></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-navy-50/50">
                <span className="text-xs text-navy-500">Requests this month</span>
                <span className="text-sm font-semibold text-navy-900">0</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-navy-50/50">
                <span className="text-xs text-navy-500">Tokens used</span>
                <span className="text-sm font-semibold text-navy-900">0</span>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 text-xs text-amber-700">
                Usage tracking will populate as conversations are processed through your API key.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
