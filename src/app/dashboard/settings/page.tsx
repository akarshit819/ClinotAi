"use client"

import { useState, useEffect } from "react"
import { Card, CardHeader, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Loader2, Save, Building2, Clock, Globe, Bell, Bot, Palette, Moon, Sun } from "lucide-react"
import { useTheme } from "@/contexts/ThemeContext"
import Link from "next/link"
import { apiFetch } from "@/lib/client-auth"

interface Settings {
  clinicName: string
  clinicAddress: string
  clinicPhone: string
  timezone: string
  language: string
  businessHours: string
  welcomeMessage: string
  afterHoursMessage: string
  notificationsEmail: string
  notificationsPhone: string
}

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme()
  const [settings, setSettings] = useState<Settings>({
    clinicName: "", clinicAddress: "", clinicPhone: "", timezone: "America/New_York",
    language: "en", businessHours: "Mon-Fri 9:00-17:00", welcomeMessage: "",
    afterHoursMessage: "", notificationsEmail: "", notificationsPhone: "",
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState("general")

  useEffect(() => {
    apiFetch("/api/settings")
      .then((r) => r.json())
      .then((data) => { if (data) setSettings(data) })
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    await apiFetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const tabs = [
    { id: "general", label: "General", icon: Building2 },
    { id: "hours", label: "Hours", icon: Clock },
    { id: "messages", label: "Messages", icon: Globe },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "ai-providers", label: "AI Providers", icon: Bot, href: "/dashboard/settings/ai-providers" },
  ]

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
          <h1 className="text-2xl font-bold text-navy-900 dark:text-navy-100">Settings</h1>
          <p className="text-sm text-navy-400 dark:text-navy-400 mt-1">Manage your clinic profile and preferences</p>
        </div>
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
        </Button>
      </div>

      <div className="flex overflow-x-auto gap-2 pb-2">
        {tabs.map((tab) =>
          tab.href ? (
            <Link
              key={tab.id}
              href={tab.href}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl whitespace-nowrap transition-colors text-navy-500 dark:text-navy-400 hover:text-navy-700 dark:hover:text-navy-200 hover:bg-navy-50 dark:hover:bg-navy-750"
            >
              <tab.icon className="h-4 w-4" /> {tab.label}
            </Link>
          ) : (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl whitespace-nowrap transition-colors ${
                activeTab === tab.id ? "bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400" : "text-navy-500 dark:text-navy-400 hover:text-navy-700 dark:hover:text-navy-200 hover:bg-navy-50 dark:hover:bg-navy-750"
              }`}
            >
              <tab.icon className="h-4 w-4" /> {tab.label}
            </button>
          )
        )}
      </div>

      {activeTab === "general" && (
        <>
          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100">Clinic Information</h2></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-navy-500 dark:text-navy-400 mb-1.5 block">Clinic Name</label>
                <input type="text" value={settings.clinicName} onChange={(e) => setSettings({ ...settings, clinicName: e.target.value })} className="input-field" placeholder="e.g. SmileCare Dental" />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-500 dark:text-navy-400 mb-1.5 block">Address</label>
                <input type="text" value={settings.clinicAddress} onChange={(e) => setSettings({ ...settings, clinicAddress: e.target.value })} className="input-field" placeholder="123 Main St, Suite 100" />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-500 dark:text-navy-400 mb-1.5 block">Phone</label>
                <input type="text" value={settings.clinicPhone} onChange={(e) => setSettings({ ...settings, clinicPhone: e.target.value })} className="input-field" placeholder="(555) 123-4567" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-navy-500 dark:text-navy-400 mb-1.5 block">Timezone</label>
                  <select value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} className="input-field">
                    <option value="America/New_York">Eastern (ET)</option>
                    <option value="America/Chicago">Central (CT)</option>
                    <option value="America/Denver">Mountain (MT)</option>
                    <option value="America/Los_Angeles">Pacific (PT)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-navy-500 dark:text-navy-400 mb-1.5 block">Language</label>
                  <select value={settings.language} onChange={(e) => setSettings({ ...settings, language: e.target.value })} className="input-field">
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100 flex items-center gap-2"><Palette className="h-4 w-4" /> Appearance</h2></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-navy-900 dark:text-navy-100">Theme</p>
                  <p className="text-xs text-navy-500 dark:text-navy-400 mt-0.5">Switch between light and dark mode</p>
                </div>
                <button
                  onClick={toggleTheme}
                  className="flex items-center justify-center p-2 rounded-lg transition-colors text-navy-500 dark:text-navy-400 hover:bg-navy-50 dark:hover:bg-navy-750"
                  aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
                >
                  {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === "hours" && (
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100">Business Hours</h2></CardHeader>
          <CardContent>
            <div>
              <label className="text-xs font-medium text-navy-500 dark:text-navy-400 mb-1.5 block">Hours (e.g., Mon-Fri 9:00-17:00)</label>
              <input type="text" value={settings.businessHours} onChange={(e) => setSettings({ ...settings, businessHours: e.target.value })} className="input-field" placeholder="Mon-Fri 9:00-17:00" />
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "messages" && (
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100">Auto Messages</h2></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-navy-500 dark:text-navy-400 mb-1.5 block">Welcome Message</label>
              <textarea value={settings.welcomeMessage} onChange={(e) => setSettings({ ...settings, welcomeMessage: e.target.value })} className="input-field min-h-[80px]" placeholder="Hi! Welcome to our dental clinic..." />
            </div>
            <div>
              <label className="text-xs font-medium text-navy-500 dark:text-navy-400 mb-1.5 block">After Hours Message</label>
              <textarea value={settings.afterHoursMessage} onChange={(e) => setSettings({ ...settings, afterHoursMessage: e.target.value })} className="input-field min-h-[80px]" placeholder="We are currently closed..." />
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "notifications" && (
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100">Notification Settings</h2></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-navy-500 dark:text-navy-400 mb-1.5 block">Email for Notifications</label>
              <input type="email" value={settings.notificationsEmail} onChange={(e) => setSettings({ ...settings, notificationsEmail: e.target.value })} className="input-field" placeholder="you@clinic.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-navy-500 dark:text-navy-400 mb-1.5 block">Phone for SMS Alerts</label>
              <input type="text" value={settings.notificationsPhone} onChange={(e) => setSettings({ ...settings, notificationsPhone: e.target.value })} className="input-field" placeholder="(555) 123-4567" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
