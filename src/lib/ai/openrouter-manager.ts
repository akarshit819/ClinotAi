import type { ChatMessage } from "@/types"
import { AI } from "@/config/constants"
import {
  callOpenRouter,
  getOpenRouterConfig,
  type OpenRouterProviderError,
  type OpenRouterResult,
} from "./providers"
import { logger } from "@/lib/logger"

// OpenRouter model configuration — ENVIRONMENT VARIABLES ARE THE SINGLE
// SOURCE OF TRUTH. There is deliberately NO hardcoded model list in this
// file: the operator changes models via Render env vars + redeploy, never
// via code.
//
//   OPENROUTER_MODEL            (required) primary model, attempted FIRST.
//   OPENROUTER_FALLBACK_MODELS  (optional) comma-separated fallbacks,
//                               attempted in order after the primary.

export type OpenRouterFailoverReason =
  | "OPENROUTER_NOT_CONFIGURED"
  | "OPENROUTER_AUTH_FAILED"
  | "OPENROUTER_RATE_LIMITED"
  | "OPENROUTER_TIMEOUT"
  | "OPENROUTER_NETWORK_ERROR"
  | "OPENROUTER_PROVIDER_ERROR"
  | "OPENROUTER_BAD_REQUEST"
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

// In-memory model health, keyed DYNAMICALLY by model ID string. No Redis,
// no DB, no hardcoded entries. When the operator changes OPENROUTER_MODEL,
// the new ID automatically gets its own health entry. Resets on process
// restart (acceptable warm-up window after a deploy).
const health = new Map<string, { consecutiveFailures: number; cooldownUntil: number }>()

/** Test-only reset for the in-memory health map. */
export function resetOpenRouterHealth(): void {
  health.clear()
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
  // A success clears any accumulated failures so the model is immediately
  // eligible again. No sticky reordering: the PRIMARY env model is ALWAYS
  // attempted first on the next call.
  health.delete(model)
}

function classifyError(err: unknown): { reason: OpenRouterFailoverReason; fatal: boolean; statusCode?: number } {
  if (err && typeof err === "object" && "reasonCode" in err) {
    const typed = err as OpenRouterProviderError
    const code = typed.reasonCode
    // Fatal = stop the chain, fall back immediately:
    //   auth / missing key  → another model cannot fix the credential;
    //   bad request (400)   → the request body is identical for every
    //                         candidate, so retrying models cannot help.
    //                         Fix the request or the model env var.
    // Recoverable (fail over): rate limits, timeouts, network failures,
    // provider 4xx-availability (404) and 5xx errors, empty responses.
    const fatal =
      code === "OPENROUTER_AUTH_FAILED" ||
      code === "OPENROUTER_NOT_CONFIGURED" ||
      code === "OPENROUTER_BAD_REQUEST"
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
 * contain a provider prefix are preserved verbatim — never force or
 * duplicate a prefix.
 */
export function normalizeModelId(raw: string): string {
  return raw.trim()
}

/**
 * PRIMARY model — ALWAYS attempted first. Read live from the environment
 * on every call so a Render redeploy picks up the new value with zero
 * code changes. Empty string = not configured (never guess a model).
 */
export function getOpenRouterPrimaryModel(): string {
  return normalizeModelId(process.env.OPENROUTER_MODEL ?? "")
}

/**
 * OPTIONAL fallback models, parsed from a comma-separated list.
 * Whitespace removed, empties dropped (dedup happens in candidates()).
 */
export function getOpenRouterFallbackModels(): string[] {
  const raw = process.env.OPENROUTER_FALLBACK_MODELS ?? ""
  return raw
    .split(",")
    .map(normalizeModelId)
    .filter((m) => m.length > 0)
}

function dedupe(models: string[]): string[] {
  const out: string[] = []
  for (const m of models) {
    const n = normalizeModelId(m)
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

export interface OpenRouterModelConfig {
  primaryModel: string
  fallbackModels: string[]
  totalModels: number
}

/** Current model configuration snapshot (test-visible). */
export function getOpenRouterModelConfig(): OpenRouterModelConfig {
  const primaryModel = getOpenRouterPrimaryModel()
  if (!primaryModel) return { primaryModel: "", fallbackModels: [], totalModels: 0 }
  const fallbackModels = dedupe(getOpenRouterFallbackModels()).filter((m) => m !== primaryModel)
  return { primaryModel, fallbackModels, totalModels: 1 + fallbackModels.length }
}

/**
 * Ordered candidate list for this call (test-visible):
 *   1. OPENROUTER_MODEL (primary — always first)
 *   2. OPENROUTER_FALLBACK_MODELS (in order, minus duplicates/primary)
 * Empty when the primary is not configured — callers fail safely instead
 * of silently selecting a model.
 */
export function getOpenRouterCandidates(): string[] {
  const cfg = getOpenRouterModelConfig()
  if (!cfg.primaryModel) return []
  return [cfg.primaryModel, ...cfg.fallbackModels]
}

let lastLoggedConfigSignature = ""

/**
 * Startup-safe config log: emitted ONCE per distinct configuration (and
 * again if the env config ever changes under a live process). NEVER logs
 * API keys — only model IDs and counts.
 */
export function logOpenRouterConfigOnce(): void {
  const cfg = getOpenRouterModelConfig()
  const signature = `${cfg.primaryModel}|${cfg.fallbackModels.join(",")}`
  if (signature === lastLoggedConfigSignature) return
  lastLoggedConfigSignature = signature
  if (!cfg.primaryModel) {
    logger.error(
      "[OPENROUTER] Configuration error: OPENROUTER_MODEL is not set — Clinot AI will use fallback responses for every message. Set OPENROUTER_MODEL in the environment and redeploy.",
    )
    return
  }
  logger.info("[OPENROUTER] Configuration loaded", {
    primaryModel: cfg.primaryModel,
    fallbackModelCount: cfg.fallbackModels.length,
    totalModels: cfg.totalModels,
  })
}

/**
 * OpenRouter-only autonomous failover over ENV-CONFIGURED models.
 *
 * Order per call (env is the single source of truth):
 *   1. OPENROUTER_MODEL (primary — ALWAYS first, success stops here).
 *   2. OPENROUTER_FALLBACK_MODELS (in order, deduped).
 *
 * Each candidate gets exactly ONE attempt. Cooldowned models are
 * skipped without burning a request slot. Fatal errors (auth, missing
 * key, bad request) stop the loop immediately. Bounded work:
 * maxAttempts caps the total iterations so there is no infinite loop.
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

  // Startup-safe config line (once per config): shows the ACTUAL models
  // in force without ever logging keys.
  logOpenRouterConfigOnce()

  const candidates = getOpenRouterCandidates().slice(0, maxAttempts)
  if (candidates.length === 0) {
    traceOpenrouter(traceId, {
      stage: "final",
      aiCallAttempted: false,
      fallbackReason: "OPENROUTER_NOT_CONFIGURED",
      responseSource: "FALLBACK",
    })
    logger.error(
      "[OPENROUTER-MGR] OPENROUTER_MODEL is not set — no model attempted. Set OPENROUTER_MODEL in the environment and redeploy.",
    )
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
    // Explicit pre-request line: the exact runtime model string from env.
    logger.info(`[CLINOT_AI_TRACE] provider=openrouter model=${model}`, {
      traceId,
      attempt: attemptNum,
      totalModels: candidates.length,
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
