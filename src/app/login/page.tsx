"use client"

import { useState, FormEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Eye, EyeOff, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { FormField, TextInput } from "@/components/ui/FormField"
import { AuthLayout } from "@/components/auth/AuthLayout"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError("Email and password are required")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, rememberMe }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Login failed")
        return
      }

      router.push("/dashboard")
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout eyebrow="AI Receptionist for Dental Clinics" title="Sign in">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700 dark:border-danger-800 dark:bg-danger-900/20 dark:text-danger-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <FormField label="Email" required>
          {(id) => (
            <TextInput
              id={id}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@clinic.com"
              autoComplete="email"
              autoFocus
              required
              aria-invalid={Boolean(error)}
            />
          )}
        </FormField>

        <FormField label="Password" required>
          {(id) => (
            <div className="relative">
              <TextInput
                id={id}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                aria-invalid={Boolean(error)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-navy-300 transition-colors hover:text-navy-500 dark:text-navy-500 dark:hover:text-navy-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}
        </FormField>

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-navy-200 text-primary-500 focus:ring-primary-500/25"
            />
            <span className="text-xs text-navy-500 dark:text-navy-400">Remember me</span>
          </label>
          <Link href="/login?forgot=1" className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="w-full" loading={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>

        <p className="text-center text-xs text-navy-400 dark:text-navy-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">Create one</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
