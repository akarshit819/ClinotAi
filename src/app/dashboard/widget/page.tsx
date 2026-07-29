"use client"

import { useState, useEffect } from "react"
import { Card, CardHeader, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Code2, Loader2, Copy, Check, Palette, MessageCircle, Globe, Eye, EyeOff, Smartphone, Monitor } from "lucide-react"

interface WidgetConfig {
  primaryColor: string
  position: "bottom-right" | "bottom-left"
  title: string
  subtitle: string
  showBranding: boolean
  autoOpen: boolean
  language: string
}

export default function WidgetPage() {
  const [config, setConfig] = useState<WidgetConfig>({
    primaryColor: "#6366f1",
    position: "bottom-right",
    title: "Need Help?",
    subtitle: "Chat with our AI assistant",
    showBranding: true,
    autoOpen: false,
    language: "en",
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    fetch("/api/widget")
      .then((r) => r.json())
      .then((data) => { if (data) setConfig(data) })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    await fetch("/api/widget", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
    setSaving(false)
  }

  const embedCode = `<script>
(function() {
  var w = window, d = document, s = d.createElement('script');
  s.src = '${process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "")}/api/widget/script';
  s.async = true;
  s.setAttribute('data-clinic', 'demo-clinic');
  d.head.appendChild(s);
})();
</script>`

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500 dark:text-primary-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 dark:text-navy-100">Widget</h1>
          <p className="text-sm text-navy-400 dark:text-navy-400 mt-1">Customize your embeddable chat widget</p>
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100 flex items-center gap-2"><Palette className="h-4 w-4" /> Appearance</h2></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-navy-500 dark:text-navy-400 mb-1.5 block">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={config.primaryColor} onChange={(e) => setConfig({ ...config, primaryColor: e.target.value })} className="h-9 w-12 rounded-lg border border-navy-200 dark:border-navy-600 cursor-pointer dark:bg-navy-800" />
                  <span className="text-xs text-navy-400 dark:text-navy-500 font-mono">{config.primaryColor}</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-navy-500 dark:text-navy-400 mb-1.5 block">Position</label>
                <select value={config.position} onChange={(e) => setConfig({ ...config, position: e.target.value as WidgetConfig["position"] })} className="input-field">
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100 flex items-center gap-2"><MessageCircle className="h-4 w-4" /> Chat Settings</h2></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-navy-500 dark:text-navy-400 mb-1.5 block">Title</label>
                <input type="text" value={config.title} onChange={(e) => setConfig({ ...config, title: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-500 dark:text-navy-400 mb-1.5 block">Subtitle</label>
                <input type="text" value={config.subtitle} onChange={(e) => setConfig({ ...config, subtitle: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-500 dark:text-navy-400 mb-1.5 block">Language</label>
                <select value={config.language} onChange={(e) => setConfig({ ...config, language: e.target.value })} className="input-field">
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-navy-500 dark:text-navy-400">Powered by Clinot AI branding</span>
                <button onClick={() => setConfig({ ...config, showBranding: !config.showBranding })} className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${config.showBranding ? "bg-primary-500" : "bg-navy-200"}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${config.showBranding ? "translate-x-5" : "translate-x-1"}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-navy-500 dark:text-navy-400">Auto-open after 5s</span>
                <button onClick={() => setConfig({ ...config, autoOpen: !config.autoOpen })} className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${config.autoOpen ? "bg-primary-500" : "bg-navy-200"}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${config.autoOpen ? "translate-x-5" : "translate-x-1"}`} />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100 flex items-center gap-2"><Code2 className="h-4 w-4" /> Embed Code</h2>
                <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(embedCode); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-navy-900 dark:bg-navy-950 text-navy-100 rounded-xl p-4 text-xs font-mono overflow-x-auto">
                <pre className="whitespace-pre-wrap">{embedCode}</pre>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100 flex items-center gap-2"><Eye className="h-4 w-4" /> Live Preview</h2>
                <button onClick={() => setPreview(!preview)} className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${preview ? "bg-primary-500" : "bg-navy-200"}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${preview ? "translate-x-5" : "translate-x-1"}`} />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative bg-navy-50 dark:bg-navy-800/50 rounded-xl overflow-hidden" style={{ height: 400 }}>
                <div className="absolute inset-0 flex items-center justify-center">
                  {preview ? (
                    <div className="flex items-center gap-3">
                      <div className="p-4 rounded-2xl bg-white shadow-lg max-w-[280px]">
                        <div className="text-sm font-semibold text-navy-900 mb-1">{config.title}</div>
                        <div className="text-xs text-navy-400">{config.subtitle}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-navy-300">
                      <Monitor className="h-5 w-5" />
                      <span className="text-sm">Toggle preview to see widget</span>
                    </div>
                  )}
                </div>
                {preview && (
                  <div className={`absolute bottom-4 ${config.position === "bottom-right" ? "right-4" : "left-4"}`}>
                    <div className="flex items-center justify-center h-14 w-14 rounded-full shadow-lg cursor-pointer" style={{ backgroundColor: config.primaryColor }}>
                      <MessageCircle className="h-6 w-6 text-white" />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
