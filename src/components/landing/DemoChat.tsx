"use client"

import { useState, useRef, useEffect } from "react"
import { Bot, Send, Loader2, Sparkles, MessageSquare, AlertTriangle, Globe, LayoutDashboard, Phone, Calendar, Shield } from "lucide-react"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

const suggestions = [
  "What are your hours?",
  "Book an appointment",
  "Do you accept insurance?",
  "How much is a cleaning?",
  "I need help now — it's urgent",
]

const demoFeatures = [
  { icon: MessageSquare, label: "AI Receptionist", desc: "Answers patient questions 24/7" },
  { icon: Calendar, label: "Appointment Requests", desc: "Captures and sends to your team" },
  { icon: AlertTriangle, label: "Emergency Detection", desc: "Identifies urgent situations instantly" },
  { icon: Globe, label: "Multi-Language", desc: "Supports English, Spanish & more" },
  { icon: LayoutDashboard, label: "Dashboard Preview", desc: "See every patient inquiry in one place" },
]

export function DemoChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! I'm Clinot AI. Ask me anything about our demo clinic — hours, services, insurance, or book an appointment.",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [showDashboard, setShowDashboard] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  const sendMessage = async (content: string) => {
    if (!content.trim() || isTyping) return

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: content.trim(), timestamp: new Date() }
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
      const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: data.reply, timestamp: new Date() }
      setMessages((prev) => [...prev, assistantMsg])
    } catch {
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: "I'm having a quick break. Please try again!", timestamp: new Date() }])
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <section id="demo-chat" className="py-20 md:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <Badge variant="primary" className="mb-4 gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            See It In Action
          </Badge>
          <h2 className="section-title mb-4">Experience Clinot Yourself. No Account Needed.</h2>
          <p className="section-subtitle">
            Ask about hours, pricing, or book an appointment. See how natural it feels — then explore what happens behind the scenes.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-6 max-w-5xl mx-auto">
          <div className="lg:col-span-3">
            <Card className="overflow-hidden border-2 border-navy-100 shadow-strong">
              <div className="bg-gradient-to-r from-primary-500 to-blue-400 px-5 py-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Clinot Demo Clinic</div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
                    <span className="text-[11px] text-white/80">Online — Ask me anything</span>
                  </div>
                </div>
                <Badge variant="neutral" className="ml-auto bg-white/20 text-white border-0 text-[10px]">
                  Demo
                </Badge>
              </div>

              <div className="h-[320px] overflow-y-auto p-4 space-y-3 bg-navy-50/20">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary-500 text-white rounded-br-md"
                        : "bg-white text-navy-700 rounded-bl-md shadow-card border border-navy-100"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white rounded-2xl rounded-bl-md shadow-card border border-navy-100 px-4 py-3 flex gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-2 w-2 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 bg-white border-t border-navy-100">
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-navy-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    placeholder="Ask a question..."
                    disabled={isTyping}
                  />
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || isTyping}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 transition-all active:scale-95"
                  >
                    {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((text) => (
                    <button
                      key={text}
                      onClick={() => sendMessage(text)}
                      className="text-xs px-3 py-1.5 rounded-full bg-navy-50 text-navy-600 hover:bg-navy-100 border border-navy-100 transition-colors"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-3">
            <p className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-3">What You Can Test</p>
            {demoFeatures.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.label} className="flex items-start gap-3 p-3 rounded-xl bg-navy-25/50 border border-navy-75">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-navy-900">{f.label}</p>
                    <p className="text-xs text-navy-400">{f.desc}</p>
                  </div>
                </div>
              )
            })}

            <div className="pt-3">
              <button
                onClick={() => setShowDashboard(!showDashboard)}
                className="w-full text-left p-3 rounded-xl bg-primary-50/50 border border-primary-100 hover:bg-primary-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4 text-primary-600" />
                    <span className="text-sm font-semibold text-primary-700">Preview Dashboard</span>
                  </div>
                  <span className="text-xs text-primary-500">{showDashboard ? "Hide" : "Show"}</span>
                </div>
              </button>

              {showDashboard && (
                <div className="mt-3 p-4 rounded-xl bg-white border border-navy-100 shadow-sm animate-slide-up">
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-navy-25">
                      <p className="text-[10px] text-navy-400 font-medium uppercase tracking-wider">Conversations</p>
                      <p className="text-lg font-bold text-navy-900 mt-1">247</p>
                      <p className="text-[10px] text-emerald-600">+12% this month</p>
                    </div>
                    <div className="p-3 rounded-lg bg-navy-25">
                      <p className="text-[10px] text-navy-400 font-medium uppercase tracking-wider">Appointments</p>
                      <p className="text-lg font-bold text-navy-900 mt-1">38</p>
                      <p className="text-[10px] text-emerald-600">+8% this month</p>
                    </div>
                    <div className="p-3 rounded-lg bg-navy-25">
                      <p className="text-[10px] text-navy-400 font-medium uppercase tracking-wider">Leads Captured</p>
                      <p className="text-lg font-bold text-navy-900 mt-1">52</p>
                      <p className="text-[10px] text-emerald-600">From website visitors</p>
                    </div>
                    <div className="p-3 rounded-lg bg-navy-25">
                      <p className="text-[10px] text-navy-400 font-medium uppercase tracking-wider">Response Rate</p>
                      <p className="text-lg font-bold text-navy-900 mt-1">99.7%</p>
                      <p className="text-[10px] text-emerald-600">Avg. 3s response</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-amber-800">Emergency Alert</p>
                      <p className="text-[10px] text-amber-600">Patient reported severe pain — team notified</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-navy-400 text-center mt-3">This is a demo preview. Real dashboard shows live data.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
