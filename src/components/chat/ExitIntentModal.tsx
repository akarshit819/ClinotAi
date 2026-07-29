"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/Button"
import { X, Mail, Phone } from "lucide-react"

interface ExitIntentModalProps {
  visible: boolean
  onSubmit: (email: string, phone: string) => Promise<void>
  onDismiss: () => void
}

export function ExitIntentModal({ visible, onSubmit, onDismiss }: ExitIntentModalProps) {
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (visible) {
      setEmail("")
      setPhone("")
    }
  }, [visible])

  if (!visible) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email && !phone) return
    setSubmitting(true)
    await onSubmit(email, phone)
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-t-3xl p-6 animate-slide-in shadow-strong">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-navy-900">Before you go...</h3>
            <p className="text-xs text-navy-400 mt-0.5">Leave your info and we&apos;ll follow up!</p>
          </div>
          <button onClick={onDismiss} className="p-2 hover:bg-navy-50 rounded-lg">
            <X className="h-4 w-4 text-navy-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field pl-9"
              placeholder="Your email"
            />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-400" />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-field pl-9"
              placeholder="Your phone number"
            />
          </div>
          <Button type="submit" className="w-full" loading={submitting}>
            Keep me updated
          </Button>
          <button type="button" onClick={onDismiss} className="w-full text-xs text-navy-400 hover:text-navy-600 py-1">
            No thanks, I&apos;ll come back later
          </button>
        </form>
      </div>
    </div>
  )
}
