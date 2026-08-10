import { prisma } from "@/lib/db"
import { decrypt } from "@/lib/encryption"
import { logger } from "@/lib/logger"
import { AI } from "@/config/constants"
import { buildSystemPrompt } from "./prompt"
import { callOpenAI, callAnthropic, callGemini, callGroq, callOpenRouter, callBuildPicoApps } from "./providers"
import { generateFallbackResponse } from "./fallback"
import { searchKnowledge, formatRAGContext, hasHighConfidenceMatch, type KnowledgeEntry } from "./rag"
import {
  validateInput,
  buildEmergencyResponse,
  buildMedicalQueryResponse,
} from "./guardrails"
import { getClinotApiKey } from "./clinot-provider"
import { trackAiUsage, estimateTokens } from "./usage"
import type { ChatMessage } from "@/types"

export { generateFallbackResponse }

function isEncrypted(key: string): boolean {
  return key.includes(":") && key.split(":").length === 3
}

function buildConversationContext(
  userMessage: string,
  conversationHistory: ChatMessage[],
): ChatMessage[] {
  const history = conversationHistory.slice(-AI.maxHistoryMessages)

  const grouped: ChatMessage[] = []
  for (const msg of history) {
    const last = grouped[grouped.length - 1]
    if (last && last.role === msg.role) {
      last.content += "\n" + msg.content
    } else {
      grouped.push({ ...msg })
    }
  }

  const userMsg: ChatMessage = { role: "user", content: userMessage.slice(0, AI.maxUserMessageLength) }
  return [...grouped, userMsg]
}

interface ProviderConfig {
  provider: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

async function getProviderConfig(clinicId: string): Promise<{ config: ProviderConfig | null; source: "clinot" | "byo" | null }> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { useClinotAi: true, aiProvider: true },
  })

  if (!clinic) return { config: null, source: null }

  if (clinic.useClinotAi) {
    const provider = clinic.aiProvider === "clinot" ? "openai" : clinic.aiProvider
    const apiKey = getClinotApiKey(provider)
    if (!apiKey) {
      logger.warn(`Clinot AI provider ${provider} has no API key configured`, { clinicId })
      return { config: null, source: "clinot" }
    }
    return {
      config: {
        provider,
        apiKey,
        model: AI.defaultModel,
        temperature: AI.defaultTemperature,
        maxTokens: AI.defaultMaxTokens,
      },
      source: "clinot",
    }
  }

  const apiConfig = await prisma.apiConfig.findUnique({
    where: { clinicId_provider: { clinicId, provider: clinic.aiProvider } },
  })

  if (!apiConfig?.apiKey) return { config: null, source: "byo" }

  let apiKey: string
  if (isEncrypted(apiConfig.apiKey)) {
    try {
      apiKey = decrypt(apiConfig.apiKey)
    } catch {
      throw new Error("Invalid API key")
    }
  } else {
    apiKey = apiConfig.apiKey
  }

  return {
    config: {
      provider: apiConfig.provider,
      apiKey,
      model: apiConfig.model || AI.defaultModel,
      temperature: apiConfig.temperature ?? AI.defaultTemperature,
      maxTokens: apiConfig.maxTokens ?? AI.defaultMaxTokens,
    },
    source: "byo",
  }
}

async function callProvider(config: ProviderConfig, messages: ChatMessage[]): Promise<string> {
  switch (config.provider) {
    case "openai":
      return callOpenAI(config, messages)
    case "anthropic":
      return callAnthropic(config, messages)
    case "gemini":
      return callGemini(config, messages)
    case "groq":
      return callGroq(config, messages)
    case "openrouter":
      return callOpenRouter(config, messages)
    default:
      return callOpenAI({ ...config, provider: "openai" }, messages)
  }
}

function getPicoUrl(): string {
  return process.env.PICO_LLM_API_URL?.trim() || ""
}

async function callPicoFallback(fullMessages: ChatMessage[]): Promise<string | null> {
  const url = getPicoUrl()
  if (!url) return null
  try {
    const text = await callBuildPicoApps({ url }, fullMessages)
    if (text) {
      logger.info("AI response generated via BuildPicoApps fallback")
      return text
    }
  } catch (picoError) {
    logger.error("BuildPicoApps fallback failed", { error: picoError instanceof Error ? picoError.message : "Unknown error" })
  }
  return null
}

