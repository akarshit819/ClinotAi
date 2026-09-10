"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Search,
  MessageSquare,
  Globe,
  MessageCircle,
  Camera,
  Send,
  Mail,
  Phone,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  Filter,
  Loader2,
  Bot,
  MoreVertical,
  User,
  Paperclip,
  Inbox,
  ExternalLink,
  Ban,
  Archive,
  ArrowLeft,
  Menu,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import type { Platform } from "@/messaging/types"

type ConversationStatus = "active" | "waiting_clinic" | "closed" | "archived"
type Intent = "appointment" | "emergency" | "general_question" | "lead" | "spam" | "other"

interface PatientInfo {
  id: string
  name?: string | null
  phone?: string | null
  email?: string | null
  notes?: string | null
}

interface Message {
  id: string
  role: string
  content: string
  platform: string
  direction: string
  status: string
  sourceMessageId?: string | null
  intent?: string | null
  confidence?: number | null
  createdAt: string
  readAt?: string | null
}

interface Conversation {
  id: string
  clinicId: string
  patientId?: string
  patientName?: string
  platform: Platform
  status: ConversationStatus
  intent?: Intent
  isEmergency: boolean
  isSpam: boolean
  summary?: string
  unreadCount: number
  lastMessageAt?: string
  lastMessage?: string
  lastMessageFrom?: "user" | "assistant"
  createdAt: string
  updatedAt: string
  patient?: PatientInfo | null
  messages?: Message[]
}

