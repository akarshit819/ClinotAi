export const CLINIC_ID = "demo-clinic"

// Integrations currently available to users.
// WhatsApp is the only active integration today; other platforms are kept
// in the codebase (connectors, routes, DB models) and can be re-enabled by
// adding their platform key back to this list.
export const ACTIVE_INTEGRATION_PLATFORMS = ["whatsapp"] as const

export const SITE = {
  name: "Clinot",
  domain: "clinot.ai",
  tagline: "AI Receptionist for Healthcare",
  email: "hello@clinot.ai",
  phone: "+1 (555) 000-0000",
} as const

export const TOAST_DURATION = 4000

export const PAGINATION = {
  defaultLimit: 50,
} as const

export const AI = {
  maxMessageLength: 1000,
  maxUserMessageLength: 2000,
  // Short-term context window: 4 recent turns. Enough for a natural
  // follow-up ("How much?" after "I want whitening.") without
  // re-sending the whole conversation. See src/messaging/ai/context.ts.
  maxHistoryMessages: 4,
  timeout: 15000,
  // Single provider: OpenRouter. Default model is the OpenRouter free
  // router; override with OPENROUTER_MODEL (see src/lib/ai/providers.ts).
  defaultModel: "openrouter/free",
  defaultTemperature: 0.7,
  defaultMaxTokens: 512,
} as const

export const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Google Gemini" },
  { value: "groq", label: "Groq" },
  { value: "openrouter", label: "OpenRouter" },
] as const

export type AIProvider = (typeof PROVIDERS)[number]["value"]

export const PROVIDER_MODELS: Record<AIProvider, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
  anthropic: ["claude-3-haiku-20240307", "claude-3-sonnet-20240229", "claude-3-opus-20240229"],
  gemini: ["gemini-1.5-flash", "gemini-1.5-pro"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
  openrouter: ["openai/gpt-4o-mini", "openai/gpt-4o", "anthropic/claude-3.5-sonnet"],
}

export const COLORS = {
  primary: "#1E7FE3",
  navy: "#1B2A4A",
} as const

export const ROUTES = {
  home: "/",
  login: "/login",
  chat: "/chat",
  dashboard: "/dashboard",
  signup: "/signup",
} as const

export const NAV_ITEMS = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "After Hours", href: "#after-hours" },
  { label: "Pricing", href: "#pricing" },
] as const

export const STAT_COLORS = [
  "primary",
  "emerald",
  "amber",
  "red",
  "purple",
  "neutral",
] as const

export type StatColor = (typeof STAT_COLORS)[number]
