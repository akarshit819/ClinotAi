"use client"

import { useState } from "react"
import { Button } from "@/components/ui/Button"
import { CalendarCheck, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react"

interface AppointmentData {
  patientName: string
  phone: string
  email: string
  reason: string
  preferredDate: string
  preferredTime: string
  isEmergency: boolean
}

interface AppointmentWizardProps {
  onSubmit: (data: AppointmentData) => Promise<void>
  onCancel: () => void
}

export function AppointmentWizard({ onSubmit, onCancel }: AppointmentWizardProps) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [data, setData] = useState<AppointmentData>({
    patientName: "",
    phone: "",
    email: "",
    reason: "",
    preferredDate: "",
    preferredTime: "",
    isEmergency: false,
  })

  const update = (fields: Partial<AppointmentData>) => setData((prev) => ({ ...prev, ...fields }))

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await onSubmit(data)
      setDone(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="p-4 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
        <p className="text-sm font-semibold text-navy-900">Request Submitted!</p>
        <p className="text-xs text-navy-400 mt-1">Our team will contact you shortly to confirm.</p>
      </div>
    )
  }

  return (
    <div className="p-4 border-t border-navy-100 bg-primary-50/30">
      <div className="flex items-center gap-2 mb-3">
        {step > 1 && (
          <button onClick={() => setStep(step - 1)} className="p-1 hover:bg-navy-100 rounded-lg">
            <ArrowLeft className="h-4 w-4 text-navy-500" />
          </button>
        )}
        <CalendarCheck className="h-4 w-4 text-primary-500" />
        <span className="text-sm font-semibold text-navy-900">Book Appointment</span>
        <span className="text-xs text-navy-400 ml-auto">Step {step}/3</span>
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-xs text-navy-500">Tell us about yourself</p>
          <input className="input-field text-sm" placeholder="Full Name *" value={data.patientName} onChange={(e) => update({ patientName: e.target.value })} required />
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field text-sm" placeholder="Phone *" value={data.phone} onChange={(e) => update({ phone: e.target.value })} required />
            <input className="input-field text-sm" placeholder="Email" type="email" value={data.email} onChange={(e) => update({ email: e.target.value })} />
          </div>
          <Button size="sm" className="w-full" onClick={() => setStep(2)} disabled={!data.patientName || !data.phone}>
            Continue
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-xs text-navy-500">What brings you in?</p>
          <input className="input-field text-sm" placeholder="Reason for visit (e.g., cleaning, checkup, pain)" value={data.reason} onChange={(e) => update({ reason: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-navy-600">
            <input type="checkbox" checked={data.isEmergency} onChange={(e) => update({ isEmergency: e.target.checked })} className="rounded border-navy-300" />
            This is an emergency
          </label>
          <Button size="sm" className="w-full" onClick={() => setStep(3)}>
            Continue
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-xs text-navy-500">Preferred date & time</p>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field text-sm" type="date" value={data.preferredDate} onChange={(e) => update({ preferredDate: e.target.value })} />
            <input className="input-field text-sm" type="time" value={data.preferredTime} onChange={(e) => update({ preferredTime: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleSubmit} loading={submitting}>
              {submitting ? "Submitting..." : "Confirm Booking"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
