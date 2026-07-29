import { AI } from "@/config/constants"
import type { ChatMessage } from "@/types"

interface AIProviderConfig {
  provider: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

async function providerFetch(url: string, options: RequestInit): Promise<Response> {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(AI.timeout),
  })
}

export async function callOpenAI(config: AIProviderConfig, messages: ChatMessage[]): Promise<string> {
  const res = await providerFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model || AI.defaultModel,
      messages,
      temperature: config.temperature ?? AI.defaultTemperature,
      max_tokens: config.maxTokens ?? AI.defaultMaxTokens,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    if (res.status === 401) throw new Error("Invalid API key")
    if (res.status === 429) throw new Error("Rate limit exceeded")
    throw new Error("OpenAI error: " + err)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ""
}

export async function callAnthropic(config: AIProviderConfig, messages: ChatMessage[]): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system")?.content || ""
  const chatMessages = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }))
  const res = await providerFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model || "claude-3-haiku-20240307",
      system: systemMsg,
      messages: chatMessages,
      max_tokens: config.maxTokens ?? AI.defaultMaxTokens,
      temperature: config.temperature ?? AI.defaultTemperature,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    if (res.status === 401) throw new Error("Invalid API key")
    if (res.status === 429) throw new Error("Rate limit exceeded")
    throw new Error("Anthropic error: " + err)
  }
  const data = await res.json()
  return data.content?.[0]?.text || ""
}

export async function callGemini(config: AIProviderConfig, messages: ChatMessage[]): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system")?.content || ""
  const chatMessages = messages.filter((m) => m.role !== "system")
  const contents = chatMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }))
  const res = await providerFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model || "gemini-1.5-flash"}:generateContent?key=${config.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: systemMsg ? { parts: [{ text: systemMsg }] } : undefined,
        generationConfig: {
          temperature: config.temperature ?? AI.defaultTemperature,
          maxOutputTokens: config.maxTokens ?? AI.defaultMaxTokens,
        },
      }),
    },
  )
  if (!res.ok) {
    const err = await res.text()
    if (res.status === 400 && err.includes("API_KEY_INVALID")) throw new Error("Invalid API key")
    if (res.status === 429) throw new Error("Rate limit exceeded")
    throw new Error("Gemini error: " + err)
  }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ""
}

export async function callGroq(config: AIProviderConfig, messages: ChatMessage[]): Promise<string> {
  const res = await providerFetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model || "llama-3.3-70b-versatile",
      messages,
      temperature: config.temperature ?? AI.defaultTemperature,
      max_tokens: config.maxTokens ?? AI.defaultMaxTokens,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    if (res.status === 401) throw new Error("Invalid API key")
    if (res.status === 429) throw new Error("Rate limit exceeded")
    throw new Error("Groq error: " + err)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ""
}

export async function callOpenRouter(config: AIProviderConfig, messages: ChatMessage[]): Promise<string> {
  const res = await providerFetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://clinot.ai",
    },
    body: JSON.stringify({
      model: config.model || "openai/gpt-4o-mini",
      messages,
      temperature: config.temperature ?? AI.defaultTemperature,
      max_tokens: config.maxTokens ?? AI.defaultMaxTokens,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    if (res.status === 401) throw new Error("Invalid API key")
    if (res.status === 429) throw new Error("Rate limit exceeded")
    throw new Error("OpenRouter error: " + err)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ""
}
