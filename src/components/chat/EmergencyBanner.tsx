"use client"

import { HeartPulse, Phone, X } from "lucide-react"
import { Button } from "@/components/ui/Button"

interface EmergencyBannerProps {
  emergencyPhone?: string
  onDismiss: () => void
  visible: boolean
}

export function EmergencyBanner({ emergencyPhone, onDismiss, visible }: EmergencyBannerProps) {
  if (!visible) return null

  return (
    <div className="animate-fade-in mx-4 mt-2">
      <div className="p-4 rounded-2xl bg-gradient-to-r from-red-500 to-red-600 text-white shadow-strong relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <HeartPulse className="h-full w-full" />
        </div>
        <button onClick={onDismiss} className="absolute top-2 right-2 text-white/70 hover:text-white">
          <X className="h-4 w-4" />
        </button>
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <HeartPulse className="h-5 w-5 animate-pulse" />
            <span className="text-sm font-bold">Dental Emergency Detected</span>
          </div>
          <p className="text-sm text-white/90 mb-3">
            Please contact our clinic immediately. For life-threatening emergencies, call 911.
          </p>
          <a
            href={`tel:${emergencyPhone || "+15551234567"}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-red-600 font-semibold text-sm hover:bg-white/90 transition-all active:scale-[0.98]"
          >
            <Phone className="h-4 w-4" />
            Call {emergencyPhone || "Emergency"}
          </a>
        </div>
      </div>
    </div>
  )
}
