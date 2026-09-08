import type { ChatMessage } from "@/types"
import { AI } from "@/config/constants"
import {
  callOpenRouter,
  getOpenRouterConfig,
  type OpenRouterProviderError,
  type OpenRouterResult,
} from "./providers"
import { logger } from "@/lib/logger"

// OpenRouter FREE model candidates — the SINGLE source of truth for the
// failover chain. Each entry MUST be a real OpenRouter model ID suitable
// for text chat (instruction/chat-capable, not image-only/audio-only).
// Override at runtime with OPENROUTER_MODELS (comma-separated, preferred)
// or legacy OPENROUTER_MODEL (single). Env entries win over defaults.
export const DEFAULT_FREE_CANDIDATES: string[] = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemini-2.0-flash-exp:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-70b:free",
  "google/gemma-3-27b-it:free",
]

export type OpenRouterFailoverReason =
  | "OPENROUTER_NOT_CONFIGURED"
  | "OPENROUTER_AUTH_FAILED"
  | "OPENROUTER_RATE_LIMITED"
  | "OPENROUTER_TIMEOUT"
  | "OPENROUTER_NETWORK_ERROR"
  | "OPENROUTER_PROVIDER_ERROR"
  | "OPENROUTER_EMPTY_RESPONSE"
  | "OPENROUTER_INVALID_RESPONSE"
  | "ALL_OPENROUTER_MODELS_FAILED"

export interface OpenRouterCallResult {
  ok: true
  content: string
  toolCalls: OpenRouterResult["toolCalls"]
  model: string
  attempt: number
  attemptCount: number
}

export interface OpenRouterAttemptRecord {
  model: string
  reason: OpenRouterFailoverReason | "OK" | "SKIPPED_COOLDOWN"
  statusCode?: number
  willFailover?: boolean
}

export interface OpenRouterCallFailure {
  ok: false
  reason: OpenRouterFailoverReason
  attempts: OpenRouterAttemptRecord[]
}

const MODEL_COOLDOWN_MS = 60_000
const MAX_CONSECUTIVE_FAILURES = 2

// In-memory model health. No Redis, no DB. Resets on process
// restart (acceptable warm-up window after a deploy).
const health = new Map<string, { consecutiveFailures: number; cooldownUntil: number }>()
let lastSuccessfulModel: string | null = null

/** Test-only reset for the in-memory health map. */
export function resetOpenRouterHealth(): void {
  health.clear()
  lastSuccessfulModel = null
}

function isOnCooldown(model: string, now: number): boolean {
  const h = health.get(model)
  if (!h) return false
  if (h.consecutiveFailures < MAX_CONSECUTIVE_FAILURES) return false
  if (h.cooldownUntil > now) return true
  health.delete(model)
  return false
}

function markFailure(model: string, reason: OpenRouterFailoverReason): void {
  // Auth / missing-key errors do NOT enter the cooldown loop —
  // switching models cannot fix a bad key.
  if (reason === "OPENROUTER_AUTH_FAILED" || reason === "OPENROUTER_NOT_CONFIGURED") return
  const h = health.get(model) ?? { consecutiveFailures: 0, cooldownUntil: 0 }
  h.consecutiveFailures += 1
  if (h.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    h.cooldownUntil = Date.now() + MODEL_COOLDOWN_MS
    logger.warn("[OPENROUTER-MGR] model entered cooldown", {
      model,
      consecutiveFailures: h.consecutiveFailures,
      cooldownMs: MODEL_COOLDOWN_MS,
    })
  }
  health.set(model, h)
}

function markSuccess(model: string): void {
  if (lastSuccessfulModel !== model) {
    lastSuccessfulModel = model
    logger.info("[OPENROUTER-MGR] last successful model updated", { model })
  }
  health.delete(model)
}

function classifyError(err: unknown): { reason: OpenRouterFailoverReason; fatal: boolean; statusCode?: number } {
  if (err && typeof err === "object" && "reasonCode" in err) {
    const typed = err as OpenRouterProviderError
    const code = typed.reasonCode
    const fatal = code === "OPENROUTER_AUTH_FAILED" || code === "OPENROUTER_NOT_CONFIGURED"
    return { reason: code, fatal, statusCode: typed.statusCode }
  }
  return { reason: "OPENROUTER_NETWORK_ERROR", fatal: false }
}

export interface OpenRouterManagerOptions {
  maxAttempts?: number
  timeoutMs?: number
  tools?: { tools?: Array<Record<string, unknown>> }
  traceId?: string
}

function traceOpenrouter(traceId: string, fields: Record<string, unknown>) {
  logger.info(`[CLINOT_AI_TRACE ${traceId}]`, { provider: "openrouter", ...fields })
}

/**
 * Normalize a model ID: trim whitespace, drop empties. IDs that already
 * contain a provider prefix (e.g. "openai/gpt-4o-mini") are preserved
 * verbatim — never force or duplicate a prefix.
 */
export function normalizeModelId(raw: string): string {
  return raw.trim()
}

function parseModelOverride(): string[] {
  // OPENROUTER_MODELS (preferred, comma-separated) and legacy
  // OPENROUTER_MODEL (single). OPENROUTER_MODELS wins if set.
  const list = process.env.OPENROUTER_MODELS?.trim()
  if (list) {
    return list.split(",").map(normalizeModelId).filter(Boolean)
  }
  const single = process.env.OPENROUTER_MODEL?.trim()
  if (single) return [normalizeModelId(single)].filter(Boolean)
  return []
}

