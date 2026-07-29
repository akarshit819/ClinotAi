const CLINOT_PROVIDERS = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: "https://api.openai.com/v1",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseUrl: "https://api.anthropic.com",
  },
  gemini: {
    apiKey: process.env.GOOGLE_AI_API_KEY,
    baseUrl: "https://generativelanguage.googleapis.com",
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    baseUrl: "https://api.groq.com/openai/v1",
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: "https://openrouter.ai/api/v1",
  },
} as const

export function getClinotApiKey(provider: string): string | null {
  const config = CLINOT_PROVIDERS[provider as keyof typeof CLINOT_PROVIDERS]
  return config?.apiKey || null
}

export function isClinotAiAvailable(): boolean {
  return !!CLINOT_PROVIDERS.openai.apiKey
}

export function hasClinotProvider(provider: string): boolean {
  return provider in CLINOT_PROVIDERS && !!CLINOT_PROVIDERS[provider as keyof typeof CLINOT_PROVIDERS].apiKey
}
