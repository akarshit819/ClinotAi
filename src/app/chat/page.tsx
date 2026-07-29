"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Send, Bot, Phone, ArrowDown, ChevronDown, HeartPulse } from "lucide-react"
import { Card } from "@/components/ui/Card"
import { MessageBubble } from "@/components/chat/MessageBubble"
import { TypingIndicator } from "@/components/chat/TypingIndicator"
import { QuickReplies } from "@/components/chat/QuickReplies"
import { WelcomeCards } from "@/components/chat/WelcomeCards"
import { AppointmentWizard } from "@/components/chat/AppointmentWizard"
import { EmergencyBanner } from "@/components/chat/EmergencyBanner"
import { ExitIntentModal } from "@/components/chat/ExitIntentModal"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

const SUGGESTIONS_MAP: Record<string, string[]> = {
  default: ["What are your hours?", "Book an appointment", "Do you accept insurance?", "Services & pricing"],
  hours: ["Book an appointment", "What's your address?", "Emergency contact"],
  book: ["Teeth cleaning", "Root canal", "Checkup", "Emergency visit"],
  insurance: ["Do you take Delta Dental?", "Payment plans?", "Cash discounts?"],
  emergency: ["Call clinic now", "Directions to clinic"],
}

function getSuggestions(content: string): string[] {
  const lower = content.toLowerCase()
  if (lower.includes("emergency") || lower.includes("pain") || lower.includes("bleeding")) return SUGGESTIONS_MAP.emergency
  if (lower.includes("hour") || lower.includes("open") || lower.includes("close")) return SUGGESTIONS_MAP.hours
  if (lower.includes("book") || lower.includes("appointment") || lower.includes("schedule")) return SUGGESTIONS_MAP.book
  if (lower.includes("insurance") || lower.includes("cover") || lower.includes("delta") || lower.includes("cigna") || lower.includes("aetna")) return SUGGESTIONS_MAP.insurance
  return SUGGESTIONS_MAP.default
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [showWelcome, setShowWelcome] = useState(true)
  const [showAppointment, setShowAppointment] = useState(false)
  const [showEmergencyBanner, setShowEmergencyBanner] = useState(false)
  const [showExitIntent, setShowExitIntent] = useState(false)
  const [clinicInfo, setClinicInfo] = useState({ name: "", phone: "", hours: "", emergencyPhone: "" })
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showScrollDown, setShowScrollDown] = useState(false)
  const [messageCount, setMessageCount] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setClinicInfo({
          name: data.name || "Our Dental Clinic",
          phone: data.phone || "+1 (555) 123-4567",
          hours: data.openingHours || "Mon–Fri: 8:00 AM – 6:00 PM",
          emergencyPhone: data.emergencyPhone || "+1 (555) 987-6543",
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  const handleScroll = useCallback(() => {
    const el = chatContainerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setShowScrollDown(!isNearBottom)
  }, [])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isTyping) return
    setShowWelcome(false)
    setMessageCount((c) => c + 1)

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsTyping(true)
    setSuggestions([])

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content.trim(), conversationId }),
      })
      const data = await res.json()
      setConversationId(data.conversationId)

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.reply,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setSuggestions(getSuggestions(content))

      const lower = content.toLowerCase()
      if (lower.includes("book") || lower.includes("appointment") || lower.includes("schedule")) {
        setTimeout(() => setShowAppointment(true), 500)
      }
      if (lower.includes("emergency") || lower.includes("pain") || lower.includes("bleeding") || lower.includes("broken tooth") || lower.includes("swelling") || lower.includes("knocked out")) {
        setShowEmergencyBanner(true)
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, I'm having trouble connecting. Please try again or call us directly.",
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsTyping(false)
    }
  }, [isTyping, conversationId])

  const submitAppointment = async (data: {
    patientName: string
    phone: string
    email: string
    reason: string
    preferredDate: string
    preferredTime: string
    isEmergency: boolean
  }) => {
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: `Thank you, ${data.patientName}! Your appointment request has been submitted. Our team will contact you at ${data.phone} to confirm.\n\n**Summary:**\n- Reason: ${data.reason || "General visit"}\n- Preferred: ${data.preferredDate || "Not specified"} at ${data.preferredTime || "Not specified"}`,
          timestamp: new Date(),
        },
      ])
      setShowAppointment(false)
    }
  }

  const submitLead = async (email: string, phone: string) => {
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, phone, source: "chat-exit" }),
    })
    setShowExitIntent(false)
  }

  const handleWelcomeAction = (action: string) => {
    switch (action) {
      case "book": sendMessage("I'd like to book an appointment"); break
      case "hours": sendMessage("What are your hours?"); break
      case "services": sendMessage("What services do you offer?"); break
      case "emergency": sendMessage("I have a dental emergency"); break
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-50 via-white to-primary-50/20">
      <div className="mx-auto max-w-5xl px-3 py-4 md:py-8">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-blue-400 shadow-glow">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-bold text-navy-900">{clinicInfo.name || "Dental Clinic"}</h1>
              <p className="text-xs text-navy-400">AI Front Desk Assistant</p>
            </div>
          </div>
          <a
            href={`tel:${clinicInfo.phone}`}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-50 text-primary-600 text-sm font-semibold hover:bg-primary-100 transition-colors"
          >
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">{clinicInfo.phone}</span>
          </a>
        </div>

        <Card className="flex flex-col overflow-hidden min-h-[70vh] md:min-h-[600px] relative">
          <div
            ref={chatContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto scrollbar-hide"
          >
            {showWelcome && messages.length === 0 ? (
              <WelcomeCards
                clinicName={clinicInfo.name}
                phone={clinicInfo.phone}
                hours={clinicInfo.hours}
                onAction={handleWelcomeAction}
              />
            ) : (
              <div className="p-4 md:p-6 space-y-4">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} role={msg.role} content={msg.content} timestamp={msg.timestamp} />
                ))}
                {isTyping && <TypingIndicator />}
                {suggestions.length > 0 && !isTyping && (
                  <QuickReplies suggestions={suggestions} onSelect={sendMessage} />
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

            {showAppointment && (
              <AppointmentWizard onSubmit={submitAppointment} onCancel={() => setShowAppointment(false)} />
            )}

            <EmergencyBanner
              emergencyPhone={clinicInfo.emergencyPhone}
              visible={showEmergencyBanner}
              onDismiss={() => setShowEmergencyBanner(false)}
            />
          </div>

          {showScrollDown && messages.length > 0 && (
            <button
              onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-navy-200 shadow-soft text-xs text-navy-500 hover:bg-navy-50 transition-colors"
            >
              <ArrowDown className="h-3 w-3" /> New messages
            </button>
          )}

          <div className="border-t border-navy-100 p-3 md:p-4 bg-white">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
                className="input-field flex-1 text-sm"
                placeholder="Ask about appointments, hours, insurance..."
                disabled={isTyping}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isTyping}
                className="flex h-10 w-10 md:h-11 md:w-11 items-center justify-center rounded-xl bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
              >
                <Send className="h-4 w-4 md:h-5 md:w-5" />
              </button>
            </div>
            <div className="flex gap-1.5 mt-2 overflow-x-auto scrollbar-hide">
              {[
                { label: "Hours", msg: "What are your hours?" },
                { label: "Book", msg: "I'd like to book an appointment" },
                { label: "Insurance", msg: "Do you accept insurance?" },
                { label: "Pricing", msg: "How much does a cleaning cost?" },
                { label: "Emergency", msg: "I have a dental emergency", urgent: true },
              ].map((btn) => (
                <button
                  key={btn.label}
                  onClick={() => sendMessage(btn.msg)}
                  className={`shrink-0 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                    btn.urgent
                      ? "bg-red-50 text-red-600 hover:bg-red-100"
                      : "bg-navy-50 text-navy-600 hover:bg-navy-100"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <p className="text-center text-xs text-navy-400 mt-3">
          AI assistant for general inquiries only. For medical emergencies, call 911.
        </p>
      </div>

      <ExitIntentModal
        visible={showExitIntent}
        onSubmit={submitLead}
        onDismiss={() => setShowExitIntent(false)}
      />
    </div>
  )
}
