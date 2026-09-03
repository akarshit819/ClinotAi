export type Platform =
  | "website"
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "telegram"
  | "email"
  | "google_business"
  | "apple_messages"
  | "sms"
  | "voice_ai"
  | "teams"
  | "slack"

export const ALL_PLATFORMS: Platform[] = [
  "website", "whatsapp", "instagram", "facebook", "telegram", "email",
  "google_business", "apple_messages", "sms", "voice_ai", "teams", "slack",
]

export const CONNECTABLE_PLATFORMS: Platform[] = [
  "whatsapp", "instagram", "facebook", "telegram", "email",
]

export type MessageStatus = "received" | "processing" | "ai_responded" | "waiting_clinic" | "closed" | "archived"

export type ConversationStatus = "active" | "waiting_clinic" | "closed" | "archived"

export type Intent = "appointment" | "emergency" | "general_question" | "lead" | "spam" | "other"

export type MessageDirection = "incoming" | "outgoing"

export interface Attachment {
  type: "image" | "file" | "audio" | "video"
  url: string
  name: string
  size?: number
  mimeType?: string
}

export interface PlatformUser {
  id: string
  name?: string
  phone?: string
  email?: string
  avatar?: string
}

export interface IncomingMessage {
  platform: Platform
  channelId: string
  sourceMessageId: string
  from: PlatformUser
  content: string
  timestamp: Date
  attachments?: Attachment[]
  metadata?: Record<string, any>
}

export interface ProcessedMessage {
  id: string
  clinicId: string
  conversationId: string
  patientId?: string
  platform: Platform
  direction: MessageDirection
  role: "user" | "assistant" | "system"
  content: string
  intent?: Intent
  confidence?: number
  status: MessageStatus
  attachments?: Attachment[]
  sourceMessageId?: string
  metadata?: Record<string, any>
  createdAt: Date
  readAt?: Date
}

export interface ConversationSummary {
  id: string
  clinicId: string
  patientId?: string
  patientName?: string
  platform: Platform
  channelId?: string
  status: ConversationStatus
  intent?: Intent
  isEmergency: boolean
  isSpam: boolean
  summary?: string
  unreadCount: number
  lastMessageAt?: Date
  lastMessage?: string
  lastMessageFrom?: "user" | "assistant"
  /**
   * Raw Conversation.metadata blob. Used by the appointment state
   * machine to persist the in-progress booking across worker restarts
   * and across separate processing jobs. Format: JSON-stringified
   * record with at least an `appointmentDraft` field. See
   * `src/messaging/ai/appointment-state.ts` for the parser.
   */
  metadata?: string
  createdAt: Date
  updatedAt: Date
}

export interface PipelineContext {
  message: IncomingMessage
  clinicId: string
  clinic: {
    id: string
    name: string
    phone?: string
    timezone: string
    openingHours?: string
    emergencyPhone?: string
    primaryColor?: string
  }
  conversation: ConversationSummary
  patientId?: string
  knowledge: string[]
  faqs: { question: string; answer: string }[]
  aiResponse?: string
  intent?: Intent
  confidence?: number
  isEmergency: boolean
  requiresClinic: boolean
}

export interface PlatformConfig {
  platform: Platform
  name: string
  icon: string
  description: string
  color: string
  connectUrl?: string
  docsUrl?: string
}

export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  website:           { platform: "website",           name: "Website Chat",       icon: "Globe",       color: "#2463EB", description: "Embedded chat widget on your clinic website", connectUrl: "/dashboard/website-integration" },
  whatsapp:          { platform: "whatsapp",          name: "WhatsApp",           icon: "MessageCircle", color: "#25D366", description: "WhatsApp Business API integration", docsUrl: "https://developers.facebook.com/docs/whatsapp" },
  instagram:         { platform: "instagram",         name: "Instagram",          icon: "Camera",      color: "#E4405F", description: "Instagram Direct Messages", docsUrl: "https://developers.facebook.com/docs/instagram-api" },
  facebook:          { platform: "facebook",           name: "Facebook Messenger", icon: "MessageSquare", color: "#1877F2", description: "Facebook Page Messenger", docsUrl: "https://developers.facebook.com/docs/messenger-platform" },
  telegram:          { platform: "telegram",           name: "Telegram Bot",       icon: "Send",        color: "#26A5E4", description: "Telegram Bot API", docsUrl: "https://core.telegram.org/bots/api" },
  email:             { platform: "email",              name: "Email",              icon: "Mail",        color: "#EA4335", description: "Email forwarding and reply handling" },
  google_business:   { platform: "google_business",   name: "Google Business",    icon: "Building2",   color: "#4285F4", description: "Google Business Messages", docsUrl: "https://developers.google.com/business-communications/business-messages" },
  apple_messages:    { platform: "apple_messages",     name: "Apple Messages",     icon: "Smartphone",  color: "#000000", description: "Apple Business Chat", docsUrl: "https://developer.apple.com/business-chat/" },
  sms:               { platform: "sms",                name: "SMS",                icon: "Phone",       color: "#6B7280", description: "Twilio SMS integration" },
  voice_ai:          { platform: "voice_ai",           name: "Voice AI",           icon: "PhoneCall",   color: "#8B5CF6", description: "AI-powered voice receptionist" },
  teams:             { platform: "teams",              name: "Microsoft Teams",    icon: "Users",       color: "#6264A7", description: "Microsoft Teams messaging" },
  slack:             { platform: "slack",               name: "Slack",              icon: "MessageCircle", color: "#4A154B", description: "Slack integration" },
}
