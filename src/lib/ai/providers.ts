/**
 * OpenRouter — the SINGLE AI provider for Clinot.
 *
 * ONE PROVIDER. ONE MODEL ROUTER. ONE SOURCE OF TRUTH.
 *
 * There is deliberately no provider selection, no provider priority
 * list, and no fallback to any other LLM provider. If OpenRouter
 * fails, callers receive a typed error whose `reasonCode` identifies
 * the exact failure (auth / rate limit / timeout / network / provider
 * error / empty response) and produce a context-aware fallback.
 *
 * Model: free-model failover chain (see openrouter-manager.ts);
 * direct callers default to the first free candidate unless
 * OPENROUTER_MODEL overrides. The API key is NEVER logged.
 */
import { AI } from "@/config/constants"
import type { ChatMessage } from "@/types"

export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

export function getOpenRouterApiKey(): string {
  return process.env.OPENROUTER_API_KEY?.trim() || ""
}

/**
 * Configured model for single-shot callers. Reads OPENROUTER_MODEL live —
 * empty string when unset (callers must fail safely, never guess a model).
 * The failover manager builds its own candidate list from this plus
 * OPENROUTER_FALLBACK_MODELS.
 */
export function getOpenRouterModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || ""
}

export interface OpenRouterConfig {
  apiKey: string
  model: string
}

export function getOpenRouterConfig(): OpenRouterConfig {
  return {
    apiKey: getOpenRouterApiKey(),
    model: getOpenRouterModel(),
  }
}

/** A provider failure that carries a machine-readable reason code. */
export interface OpenRouterProviderError extends Error {
  reasonCode:
    | "OPENROUTER_NOT_CONFIGURED"
    | "OPENROUTER_AUTH_FAILED"
    | "OPENROUTER_RATE_LIMITED"
    | "OPENROUTER_TIMEOUT"
    | "OPENROUTER_NETWORK_ERROR"
    | "OPENROUTER_PROVIDER_ERROR"
    | "OPENROUTER_BAD_REQUEST"
    | "OPENROUTER_EMPTY_RESPONSE"
  statusCode?: number
}

function openRouterError(
  reasonCode: OpenRouterProviderError["reasonCode"],
  message: string,
  statusCode?: number,
): OpenRouterProviderError {
  // Never embed API keys or full request bodies in provider errors.
  const err = new Error(`[${reasonCode}] ${message}`) as OpenRouterProviderError
  err.reasonCode = reasonCode
  if (statusCode !== undefined) err.statusCode = statusCode
  return err
}

export interface OpenRouterCallOptions {
  /** Chat-completions tool definitions; omitted when empty. */
  tools?: Array<Record<string, unknown>>
  /** Request timeout in ms (defaults to AI.timeout). */
  timeoutMs?: number
}

export interface OpenRouterResult {
  content: string
  toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>
}

/**
 * One clear AI request path:
 *   callOpenRouter(config, messages, { tools? }) → OpenRouter API.
 *
 * Handles: HTTP status codes (401/429/5xx/other), timeouts, network
 * errors, error-shaped bodies, empty choices, and missing content —
 * each mapped to an explicit reasonCode. The API key is never logged
 * and never included in error messages.
 */
export async function callOpenRouter(
  config: OpenRouterConfig,
  messages: ChatMessage[],
  options?: OpenRouterCallOptions,
): Promise<OpenRouterResult> {
  if (!config.apiKey) {
    throw openRouterError(
      "OPENROUTER_NOT_CONFIGURED",
      "OPENROUTER_API_KEY is not set — Clinot AI conversations cannot use OpenRouter.",
    )
  }

  const tools = options?.tools && options.tools.length > 0 ? options.tools : undefined

  let response: Response
  try {
    response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(options?.timeoutMs ?? AI.timeout),
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: AI.defaultTemperature,
        max_tokens: AI.defaultMaxTokens,
        ...(tools ? { tools, tool_choice: "auto" } : {}),
      }),
    })
  } catch (err) {
    const e = err as Error
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      throw openRouterError("OPENROUTER_TIMEOUT", `OpenRouter request timed out after ${options?.timeoutMs ?? AI.timeout}ms`)
    }
    throw openRouterError("OPENROUTER_NETWORK_ERROR", `Network failure reaching OpenRouter: ${e.message}`)
  }

  if (!response.ok) {
    // Read the error body safely (truncated) — it never contains our key.
    const errBody = await response.text().catch(() => "")
    if (response.status === 401 || response.status === 403) {
      throw openRouterError("OPENROUTER_AUTH_FAILED", `OpenRouter authentication failed (${response.status}). ${errBody.slice(0, 200)}`, response.status)
    }
    if (response.status === 400) {
      throw openRouterError("OPENROUTER_BAD_REQUEST", `OpenRouter rejected the request (400) — malformed payload or unsupported parameters, not a model-availability issue. ${errBody.slice(0, 200)}`, response.status)
    }
    if (response.status === 402) {
      throw openRouterError("OPENROUTER_RATE_LIMITED", `OpenRouter credits exhausted (402). ${errBody.slice(0, 200)}`, response.status)
    }
    if (response.status === 429) {
      throw openRouterError("OPENROUTER_RATE_LIMITED", `OpenRouter rate limit / quota exceeded (429). ${errBody.slice(0, 200)}`, response.status)
    }
    if (response.status === 404) {
      throw openRouterError("OPENROUTER_PROVIDER_ERROR", `OpenRouter model not found (404). ${errBody.slice(0, 200)}`, response.status)
    }
    if (response.status === 408) {
      throw openRouterError("OPENROUTER_TIMEOUT", `OpenRouter request timeout (408). ${errBody.slice(0, 200)}`, response.status)
    }
    if (response.status >= 500) {
      throw openRouterError("OPENROUTER_PROVIDER_ERROR", `OpenRouter provider error (${response.status}). ${errBody.slice(0, 200)}`, response.status)
    }
    throw openRouterError("OPENROUTER_PROVIDER_ERROR", `OpenRouter request failed (${response.status}). ${errBody.slice(0, 200)}`, response.status)
  }

  const data = await response.json().catch(() => null)
  const message = data?.choices?.[0]?.message
  if (!message) {
    throw openRouterError(
      "OPENROUTER_EMPTY_RESPONSE",
      `OpenRouter returned a response with no choices: ${JSON.stringify(data).slice(0, 200)}`,
    )
  }

  return {
    content: typeof message.content === "string" ? message.content : "",
    toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
  }
}