export async function generateAIResponse(
  userMessage: string,
  clinicId: string,
  conversationHistory: ChatMessage[] = [],
  maxTokens?: number,
): Promise<string> {
  const guardrail = validateInput(userMessage)

  if (guardrail.action === "invalid" || guardrail.action === "spam") {
    logger.info("Input rejected by guardrails", { action: guardrail.action, confidence: guardrail.confidence })
    return guardrail.message || "I'm here to help with clinic-related questions. Could you please ask something else?"
  }

  if (guardrail.action === "abuse") {
    logger.info("Abuse detected", { confidence: guardrail.confidence })
    return guardrail.message || "I'm here to help. Please feel free to ask about our services and appointments."
  }

  try {
    const [clinic, knowledgeBase, faqs, providerResult] = await Promise.all([
      prisma.clinic.findUnique({ where: { id: clinicId } }),
      prisma.knowledgeBase.findMany({ where: { clinicId } }),
      prisma.fAQ.findMany({ where: { clinicId } }),
      getProviderConfig(clinicId),
    ])

    const allEntries: KnowledgeEntry[] = [
      ...knowledgeBase.map((k) => ({
        id: k.id,
        question: k.question,
        answer: k.answer,
        category: k.category,
        type: "knowledgebase" as const,
      })),
      ...faqs.map((f) => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
        category: f.category,
        type: "faq" as const,
      })),
    ]

    const ragResults = searchKnowledge(userMessage, allEntries, 5)
    const ragContext = formatRAGContext(ragResults)
    const hasMatch = hasHighConfidenceMatch(ragResults)

    if (guardrail.action === "emergency") {
      logger.info("Emergency detected in user message", { clinicId })
      return buildEmergencyResponse(clinic?.emergencyPhone)
    }

    const isMedicalQuery = guardrail.action === "medical_query" || /\b(diagnos|symptom|medication|prescribe|treatment|disease|cure)\b/i.test(userMessage)

    if (isMedicalQuery && !/\b(appointment|book|schedule)\b/i.test(userMessage)) {
      return buildMedicalQueryResponse() + `\n\nWould you like to schedule an appointment with our doctor instead?`
    }

    const messages = buildConversationContext(userMessage, conversationHistory)

    const systemPrompt = buildSystemPrompt({
      clinicName: clinic?.name || "our clinic",
      ragContext,
      hours: clinic?.openingHours || "",
      address: clinic?.address || "",
      phone: clinic?.phone || "",
      emergencyPhone: clinic?.emergencyPhone || "",
      isMedicalQuery,
    })

    const systemMessage: ChatMessage = { role: "system", content: systemPrompt }
    const fullMessages = [systemMessage, ...messages]

    if (providerResult.config && providerResult.source) {
      try {
        const response = await callProvider(providerResult.config, fullMessages)

        if (response) {
          const promptTokens = estimateTokens(systemPrompt + messages.map((m) => m.content).join(""))
          const completionTokens = estimateTokens(response)

          trackAiUsage(clinicId, {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          }, providerResult.source).catch((err) => {
            logger.error("Failed to track AI usage", { error: err })
          })

          logger.info("AI response generated", { source: providerResult.source, clinicId })
          return response
        }
      } catch (providerError: unknown) {
        const err = providerError as Error
        if (err?.message?.includes("Invalid API key") || err?.message?.includes("Rate limit exceeded")) {
          // The configured provider is unusable (bad key, no credits, or rate
          // limited). Try the BuildPicoApps LLM API as a stopgap before
          // surfacing the failure.
          const fallback = await callPicoFallback(fullMessages)
          if (fallback) return fallback
          throw err
        }
        logger.warn("AI provider failed, falling back to keyword response", {
          source: providerResult.source,
          error: err?.message,
        })
      }
    }

    if (hasMatch) {
      logger.info("Using RAG direct match as fallback", { clinicId, score: ragResults[0].score })
      return ragResults[0].answer
    }

    return await generateFallbackResponse({
      userMessage,
      clinicId,
      ragResults: { entries: allEntries, topK: 3 },
    })
  } catch (error: unknown) {
    const err = error as Error
    logger.error("AI response error", { error: err?.message })
    if (err?.message?.includes("Invalid API key")) throw error
    if (err?.message?.includes("Rate limit exceeded")) throw error

    return await generateFallbackResponse({
      userMessage,
      clinicId,
    })
  }
}
