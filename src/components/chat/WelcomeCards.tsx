"use client"

import { CalendarCheck, Clock, Phone, HeartPulse, HelpCircle } from "lucide-react"
import { Card } from "@/components/ui/Card"

interface WelcomeCardsProps {
  clinicName?: string
  phone?: string
  hours?: string
  onAction: (action: string) => void
}

const actions = [
  {
    key: "book",
    label: "Book Appointment",
    desc: "Schedule a visit with our team",
    icon: CalendarCheck,
    color: "bg-primary-50 text-primary-600",
  },
  {
    key: "hours",
    label: "Hours & Location",
    desc: "When and where to find us",
    icon: Clock,
    color: "bg-purple-50 text-purple-600",
  },
  {
    key: "services",
    label: "Our Services",
    desc: "Treatments, pricing & insurance",
    icon: HelpCircle,
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    key: "emergency",
    label: "Emergency",
    desc: "Urgent dental care",
    icon: HeartPulse,
    color: "bg-red-50 text-red-600",
  },
]

export function WelcomeCards({ clinicName, phone, hours, onAction }: WelcomeCardsProps) {
  return (
    <div className="text-center px-4 pt-6 pb-2">
      <div className="flex justify-center mb-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-blue-400 shadow-glow">
          <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
      </div>
      <h2 className="text-xl font-bold text-navy-900 mb-1">
        Welcome to {clinicName || "our clinic"}
      </h2>
      <p className="text-sm text-navy-400 mb-6 max-w-sm mx-auto">
        I&apos;m your AI front desk assistant. How can I help you today?
      </p>

      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
        {actions.map((action) => (
          <button
            key={action.key}
            onClick={() => onAction(action.key)}
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white border border-navy-100 hover:border-navy-200 hover:shadow-card-hover transition-all duration-200 active:scale-[0.98]"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${action.color}`}>
              <action.icon className="h-5 w-5" />
            </div>
            <span className="text-xs font-semibold text-navy-900">{action.label}</span>
            <span className="text-[10px] text-navy-400 leading-tight">{action.desc}</span>
          </button>
        ))}
      </div>

      {(phone || hours) && (
        <div className="mt-4 p-3 rounded-xl bg-navy-50/50 border border-navy-100 text-xs text-navy-500 space-y-1">
          {hours && (
            <div className="flex items-center justify-center gap-1.5">
              <Clock className="h-3 w-3 text-navy-400" />
              {hours}
            </div>
          )}
          {phone && (
            <div className="flex items-center justify-center gap-1.5">
              <Phone className="h-3 w-3 text-navy-400" />
              {phone}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
