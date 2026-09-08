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
  // Single provider: OpenRouter free-model failover chain (see
  // src/lib/ai/openrouter-manager.ts). Override candidates with
  // OPENROUTER_MODELS or OPENROUTER_MODEL.
  defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
  defaultTemperature: 0.7,
  defaultMaxTokens: 512,
} as const

export const PROVIDERS = [
  { value: "openrouter", label: "OpenRouter" },
] as const

export type AIProvider = (typeof PROVIDERS)[number]["value"]

export const PROVIDER_MODELS: Record<AIProvider, string[]> = {
  openrouter: [
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "qwen/qwen-2.5-72b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-70b:free",
    "google/gemma-3-27b-it:free",
  ],
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
