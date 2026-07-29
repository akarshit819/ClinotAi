"use client"

import { useState, FormEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Eye, EyeOff, Loader2, AlertTriangle, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/Button"

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [clinicName, setClinicName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const passwordChecks = [
    { label: "At least 10 characters", met: password.length >= 10 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Lowercase letter", met: /[a-z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(password) },
  ]

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim() || !clinicName.trim() || !email.trim() || !password) {
      setError("All fields are required")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          clinicName: clinicName.trim(),
          email: email.trim(),
          password,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Registration failed")
        return
      }

      router.push("/onboarding")
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-50 via-white to-navy-25 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-navy-900">Clinot</h1>
          <p className="text-sm text-navy-400 mt-1">Start your free trial</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-navy-100 p-6 space-y-4">
          <h2 className="text-lg font-bold text-navy-900">Create account</h2>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-xs font-semibold text-navy-600 mb-1.5">Your Name</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Smith" autoComplete="name" autoFocus
              className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
          </div>

          <div>
            <label htmlFor="clinicName" className="block text-xs font-semibold text-navy-600 mb-1.5">Clinic Name</label>
            <input id="clinicName" type="text" value={clinicName} onChange={(e) => setClinicName(e.target.value)}
              placeholder="Smith Family Dental"
              className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
          </div>

          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-navy-600 mb-1.5">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@clinic.com" autoComplete="email"
              className="w-full px-3 py-2.5 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-navy-600 mb-1.5">Password</label>
            <div className="relative">
              <input id="password" type={showPassword ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="Create a strong password"
                autoComplete="new-password"
                className="w-full px-3 py-2.5 pr-10 text-sm border border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-300 hover:text-navy-500">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {password.length > 0 && (
              <div className="mt-2 space-y-1">
                {passwordChecks.map((check) => (
                  <div key={check.label} className="flex items-center gap-1.5 text-2xs">
                    {check.met ? (
                      <CheckCircle className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <div className="h-3 w-3 rounded-full border border-navy-200" />
                    )}
                    <span className={check.met ? "text-emerald-600" : "text-navy-400"}>{check.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Creating account..." : "Create account"}
          </Button>

          <p className="text-center text-xs text-navy-400">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-navy-700 hover:text-navy-900">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