interface InboxData {
  conversations: Conversation[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  unreadTotal: number
}

const PLATFORM_META: Record<string, { icon: any; text: string; bg: string; label: string }> = {
  website:   { icon: Globe, text: "text-primary-600 dark:text-primary-400", bg: "bg-primary-50 dark:bg-primary-900/30", label: "Website" },
  whatsapp:  { icon: MessageCircle, text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", label: "WhatsApp" },
  instagram: { icon: Camera, text: "text-pink-600 dark:text-pink-400", bg: "bg-pink-50 dark:bg-pink-900/30", label: "Instagram" },
  facebook:  { icon: MessageSquare, text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30", label: "Messenger" },
  telegram:  { icon: Send, text: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-900/30", label: "Telegram" },
  email:     { icon: Mail, text: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/30", label: "Email" },
}

const STATUS_BADGE: Record<string, { variant: "success" | "warning" | "neutral" | "danger"; label: string }> = {
  active: { variant: "success", label: "Active" },
  waiting_clinic: { variant: "warning", label: "Needs Review" },
  closed: { variant: "neutral", label: "Closed" },
  archived: { variant: "neutral", label: "Archived" },
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return "now"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  if (diff < 604800000) return d.toLocaleDateString("en-US", { weekday: "short" })
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const meta = PLATFORM_META[platform] || PLATFORM_META.website
  const Icon = meta.icon
  return <Icon className={cn("h-3.5 w-3.5", className)} />
}

function PlatformBadge({ platform }: { platform: string }) {
  const meta = PLATFORM_META[platform] || PLATFORM_META.website
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium", meta.bg, meta.text)}>
      <PlatformIcon platform={platform} />
      {meta.label}
    </span>
  )
}

function SkeletonConversation() {
  return (
    <div className="flex items-start gap-3 p-4 animate-pulse">
      <div className="w-8 h-8 rounded-full bg-navy-50 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-3 w-24 bg-navy-50 rounded" />
          <div className="h-2.5 w-10 bg-navy-50 rounded" />
        </div>
        <div className="h-2.5 w-full bg-navy-50 rounded" />
        <div className="h-2 w-3/4 bg-navy-50 rounded" />
      </div>
    </div>
  )
}

export default function InboxPage() {
  const router = useRouter()
  const [data, setData] = useState<InboxData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [conversationDetail, setConversationDetail] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("active")
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchInbox = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set("status", statusFilter)
      if (searchQuery) params.set("search", searchQuery)
      const res = await fetch(`/api/inbox?${params}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
        if (json.conversations?.length > 0 && !selectedId) {
          setSelectedId(json.conversations[0].id)
        }
      }
    } catch (err) {
      console.error("Failed to load inbox", err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, searchQuery, selectedId])

  const fetchConversation = useCallback(async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/inbox/${id}`)
      if (res.ok) {
        const json = await res.json()
        setConversationDetail(json)
      }
    } catch (err) {
      console.error("Failed to load conversation", err)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => { fetchInbox() }, [fetchInbox])

  useEffect(() => {
    if (selectedId) fetchConversation(selectedId)
  }, [selectedId, fetchConversation])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [conversationDetail?.messages])

  const handleSelectConversation = (id: string) => {
    setSelectedId(id)
    if (window.innerWidth < 768) setSidebarOpen(false)
  }

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedId) return
    setSending(true)
    try {
      const res = await fetch(`/api/inbox/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyText }),
      })
      if (res.ok) {
        setReplyText("")
        fetchConversation(selectedId)
        fetchInbox()
      }
    } catch (err) {
      console.error("Failed to send reply", err)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendReply()
    }
  }

  const selected = data?.conversations?.find((c) => c.id === selectedId)
  const messages = conversationDetail?.messages || []
  const patientInfo = conversationDetail?.patient

  return (
    <div className="flex h-[calc(100vh-4rem)] -mx-6 -mt-6 bg-white dark:bg-navy-900">
      <div className={cn(
        "flex flex-col w-full md:w-[380px] border-r border-navy-100 dark:border-navy-800 bg-white dark:bg-navy-900 shrink-0",
        !sidebarOpen && "hidden md:hidden",
      )}>
        <div className="p-4 border-b border-navy-100 dark:border-navy-800">
          <div className="flex items-center gap-2 mb-3">
            <Inbox className="h-5 w-5 text-navy-700 dark:text-navy-200" />
            <h1 className="text-base font-bold tracking-tight text-navy-900 dark:text-navy-100">Inbox</h1>
            {data && data.unreadTotal > 0 && (
              <Badge variant="primary" size="sm">{data.unreadTotal}</Badge>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-300" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-navy-25 border border-navy-100 rounded-lg text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-300 dark:bg-navy-800 dark:border-navy-700 dark:text-navy-100 dark:placeholder:text-navy-500"
            />
          </div>
          <div className="flex gap-1 mt-3">
            {[
              { value: "active", label: "Active" },
              { value: "waiting_clinic", label: "Needs Review" },
              { value: "closed", label: "Closed" },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "px-2.5 py-1 text-2xs font-medium rounded-lg transition-colors",
                  statusFilter === f.value
                    ? "bg-primary-50 text-primary-700 border border-primary-200"
                    : "text-navy-400 hover:text-navy-600 hover:bg-navy-25 border border-transparent",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="divide-y divide-navy-50 dark:divide-navy-800">
              {[1, 2, 3, 4, 5].map((i) => <SkeletonConversation key={i} />)}
            </div>
          ) : data?.conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <MessageSquare className="h-10 w-10 text-navy-200 dark:text-navy-700 mb-3" />
              <p className="text-sm font-semibold text-navy-500 dark:text-navy-300 mb-1">No conversations yet</p>
              <p className="text-xs text-navy-400 dark:text-navy-500">Patient inquiries from all platforms will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-navy-50 dark:divide-navy-800">
              {data?.conversations.map((conv) => {
                const isSelected = conv.id === selectedId
                const meta = PLATFORM_META[conv.platform] || PLATFORM_META.website
                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={cn(
                      "w-full text-left p-4 transition-colors hover:bg-navy-25 dark:hover:bg-navy-800",
                      isSelected && "bg-primary-25 hover:bg-primary-25 dark:bg-primary-900/20 dark:hover:bg-primary-900/20",
                      conv.isEmergency && "bg-danger-50 hover:bg-danger-50 dark:bg-danger-900/20",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full shrink-0",
                        conv.isEmergency ? "bg-danger-100 dark:bg-danger-900/40" : meta.bg,
                      )}>
                        {conv.isEmergency ? (
                          <AlertTriangle className="h-4 w-4 text-danger-600 dark:text-danger-400" />
                        ) : (
                          <meta.icon className={cn("h-4 w-4", meta.text)} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={cn(
                            "text-xs font-semibold truncate",
                            conv.unreadCount > 0 ? "text-navy-900" : "text-navy-600",
                          )}>
                            {conv.patientName || "Anonymous Patient"}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {conv.unreadCount > 0 && (
                              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary-500 text-2xs font-bold text-white px-1">
                                {conv.unreadCount}
                              </span>
                            )}
                            {conv.lastMessageAt && (
                              <span className="text-2xs text-navy-300">{formatTime(conv.lastMessageAt)}</span>
                            )}
                          </div>
                        </div>
                        <p className="text-2xs text-navy-400 mb-1 line-clamp-1">
                          {conv.lastMessage || conv.summary || "No messages"}
                        </p>
                        <div className="flex items-center gap-2">
                          <PlatformBadge platform={conv.platform} />
                          {conv.isEmergency && (
                            <span className="text-2xs font-semibold text-danger-600">Emergency</span>
                          )}
                          {conv.intent === "appointment" && (
                            <span className="text-2xs font-medium text-primary-600">Appointment</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className={cn(
        "flex-1 flex flex-col min-w-0 bg-white dark:bg-navy-900",
        !sidebarOpen ? "block" : "hidden md:flex",
      )}>
        {!sidebarOpen && (
          <div className="p-3 border-b border-navy-100 dark:border-navy-800 flex items-center gap-2">
            <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-navy-25 text-navy-400">
              <Menu className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold text-navy-700">Inbox</span>
          </div>
        )}

        {!selected || !selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-25 mb-4">
              <MessageSquare className="h-8 w-8 text-navy-300" />
            </div>
            <h3 className="text-sm font-semibold text-navy-700 mb-1">Select a conversation</h3>
            <p className="text-xs text-navy-400 max-w-xs">Choose a conversation from the left to view messages and reply.</p>
          </div>
        ) : detailLoading && messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-navy-300 animate-spin" />
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-navy-100 dark:border-navy-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full",
                  selected.isEmergency ? "bg-danger-100 dark:bg-danger-900/40" : "bg-navy-25 dark:bg-navy-800",
                )}>
                  {selected.isEmergency ? (
                    <AlertTriangle className="h-4.5 w-4.5 text-danger-600" />
                  ) : (
                    <User className="h-4.5 w-4.5 text-navy-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-navy-900">
                      {selected.patientName || patientInfo?.name || "Anonymous Patient"}
                    </h2>
                    {selected.isEmergency && (
                      <Badge variant="danger" size="sm">Emergency</Badge>
                    )}
                    <Badge variant={STATUS_BADGE[selected.status]?.variant || "neutral"} size="sm">
                      {STATUS_BADGE[selected.status]?.label || selected.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <PlatformBadge platform={selected.platform} />
                    {selected.intent && (
                      <span className="text-2xs text-navy-400 capitalize">{selected.intent.replace("_", " ")}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {(patientInfo?.phone || selected.patientName) && (
                  <a href={`tel:${patientInfo?.phone || ""}`} className="p-2 rounded-lg hover:bg-navy-25 text-navy-400">
                    <Phone className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Bot className="h-10 w-10 text-navy-200 mb-2" />
                  <p className="text-xs text-navy-400">AI is processing this conversation.</p>
                </div>
              )}
              {messages.map((msg) => {
                const isUser = msg.role === "user"
                const isAi = msg.role === "assistant" && msg.direction === "outgoing"
                return (
                  <div key={msg.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2.5 shadow-xs",
                        isUser
                          ? "bg-primary-500 text-white rounded-br-md"
                          : isAi
                            ? "bg-navy-25 text-navy-700 rounded-bl-md dark:bg-navy-800 dark:text-navy-200"
                            : "bg-navy-50 text-navy-600 rounded-bl-md dark:bg-navy-750 dark:text-navy-300",
                      )}>
                      {!isUser && (
                        <div className="flex items-center gap-1.5 mb-1">
                          {isAi ? (
                            <Bot className="h-3 w-3 text-navy-400" />
                          ) : (
                            <User className="h-3 w-3 text-navy-400" />
                          )}
                          <span className="text-2xs font-medium text-navy-400">
                            {isAi ? "Clinot AI" : "Clinic Staff"}
                          </span>
                        </div>
                      )}
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      <div className={cn(
                        "flex items-center gap-1 mt-1",
                        isUser ? "justify-end" : "justify-start",
                      )}>
                        <span className={cn("text-2xs", isUser ? "text-primary-200" : "text-navy-300")}>
                          {formatTime(msg.createdAt)}
                        </span>
                        {msg.status === "ai_responded" && (
                          <CheckCircle className="h-3 w-3 text-success-400" />
                        )}
                        {msg.status === "waiting_clinic" && (
                          <Clock className="h-3 w-3 text-warning-400" />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-navy-100 dark:border-navy-800">
              <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your reply... (Enter to send, Shift+Enter for new line)"
                    rows={2}
                    aria-label="Reply to patient"
                    className="w-full px-3 py-2.5 text-xs bg-navy-25 border border-navy-100 rounded-xl text-navy-700 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-300 resize-none dark:bg-navy-800 dark:border-navy-700 dark:text-navy-100 dark:placeholder:text-navy-500"
                  />
                </div>
                <Button
                  onClick={handleSendReply}
                  loading={sending}
                  disabled={!replyText.trim()}
                  size="sm"
                  className="mb-0.5"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-2xs text-navy-300 mt-1.5">Replying will close this conversation and notify the patient.</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
