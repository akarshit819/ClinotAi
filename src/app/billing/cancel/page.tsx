"use client"

import { useRouter } from "next/navigation"
import { XCircle, ArrowLeft, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/Button"

export default function BillingCancelPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-25 via-white to-gray-25 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-warning-50">
          <XCircle className="h-10 w-10 text-warning-500" />
        </div>

        <h1 className="text-2xl font-bold text-navy-900 mb-2">Checkout Cancelled</h1>
        <p className="text-sm text-navy-400 mb-8 leading-relaxed">
          Your checkout was cancelled. No payment has been processed. You can try again whenever you are ready.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="secondary"
            onClick={() => router.push("/dashboard/billing")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Billing
          </Button>
          <Button
            onClick={() => router.push("/")}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>

        <p className="text-xs text-navy-300 mt-6">
          Questions? Contact our team at support@clinot.ai
        </p>
      </div>
    </div>
  )
}
