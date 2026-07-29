"use client"

import { useState, useEffect, FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Loader2, CheckCircle, ArrowRight, Building2, Clock, Globe, Phone, Palette } from "lucide-react"
import { Button } from "@/components/ui/Button"

interface ClinicData {
  name: string
  logo: string | null
  timezone: string
  country: string
  language: string
  specialty: string | null
  phone: string | null
  email: string | null
  address: string | null
  emergencyPhone: string | null
  openingHours: string | null
  welcomeMessage: string | null
  afterHoursMessage: string | null
  primaryColor: string
  isOnboarded: boolean
  onboardingStep: number
}

const STEPS = [
  { title: "Clinic Profile", icon: Building2, description: "Tell us about your practice" },
  { title: "Location & Hours", icon: Clock, description: "Set your timezone and schedule" },
  { title: "Contact Info", icon: Phone, description: "How patients reach you" },
  { title: "Branding", icon: Palette, description: "Customize your clinic" },
  { title: "AI Settings", icon: Globe, description: "Configure your AI Receptionist" },
]

const SPECIALTIES = [
  "General Dentistry", "Orthodontics", "Pediatric Dentistry", "Periodontics",
  "Endodontics", "Oral Surgery", "Prosthodontics", "Cosmetic Dentistry",
]

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Europe/Paris",
  "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Australia/Sydney",
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [data, setData] = useState<ClinicData>({
    name: "", logo: null, timezone: "America/New_York", country: "US", language: "en",
    specialty: null, phone: null, email: null, address: null, emergencyPhone: null,
    openingHours: null, welcomeMessage: null, afterHoursMessage: null,
    primaryColor: "#1E7FE3", isOnboarded: false, onboardingStep: 0,
  })

  const [hours, setHours] = useState<Record<string, { open: string; close: string; closed: boolean }>>({
    monday: { open: "09:00", close: "17:00", closed: false },
    tuesday: { open: "09:00", close: "17:00", closed: false },
    wednesday: { open: "09:00", close: "17:00", closed: false },
    thursday: { open: "09:00", close: "17:00", closed: false },
    friday: { open: "09:00", close: "16:00", closed: false },
    saturday: { open: "09:00", close: "13:00", closed: true },
    sunday: { open: "", close: "", closed: true },
  })

  useEffect(() => {
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((d) => {
        if (d.clinic) {
          setData(d.clinic)
          setStep(Math.max(d.clinic.onboardingStep + 1, 1))
          if (d.clinic.isOnboarded) {
            router.push("/dashboard")
            return
          }
        }
      })
      .catch(() => setError("Failed to load onboarding"))
      .finally(() => setLoading(false))
  }, [router])

  const saveStep = async (stepData?: any) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, data: stepData || data }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || "Save failed")
        return false
      }
      return true
    } catch {
      setError("Network error")
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleNext = async () => {
    if (step === 2) {
      const saved = await saveStep({ businessHours: hours, openingHours: JSON.stringify(hours) })
      if (!saved) return
    } else if (step === 4) {
      const saved = await saveStep({ primaryColor: data.primaryColor, logo: data.logo })
      if (!saved) return
    } else if (step === 5) {
      const saved = await saveStep({})
      if (!saved) return
      router.push("/dashboard")
      return
    } else {
      const saved = await saveStep()
      if (!saved) return
    }
    setStep((s) => Math.min(s + 1, 5))
  }

  const update = (field: string, value: any) => setData((d) => ({ ...d, [field]: value }))

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-50 via-white to-navy-25">
        <Loader2 className="h-8 w-8 animate-spin text-navy-300" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-50 via-white to-navy-25">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-navy-900">Welcome to Clinot</h1>
          <p className="text-sm text-navy-400 mt-1">Let's set up your clinic in a few steps</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-10">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all duration-200 ${
                i + 1 <= step ? "bg-navy-900 text-white" : "bg-navy-50 text-navy-300"
              }`}>
                {i + 1 < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 ${i + 1 < step ? "bg-navy-900" : "bg-navy-100"}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-navy-100 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-50">
              {(() => { const Icon = STEPS[step - 1].icon; return <Icon className="h-5 w-5 text-navy-600" /> })()}
            </div>
            <div>
              <h2 className="text-lg font-bold text-navy-900">{STEPS[step - 1].title}</h2>
              <p className="text-xs text-navy-400">{STEPS[step - 1].description}</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-navy-600 mb-1.5">Clinic Name</label>
                <input type="text" value={data.name} onChange={(e) => update("name", e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy-600 mb-1.5">Medical Specialty</label>
                <select value={data.specialty || ""} onChange={(e) => update("specialty", e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400">
                  <option value="">Select specialty...</option>
                  {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy-600 mb-1.5">Country</label>
                <select value={data.country} onChange={(e) => update("country", e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400">
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="GB">United Kingdom</option>
                  <option value="AU">Australia</option>
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-navy-600 mb-1.5">Timezone</label>
                <select value={data.timezone} onChange={(e) => update("timezone", e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400">
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-navy-600">Business Hours</label>
                {Object.entries(hours).map(([day, h]) => (
                  <div key={day} className="flex items-center gap-3">
                    <span className="w-20 text-xs font-medium text-navy-600 capitalize">{day}</span>
                    <label className="flex items-center gap-1.5 text-xs text-navy-500 min-w-[60px]">
                      <input type="checkbox" checked={!h.closed} onChange={() => setHours((prev) => ({ ...prev, [day]: { ...prev[day], closed: !prev[day].closed } }))}
                        className="rounded border-navy-200" />
                      Open
                    </label>
                    {!h.closed && (
                      <>
                        <input type="time" value={h.open} onChange={(e) => setHours((prev) => ({ ...prev, [day]: { ...prev[day], open: e.target.value } }))}
                          className="px-2 py-1.5 text-xs border border-navy-200 rounded-lg" />
                        <span className="text-xs text-navy-300">to</span>
                        <input type="time" value={h.close} onChange={(e) => setHours((prev) => ({ ...prev, [day]: { ...prev[day], close: e.target.value } }))}
                          className="px-2 py-1.5 text-xs border border-navy-200 rounded-lg" />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-navy-600 mb-1.5">Phone</label>
                <input type="tel" value={data.phone || ""} onChange={(e) => update("phone", e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy-600 mb-1.5">Email</label>
                <input type="email" value={data.email || ""} onChange={(e) => update("email", e.target.value)}
                  placeholder="contact@clinic.com"
                  className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy-600 mb-1.5">Address</label>
                <input type="text" value={data.address || ""} onChange={(e) => update("address", e.target.value)}
                  placeholder="123 Main St, City, State"
                  className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy-600 mb-1.5">Emergency Contact Number</label>
                <input type="tel" value={data.emergencyPhone || ""} onChange={(e) => update("emergencyPhone", e.target.value)}
                  placeholder="For after-hours emergencies"
                  className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-navy-600 mb-1.5">Clinic Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={data.primaryColor} onChange={(e) => update("primaryColor", e.target.value)}
                    className="h-10 w-10 rounded-lg border border-navy-200 cursor-pointer" />
                  <span className="text-xs text-navy-400">{data.primaryColor}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy-600 mb-1.5">Welcome Message</label>
                <textarea value={data.welcomeMessage || ""} onChange={(e) => update("welcomeMessage", e.target.value)}
                  placeholder="Hello! Welcome to our clinic. How can we help you today?"
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy-600 mb-1.5">After-Hours Message</label>
                <textarea value={data.afterHoursMessage || ""} onChange={(e) => update("afterHoursMessage", e.target.value)}
                  placeholder="Our clinic is currently closed. We'll respond during business hours."
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400 resize-none" />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-navy-25 border border-navy-100">
                <p className="text-sm text-navy-700 font-medium mb-1">You're almost done!</p>
                <p className="text-xs text-navy-400">
                  Your AI Receptionist is ready. It will handle patient inquiries, schedule appointments,
                  and forward emergencies to your team. Review your settings in the dashboard anytime.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                <p className="text-sm text-blue-700 font-medium mb-1">Next: Connect messaging channels</p>
                <p className="text-xs text-blue-500">
                  After onboarding, connect WhatsApp, Telegram, or other platforms so patients can message you.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-8 pt-6 border-t border-navy-100">
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(s - 1, 1))} disabled={step === 1}>
              Back
            </Button>
            <Button size="sm" onClick={handleNext} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {step === 5 ? "Finish" : "Continue"}
              {!saving && <ArrowRight className="h-4 w-4 ml-1.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
