import { validateProductionSecrets } from "./lib/env"

export async function register(): Promise<void> {
  // Existing behavior: fail visibly when required production secrets are
  // missing or malformed (does not exit the process — the deploy log shows it).
  validateProductionSecrets()

  // Single-service architecture: start the internal background job processor
  // inside the web server process. Fire-and-forget — it never blocks or
  // terminates HTTP serving, and its failures are retried, not fatal.
  // PostgreSQL remains the queue's source of truth.
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  try {
    const { startInternalJobProcessor } = await import("@/lib/jobs/worker")
    startInternalJobProcessor()
  } catch (err) {
    console.error("[instrumentation] Failed to start internal job processor:", err)
  }
}
