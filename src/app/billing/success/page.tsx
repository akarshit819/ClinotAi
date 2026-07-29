"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/Button"

export default function BillingSuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    if (countdown <= 0) {
      router.push("/dashboard")
      return
    }
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [countdown, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-25 via-white to-gray-25 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success-50">
          <CheckCircle className="h-10 w-10 text-success-500" />
        </div>

        <h1 className="text-2xl font-bold text-navy-900 mb-2">Subscription Active</h1>
        <p className="text-sm text-navy-400 mb-8 leading-relaxed">
          Your Clinot subscription is now active. Your AI receptionist is ready to help patients 24/7.
        </p>

        <Button onClick={() => router.push("/dashboard")} size="lg" className="w-full">
          Go to Dashboard
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>

        <p className="text-xs text-navy-300 mt-4">
          Redirecting to dashboard in {countdown} seconds...
        </p>

        <div className="mt-8 p-4 rounded-xl bg-navy-25 border border-navy-75">
          <p className="text-xs text-navy-400 leading-relaxed">
            <strong className="text-navy-600">Next steps:</strong> Configure your clinic details,
            set up your knowledge base, and add the chat widget to your website.
          </p>
        </div>
      </div>
    </div>
  )
}
