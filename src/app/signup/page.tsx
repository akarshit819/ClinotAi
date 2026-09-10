"use client"

import { useState, FormEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Eye, EyeOff, AlertTriangle, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { FormField, TextInput } from "@/components/ui/FormField"
import { AuthLayout } from "@/components/auth/AuthLayout"

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
    <AuthLayout eyebrow="Start your free trial" title="Create account">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700 dark:border-danger-800 dark:bg-danger-900/20 dark:text-danger-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <FormField label="Your Name" required>
          {(id) => (
            <TextInput id={id} type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Smith" autoComplete="name" autoFocus required />
          )}
        </FormField>

        <FormField label="Clinic Name" required>
          {(id) => (
            <TextInput id={id} type="text" value={clinicName} onChange={(e) => setClinicName(e.target.value)}
              placeholder="Smith Family Dental" required />
          )}
        </FormField>

        <FormField label="Email" required>
          {(id) => (
            <TextInput id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@clinic.com" autoComplete="email" required />
          )}
        </FormField>

        <FormField label="Password" required>
          {(id) => (
            <div className="relative">
              <TextInput id={id} type={showPassword ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="Create a strong password"
                autoComplete="new-password" required className="pr-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-navy-300 transition-colors hover:text-navy-500 dark:text-navy-500 dark:hover:text-navy-300">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}
        </FormField>
        {password.length > 0 && (
          <ul className="space-y-1" aria-label="Password requirements">
            {passwordChecks.map((check) => (
              <li key={check.label} className="flex items-center gap-1.5 text-2xs">
                {check.met ? (
                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                ) : (
                  <div className="h-3 w-3 rounded-full border border-navy-200 dark:border-navy-600" />
                )}
                <span className={check.met ? "text-emerald-600 dark:text-emerald-400" : "text-navy-400 dark:text-navy-500"}>{check.label}</span>
              </li>
            ))}
          </ul>
        )}

        <Button type="submit" className="w-full" loading={loading}>
          {loading ? "Creating account..." : "Create account"}
        </Button>

        <p className="text-center text-xs text-navy-400 dark:text-navy-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
