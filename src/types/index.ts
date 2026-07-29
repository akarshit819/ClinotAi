export type MessageRole = "user" | "assistant" | "system"

export interface ChatMessage {
  role: MessageRole
  content: string
}

export interface ConversationWithMessages {
  id: string
  visitorId: string | null
  summary: string | null
  isEmergency: boolean
  status: string
  clinicId: string
  messages: {
    id: string
    role: string
    content: string
    createdAt: string
  }[]
  createdAt: string
  updatedAt: string
}

export interface Appointment {
  id: string
  patientName: string
  phone: string
  email: string | null
  reason: string
  preferredDate: string | null
  preferredTime: string | null
  doctor: string | null
  notes: string | null
  isEmergency: boolean
  status: string
  clinicId: string
  createdAt: string
  updatedAt: string
}

export interface Lead {
  id: string
  email: string | null
  phone: string | null
  interestedIn: string | null
  source: string | null
  status: string
  clinicId: string
  createdAt: string
  updatedAt: string
}

export interface KnowledgeEntry {
  id: string
  question: string
  answer: string
  category: string | null
  clinicId: string
  createdAt: string
  updatedAt: string
}

export interface ClinicSettings {
  id: string
  name: string
  logo: string | null
  phone: string | null
  email: string | null
  address: string | null
  emergencyPhone: string | null
  openingHours: string | null
  timezone: string
  language: string
  welcomeMessage: string | null
  afterHoursMessage: string | null
  notificationsEmail: string | null
  notificationsPhone: string | null
  primaryColor: string
  slug: string | null
}

export interface ApiConfigData {
  provider: "openai" | "anthropic" | "gemini" | "groq" | "openrouter"
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  isActive: boolean
}

export interface DashboardStats {
  totalConversations: number
  todayConversations: number
  appointmentsRequested: number
  emergencyRequests: number
  leadsCaptured: number
  popularQuestions: { question: string; count: number }[]
  peakHours: { hour: number; count: number }[]
  conversionRate: number
  hourlyData: { hour: number; conversations: number; leads: number }[]
}

export interface AnalyticsData {
  totalConversations: number
  todayConversations: number
  appointmentsRequested: number
  emergencyRequests: number
  leadsCaptured: number
  popularQuestions: { question: string; count: number }[]
  peakHours: { hour: number; count: number }[]
  conversionRate: number
  hourlyData: { hour: number; conversations: number; leads: number }[]
}

export interface WidgetConfig {
  primaryColor: string
  position: "right" | "left"
  title: string
  subtitle: string
  language: string
  showBranding: boolean
  autoOpen: boolean
  greeting: string
  afterHoursMessage: string | null
}
