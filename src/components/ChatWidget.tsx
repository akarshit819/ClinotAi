"use client"

import { useState, useRef, useEffect } from "react"
import { Bot, Send, X, MessageSquare, Phone, CalendarCheck, HeartPulse, ChevronDown } from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [clinicName, setClinicName] = useState("")
  const [clinicPhone, setClinicPhone] = useState("")
  const [showAppointment, setShowAppointment] = useState(false)
  const [showEmergency, setShowEmergency] = useState(false)
  const [showLead, setShowLead] = useState(false)
  const [unread, setUnread] = useState(0)
  const [hasInteracted, setHasInteracted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [apptForm, setApptForm] = useState({ name: "", phone: "", email: "", reason: "", date: "", time: "" })
  const [leadForm, setLeadForm] = useState({ email: "", phone: "" })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => { setClinicName(d.name || "Dental Clinic"); setClinicPhone(d.phone || "") })
      .catch(() => {})
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping, showAppointment, showEmergency])

  const sendMessage = async (content: string) => {
    if (!content.trim() || isTyping) return
    setHasInteracted(true)
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: content.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsTyping(true)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content.trim(), conversationId }),
      })
      const data = await res.json()
      setConversationId(data.conversationId)
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: data.reply }])

      const lower = content.toLowerCase()
      if (lower.includes("book") || lower.includes("appointment") || lower.includes("schedule")) {
        setTimeout(() => setShowAppointment(true), 300)
      }
      if (lower.includes("emergency") || lower.includes("pain") || lower.includes("bleeding") || lower.includes("broken tooth") || lower.includes("swelling")) {
        setShowEmergency(true)
      }
    } catch {
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: "Sorry, please try again." }])
    } finally {
      setIsTyping(false)
    }
  }

  const submitAppointment = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientName: apptForm.name,
        phone: apptForm.phone,
        email: apptForm.email,
        reason: apptForm.reason,
        preferredDate: apptForm.date,
        preferredTime: apptForm.time,
      }),
    })
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "assistant", content: `Thanks ${apptForm.name}! We'll confirm your appointment shortly.` }])
    setShowAppointment(false)
    setApptForm({ name: "", phone: "", email: "", reason: "", date: "", time: "" })
    setSubmitting(false)
  }

  const submitLead = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(leadForm),
    })
    setShowLead(false)
  }

  const toggleOpen = () => {
    setIsOpen(!isOpen)
    if (!isOpen) setUnread(0)
  }

  const showLeadCapture = () => {
    if (hasInteracted && messages.length >= 2 && !showLead) {
      setShowLead(true)
    }
  }

  return (
    <>
      {!isOpen ? (
        <button
          onClick={toggleOpen}
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-blue-400 text-white shadow-strong hover:shadow-glow hover:scale-105 active:scale-95 transition-all duration-200"
        >
          <MessageSquare className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </button>
      ) : (
        <div className="fixed bottom-5 right-5 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white border border-navy-100 shadow-strong overflow-hidden animate-fade-up flex flex-col" style={{ maxHeight: "min(600px, calc(100vh - 40px))" }}>
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary-500 to-blue-400 shrink-0">
            <div className="flex items-center gap-2.5">
              <Bot className="h-5 w-5 text-white" />
              <div>
                <span className="text-sm font-semibold text-white">{clinicName || "Dental Clinic"}</span>
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  <span className="text-[10px] text-white/70">Online</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setIsOpen(false); showLeadCapture() }} className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10">
                <ChevronDown className="h-4 w-4" />
              </button>
              <button onClick={toggleOpen} className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && !showAppointment && !showEmergency && (
              <div className="text-center py-6">
                <div className="flex justify-center mb-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
                    <Bot className="h-6 w-6 text-primary-500" />
                  </div>
                </div>
                <p className="text-sm font-semibold text-navy-900 mb-1">Hi! How can we help?</p>
                <p className="text-xs text-navy-400 mb-4">Ask about appointments, hours, or services</p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {["Hours", "Book", "Insurance", "Emergency"].map((label) => (
                    <button key={label} onClick={() => sendMessage(label === "Emergency" ? "I have a dental emergency" : `Tell me about ${label.toLowerCase()}`)}
                      className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                        label === "Emergency" ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-navy-50 text-navy-600 hover:bg-navy-100"
                      } transition-colors`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] p-2.5 rounded-2xl text-xs leading-relaxed ${
                  msg.role === "user" ? "bg-primary-500 text-white rounded-br-md" : "bg-navy-50 text-navy-700 rounded-bl-md"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-navy-50 p-2.5 rounded-2xl rounded-bl-md flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}

            {showEmergency && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <div className="flex items-center gap-1.5 mb-1">
                  <HeartPulse className="h-4 w-4 text-red-500 animate-pulse" />
                  <span className="text-xs font-bold text-red-700">Urgent</span>
                </div>
                <p className="text-xs text-red-600 mb-2">Please call our clinic immediately.</p>
                <a href={`tel:${clinicPhone}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600">
                  <Phone className="h-3 w-3" /> Call Now
                </a>
              </div>
            )}

            {showAppointment && (
              <form onSubmit={submitAppointment} className="p-3 rounded-xl bg-primary-50 border border-primary-100 space-y-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <CalendarCheck className="h-4 w-4 text-primary-500" />
                  <span className="text-xs font-semibold text-navy-900">Book Appointment</span>
                </div>
                <input className="w-full px-2.5 py-1.5 rounded-lg border border-primary-200 text-xs" placeholder="Full Name *" value={apptForm.name} onChange={(e) => setApptForm({ ...apptForm, name: e.target.value })} required />
                <input className="w-full px-2.5 py-1.5 rounded-lg border border-primary-200 text-xs" placeholder="Phone *" value={apptForm.phone} onChange={(e) => setApptForm({ ...apptForm, phone: e.target.value })} required />
                <input className="w-full px-2.5 py-1.5 rounded-lg border border-primary-200 text-xs" placeholder="Email" value={apptForm.email} onChange={(e) => setApptForm({ ...apptForm, email: e.target.value })} />
                <input className="w-full px-2.5 py-1.5 rounded-lg border border-primary-200 text-xs" placeholder="Reason" value={apptForm.reason} onChange={(e) => setApptForm({ ...apptForm, reason: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <input className="px-2.5 py-1.5 rounded-lg border border-primary-200 text-xs" type="date" value={apptForm.date} onChange={(e) => setApptForm({ ...apptForm, date: e.target.value })} />
                  <input className="px-2.5 py-1.5 rounded-lg border border-primary-200 text-xs" type="time" value={apptForm.time} onChange={(e) => setApptForm({ ...apptForm, time: e.target.value })} />
                </div>
                <button type="submit" disabled={submitting} className="w-full py-1.5 rounded-lg bg-primary-500 text-white text-xs font-semibold hover:bg-primary-600 disabled:opacity-50">
                  {submitting ? "Sending..." : "Submit"}
                </button>
              </form>
            )}

            {showLead && (
              <form onSubmit={submitLead} className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                <p className="text-xs font-semibold text-navy-900">Stay in touch!</p>
                <input className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs" placeholder="Email" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} />
                <input className="w-full px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs" placeholder="Phone" value={leadForm.phone} onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })} />
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600">Submit</button>
                  <button type="button" onClick={() => setShowLead(false)} className="py-1.5 text-xs text-navy-400 hover:text-navy-600">Skip</button>
                </div>
              </form>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-navy-100 p-3 shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
                className="flex-1 px-3 py-2 rounded-xl border border-navy-200 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                placeholder="Type a message..."
                disabled={isTyping}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isTyping}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 transition-all"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex gap-1 mt-1.5 overflow-x-auto scrollbar-hide">
              {[
                { label: "Hours", msg: "What are your hours?" },
                { label: "Book", msg: "Book appointment" },
                { label: "Emergency", msg: "Emergency help", urgent: true },
              ].map((b) => (
                <button key={b.label} onClick={() => sendMessage(b.msg)}
                  className={`shrink-0 text-[10px] px-2 py-1 rounded-lg font-medium ${
                    b.urgent ? "bg-red-50 text-red-600" : "bg-navy-50 text-navy-500"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
