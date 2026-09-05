import { prisma } from "@/lib/db"
import { decrypt } from "@/lib/encryption"
import { logger } from "@/lib/logger"
import { AI } from "@/config/constants"
import { buildSystemPrompt } from "./prompt"
import { callOpenAI, callAnthropic, callGemini, callGroq, callOpenRouter } from "./providers"
import { generateFallbackResponse } from "./fallback"
import { searchKnowledge, formatRAGContext, hasHighConfidenceMatch, type KnowledgeEntry } from "./rag"
import {
  validateInput,
  buildEmergencyResponse,
  buildMedicalQueryResponse,
} from "./guardrails"
import { getClinotApiKey } from "./clinot-provider"
import { trackAiUsage, estimateTokens } from "./usage"
import { buildToolDefinitions, executeToolCall, formatToolResultsForModel, type ToolCall, type ToolResult } from "./tools"
import type { ChatMessage } from "@/types"

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
    // OpenRouter is the primary platform provider whenever its key is configured.
    const resolvedProvider = process.env.OPENROUTER_API_KEY ? "openrouter" : provider
    const apiKey = getClinotApiKey(resolvedProvider)
    if (!apiKey) {
      logger.warn(`Clinot AI provider ${resolvedProvider} has no API key configured`, { clinicId })
      return { config: null, source: "clinot" }
    }
    return {
      config: {
        provider: resolvedProvider,
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

    const isMedicalQuery =
      guardrail.action === "medical_query" ||
      /\b(diagnos(e|is)|prescribe|prescription|medication|dosage|dose|should i (take|use|try|get)|what (medicine|medication|tablet|drug)|is this normal|second opinion)\b/i.test(userMessage)

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

export interface GenerateAIOptions {
  /**
   * Pre-built message list (e.g. the receptionist's short-term
   * context: [context header, ...recent turns, current user
   * message]). When provided, it is used verbatim and
   * `conversationHistory` is ignored. Guardrails, RAG and token
   * tracking still run on `userMessage`.
   */
  prebuiltMessages?: ChatMessage[]
}

export async function generateAIResponseWithTools(
  userMessage: string,
  clinicId: string,
  conversationHistory: ChatMessage[] = [],
  maxTokens?: number,
  options?: GenerateAIOptions,
): Promise<{ response: string; toolCalls?: any[] }> {
  const guardrail = validateInput(userMessage)

  if (guardrail.action === "invalid" || guardrail.action === "spam") {
    logger.info("Input rejected by guardrails", { action: guardrail.action, confidence: guardrail.confidence })
    return { response: guardrail.message || "I'm here to help with clinic-related questions. Could you please ask something else?", toolCalls: [] }
  }

  if (guardrail.action === "abuse") {
    logger.info("Abuse detected", { confidence: guardrail.confidence })
    return { response: guardrail.message || "I'm here to help. Please feel free to ask about our services and appointments.", toolCalls: [] }
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
      return { response: buildEmergencyResponse(clinic?.emergencyPhone), toolCalls: [] }
    }

    const isMedicalQuery =
      guardrail.action === "medical_query" ||
      /\b(diagnos(e|is)|prescribe|prescription|medication|dosage|dose|should i (take|use|try|get)|what (medicine|medication|tablet|drug)|is this normal|second opinion)\b/i.test(userMessage)

    if (isMedicalQuery && !/\b(appointment|book|schedule)\b/i.test(userMessage)) {
      return { response: buildMedicalQueryResponse() + `\n\nWould you like to schedule an appointment with our doctor instead?`, toolCalls: [] }
    }

    // Short-term context: when the caller provides a pre-built,
    // already-trimmed message list (receptionist's small context
    // window + topic header), use it verbatim. Otherwise fall back
    // to the standard rolling-window builder.
    const messages = options?.prebuiltMessages ??
      buildConversationContext(userMessage, conversationHistory)

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

    const toolDefinitions = await buildToolDefinitions()

    if (providerResult.config && providerResult.source) {
      try {
        let response: string | null = null
        let toolCalls: any[] = []
        let messages = fullMessages

        for (let iteration = 0; iteration < 3; iteration++) {
          try {
            const providerResponse = await callProviderWithTools(providerResult.config!, messages, toolDefinitions)

            if (providerResponse.toolCalls && providerResponse.toolCalls.length > 0) {
              toolCalls.push(...providerResponse.toolCalls)

              const toolResults = await Promise.all(
                providerResponse.toolCalls.map(async (tc) => {
                  logger.info("[AI-TOOL] Tool call requested", {
                    clinicId,
                    toolName: tc.function.name,
                    arguments: tc.function.arguments,
                  })

                  // PRE-VALIDATION: Intercept book_appointment calls with missing required params
                  if (tc.function.name === "book_appointment") {
                    try {
                      const args = JSON.parse(tc.function.arguments)
                      const requiredFields = ["providerId", "startTime", "endTime", "reason", "patientName", "phone"]
                      const missing = requiredFields.filter(f => !args[f] || (typeof args[f] === "string" && args[f].trim() === ""))
                      if (missing.length > 0) {
                        logger.warn("[AI-TOOL] Pre-validation failed for book_appointment", { missing, clinicId })
                        return { 
                          name: tc.function.name, 
                          result: null, 
                          error: `Missing required fields: ${missing.join(", ")}. Please collect all required information before booking.` 
                        }
                      }
                    } catch {
                      // If parsing fails, let the tool handle it
                    }
                  }
                  
                  const result = await executeToolCall(tc, clinicId)
                  logger.info("[AI-TOOL] Tool execution result", {
                    clinicId,
                    toolName: result.name,
                    success: !result.error,
                    error: result.error,
                  })
                  return { name: result.name, result: result.result, error: result.error }
                })
              )

              // If a booking succeeded but we're on the last iteration, record fallback confirmation
              const bookingResult = toolResults.find(r => r.name === "book_appointment" && r.result?.success)
              if (bookingResult?.result?.confirmation && (!response || !response.trim())) {
                response = bookingResult.result.confirmation
              }

              for (let i = 0; i < providerResponse.toolCalls.length; i++) {
                const tc = providerResponse.toolCalls[i]
                const result = toolResults[i]
                messages.push({
                  role: "assistant",
                  content: null,
                  tool_calls: [{
                    id: tc.id,
                    type: "function",
                    function: { name: tc.function.name, arguments: tc.function.arguments }
                  }]
                })
                const toolContent = result.error
                  ? `Error: ${result.error}`
                  : JSON.stringify(result.result)
                messages.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  content: toolContent,
                })
              }
              continue
            }

            response = providerResponse.content
            break
          } catch (iterationError: unknown) {
            logger.error("Tool calling iteration failed", {
              clinicId,
              iteration,
              error: iterationError instanceof Error ? iterationError.message : String(iterationError)
            })
            break
          }
        }

        if (!response || !response.trim()) {
          logger.warn("AI returned empty response after tool calling loop, using fallback", { clinicId })
        } else {
          const promptTokens = estimateTokens(systemPrompt + messages.map((m) => m.content).join(""))
          const completionTokens = estimateTokens(response)

          trackAiUsage(clinicId, {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          }, providerResult.source).catch((err) => {
            logger.error("Failed to track AI usage", { error: err })
          })

          logger.info("AI response generated", { source: providerResult.source, clinicId, toolCalls: toolCalls.length })
          return { response, toolCalls }
        }
      } catch (providerError: unknown) {
        const err = providerError as Error
        if (err?.message?.includes("Invalid API key") || err?.message?.includes("Rate limit exceeded")) {
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
      return { response: ragResults[0].answer, toolCalls: [] }
    }

    const fallbackResponse = await generateFallbackResponse({
      userMessage,
      clinicId,
      ragResults: { entries: allEntries, topK: 3 },
    })
    if (!fallbackResponse || !fallbackResponse.trim()) {
      logger.error("Fallback response is empty, returning default message", { clinicId })
      return { response: "I'm here to help with appointments and clinic questions. Could you please provide more details?", toolCalls: [] }
    }
    return { response: fallbackResponse, toolCalls: [] }
  } catch (error: unknown) {
    const err = error as Error
    logger.error("AI response error", { error: err?.message })
    if (err?.message?.includes("Invalid API key")) throw error
    if (err?.message?.includes("Rate limit exceeded")) throw error

    const errorFallback = await generateFallbackResponse({
      userMessage,
      clinicId,
    })
    let finalResponse = errorFallback
    if (!finalResponse || !finalResponse.trim()) {
      finalResponse = "I'm here to help with appointments and clinic questions. Could you please provide more details?"
    }
    
    // FINAL SAFETY NET: Ensure we NEVER return empty response for appointment-related queries
    const isAppointmentQuery = /\b(appointment|book|schedule|reschedule|cancel|visit|see\s*(a\s*)?doctor|checkup|cleaning|consult)\b/i.test(userMessage)
    if (isAppointmentQuery && (!finalResponse || !finalResponse.trim())) {
      logger.warn("Final safety net triggered for appointment query", { clinicId, userMessage })
      finalResponse = "I'd be happy to help you book an appointment! Please share your full name, phone number, reason for your visit, and your preferred date and time."
    }
    
    return { response: finalResponse, toolCalls: [] }
  }
}

async function callProviderWithTools(config: any, messages: any[], tools: any[]): Promise<{ content: string | null; toolCalls: any[] }> {
  switch (config.provider) {
    case "openai":
      return callOpenAIWithTools(config, messages, tools)
    case "openrouter":
      return callOpenRouterWithTools(config, messages, tools)
    default:
      return { content: await callProvider(config, messages), toolCalls: [] }
  }
}

async function callOpenAIWithTools(config: any, messages: any[], tools: any[]): Promise<{ content: string | null; toolCalls: any[] }> {
  const openai = (await import("openai")).default
  const client = new openai({ apiKey: config.apiKey })

  const response = await client.chat.completions.create({
    model: config.model,
    messages: messages as any,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
  })

  const message = response.choices[0].message
  return {
    content: message.content,
    toolCalls: message.tool_calls || [],
  }
}

async function callOpenRouterWithTools(config: any, messages: any[], tools: any[]): Promise<{ content: string | null; toolCalls: any[] }> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages as any,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    }),
  })

  const data = await response.json()
  const message = data.choices[0].message
  return {
    content: message.content,
    toolCalls: message.tool_calls || [],
  }
}

export { generateFallbackResponse }