function dedupe(models: string[]): string[] {
  const out: string[] = []
  for (const m of models) {
    const n = normalizeModelId(m)
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

/** Ordered, deduplicated candidate list for this call (test-visible). */
export function getOpenRouterCandidates(): string[] {
  const out: string[] = []
  for (const m of dedupe(parseModelOverride())) if (!out.includes(m)) out.push(m)
  // Sticky success: prefer the last working model (unless it is already
  // first or on cooldown — cooldown is checked per-attempt at call time).
  if (lastSuccessfulModel) {
    const sticky = normalizeModelId(lastSuccessfulModel)
    if (sticky && !out.includes(sticky)) out.unshift(sticky)
  }
  for (const m of DEFAULT_FREE_CANDIDATES) if (!out.includes(m)) out.push(m)
  return out
}

/**
 * OpenRouter-only autonomous failover.
 *
 * Order per call:
 *   1. lastSuccessfulModel (sticky, when set and not overridden first).
 *   2. OPENROUTER_MODELS env override (comma-separated) or
 *      OPENROUTER_MODEL legacy single-override.
 *   3. DEFAULT_FREE_CANDIDATES.
 *
 * Each candidate gets exactly ONE attempt. Cooldowned models are
 * skipped without burning a request slot. Fatal errors (auth, missing
 * key) stop the loop immediately. Bounded work: maxAttempts caps the
 * total iterations so there is no infinite loop.
 */
export async function callOpenRouterWithFailover(
  messages: ChatMessage[],
  options: OpenRouterManagerOptions = {},
): Promise<OpenRouterCallResult | OpenRouterCallFailure> {
  const traceId = options.traceId ?? "or-" + Math.random().toString(36).slice(2, 8)
  const timeoutMs = options.timeoutMs ?? AI.timeout
  const maxAttempts = options.maxAttempts ?? 10
  const apiKey = getOpenRouterConfig().apiKey

  if (!apiKey) {
    traceOpenrouter(traceId, {
      stage: "final",
      aiCallAttempted: false,
      fallbackReason: "OPENROUTER_NOT_CONFIGURED",
      responseSource: "FALLBACK",
    })
    logger.error(
      "[OPENROUTER-MGR] OPENROUTER_API_KEY is not set — every message will fall back. Set the credential in the environment.",
    )
    return { ok: false, reason: "OPENROUTER_NOT_CONFIGURED", attempts: [] }
  }

  const candidates = getOpenRouterCandidates().slice(0, maxAttempts)
  if (candidates.length === 0) {
    return { ok: false, reason: "OPENROUTER_NOT_CONFIGURED", attempts: [] }
  }

  const attempts: OpenRouterCallFailure["attempts"] = []
  let requestSlotsUsed = 0

  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i]
    const attemptNum = i + 1
    const now = Date.now()

    if (isOnCooldown(model, now)) {
      attempts.push({ model, reason: "SKIPPED_COOLDOWN", willFailover: true })
      logger.info("[OPENROUTER-MGR] skipping model on cooldown", { model, attempt: attemptNum })
      continue
    }

    if (requestSlotsUsed >= maxAttempts) break
    requestSlotsUsed += 1

    traceOpenrouter(traceId, {
      stage: "provider_selected",
      model,
      attempt: attemptNum,
      totalModels: candidates.length,
      aiCallAttempted: true,
    })

    try {
      const result = await callOpenRouter(
        { apiKey, model },
        messages,
        { tools: options.tools?.tools, timeoutMs },
      )
      if (!result.content || !result.content.trim()) {
        markFailure(model, "OPENROUTER_EMPTY_RESPONSE")
        attempts.push({ model, reason: "OPENROUTER_EMPTY_RESPONSE", willFailover: true })
        traceOpenrouter(traceId, {
          stage: "provider_error",
          model,
          attempt: attemptNum,
          providerSuccess: false,
          providerError: "OPENROUTER_EMPTY_RESPONSE",
          willFailover: true,
        })
        continue
      }
      markSuccess(model)
      attempts.push({ model, reason: "OK", willFailover: false })
      traceOpenrouter(traceId, {
        stage: "provider_success",
        model,
        attempt: attemptNum,
        providerSuccess: true,
      })
      traceOpenrouter(traceId, {
        stage: "final",
        aiCallAttempted: true,
        provider: "openrouter",
        providerSuccess: true,
        aiResponsePresent: true,
        responseSource: "AI",
        model,
      })
      return {
        ok: true,
        content: result.content,
        toolCalls: result.toolCalls,
        model,
        attempt: attemptNum,
        attemptCount: candidates.length,
      }
    } catch (err) {
      const cls = classifyError(err)
      markFailure(model, cls.reason)
      const willFailover = !cls.fatal && i < candidates.length - 1
      attempts.push({
        model,
        reason: cls.reason,
        statusCode: cls.statusCode,
        willFailover,
      })
      traceOpenrouter(traceId, {
        stage: "provider_error",
        model,
        attempt: attemptNum,
        providerSuccess: false,
        providerError: cls.reason,
        statusCode: cls.statusCode,
        willFailover,
      })
      if (cls.fatal) {
        traceOpenrouter(traceId, {
          stage: "final",
          aiCallAttempted: true,
          provider: "openrouter",
          providerSuccess: false,
          fallbackReason: cls.reason,
          responseSource: "FALLBACK",
        })
        return { ok: false, reason: cls.reason, attempts }
      }
    }
  }

  // All candidates exhausted without success
  traceOpenrouter(traceId, {
    stage: "final",
    aiCallAttempted: true,
    provider: "openrouter",
    providerSuccess: false,
    fallbackReason: "ALL_OPENROUTER_MODELS_FAILED",
    responseSource: "FALLBACK",
  })
  return {
    ok: false,
    reason: "ALL_OPENROUTER_MODELS_FAILED",
    attempts,
  }
}
