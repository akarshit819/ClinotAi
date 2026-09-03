import { validateProductionSecrets } from "./lib/env"

// Next.js 14 compiles this file for BOTH the Node.js and Edge runtimes.
// Anything reachable from here is statically analyzed by Webpack and must
// therefore be safe in the Edge runtime. That means: NO Node built-ins
// (crypto, http, fs, process.exit, etc.) and NO Node-only modules
// (Prisma, the job worker, token-store, encryption).
//
// The internal background job processor is started by the production
// launcher (scripts/start-production.js) BEFORE Next.js boots. That
// keeps the worker's Node-only module graph out of the Webpack
// compilation entirely. This file is therefore a no-op beyond secret
// validation; it exists to keep the instrumentationHook contract.
//
// See docs/RENDER-DEPLOYMENT.md and the architectural notes in
// scripts/start-production.js for the full startup flow.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  try {
    validateProductionSecrets()
  } catch (err) {
    // Validation must be visible in the deploy log; we do not exit the
    // process here because the production launcher will also run the
    // same check and abort the boot if secrets are missing.
    console.error("[instrumentation] Secret validation failed:", (err as Error).message)
  }
}
