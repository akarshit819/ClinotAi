"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Globe, CheckCircle2, XCircle, Copy, RefreshCw, Code2, Monitor, Smartphone, Eye, EyeOff, Check } from "lucide-react"

export default function WebsiteIntegrationPage() {
  const [copied, setCopied] = useState(false)
  const [showPreview, setShowPreview] = useState(true)

  const snippet = `<script>
  window.clinotConfig = {
    clinicId: "demo-clinic",
    position: "bottom-right",
    theme: "light",
  };
</script>
<script src="https://app.clinot.ai/widget.js" async></script>`

  const copySnippet = () => {
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-900 dark:text-navy-100">Website Integration</h1>
        <p className="text-sm text-navy-400 dark:text-navy-400 mt-1">Connect your website to Clinot AI in minutes</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
                <Globe className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-lg font-bold text-navy-900 dark:text-navy-100">Connected</div>
                  <Badge variant="success">Live</Badge>
                </div>
                <div className="text-xs text-navy-400 dark:text-navy-400">Website Status</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
                <Code2 className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-lg font-bold text-navy-900 dark:text-navy-100">Installed</div>
                  <Badge variant="success">Active</Badge>
                </div>
                <div className="text-xs text-navy-400 dark:text-navy-400">Widget Status</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-50 dark:bg-navy-800">
                <Monitor className="h-5 w-5 text-navy-500 dark:text-navy-400" />
              </div>
              <div>
                <div className="text-lg font-bold text-navy-900 dark:text-navy-100">democlinic.com</div>
                <div className="text-xs text-navy-400 dark:text-navy-400">Connected Domain</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100">Installation Snippet</h2>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={copySnippet}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied!" : "Copy Snippet"}
              </Button>
              <Button size="sm" variant="secondary">
                <RefreshCw className="h-4 w-4" /> Regenerate
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-navy-900 dark:bg-navy-950 text-navy-100 rounded-xl p-4 text-xs font-mono overflow-x-auto mb-4">
            <pre className="whitespace-pre-wrap">{snippet}</pre>
          </div>

          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
            Paste this snippet just before the closing <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs font-mono">&lt;/body&gt;</code> tag on every page of your website. The AI widget will appear automatically.
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100">Installation Guide</h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { step: "1", title: "Copy the snippet", desc: "Click the copy button above to copy your unique installation code." },
              { step: "2", title: "Open your website template", desc: "Access your website's HTML template or theme editor." },
              { step: "3", title: "Paste before closing body tag", desc: "Paste the snippet just before the closing </body> tag." },
              { step: "4", title: "Save and publish", desc: "Save your changes and publish your website. The widget appears automatically." },
              { step: "5", title: "Verify installation", desc: "The widget status will update to 'Installed' once detected on your site." },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-xs font-bold text-primary-600 dark:text-primary-400">
                  {item.step}
                </div>
                <div>
                  <div className="text-sm font-medium text-navy-900 dark:text-navy-100">{item.title}</div>
                  <div className="text-xs text-navy-500 dark:text-navy-400 mt-0.5">{item.desc}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100">Live Preview</h2>
            <button onClick={() => setShowPreview(!showPreview)} className="p-1.5 hover:bg-navy-50 dark:hover:bg-navy-750 rounded-lg">
              {showPreview ? <EyeOff className="h-4 w-4 text-navy-400" /> : <Eye className="h-4 w-4 text-navy-400" />}
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative bg-navy-50 dark:bg-navy-800/50 rounded-xl overflow-hidden" style={{ height: 320 }}>
              <div className="absolute inset-0 flex items-center justify-center text-navy-300 dark:text-navy-500 text-sm">
                {showPreview ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-full max-w-sm p-4 rounded-2xl bg-white shadow-lg">
                      <div className="h-4 w-32 bg-navy-100 rounded mb-3" />
                      <div className="h-3 w-full bg-navy-50 rounded mb-2" />
                      <div className="h-3 w-3/4 bg-navy-50 rounded" />
                    </div>
                    <div className="absolute bottom-4 right-4 flex items-center justify-center h-14 w-14 rounded-full shadow-lg bg-primary-500">
                      <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Eye className="h-6 w-6" />
                    <span>Preview hidden</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
