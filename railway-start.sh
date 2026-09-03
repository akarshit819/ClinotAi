#!/bin/sh
set -e

# ============================================================================
# SINGLE-SERVICE ARCHITECTURE (RAILWAY / VOROA-FORMAT BOOT):
#   This script is a thin wrapper around the production launcher
#   (`scripts/start-production.js`), which is the SINGLE source of truth
#   for production boot. The launcher:
#
#     1. Runs prisma generate + prisma migrate deploy
#     2. Runs system / admin / dev / WhatsApp seeds
#     3. Starts the INTERNAL background job processor in its own Node
#        process (WhatsApp queue, AI processing, retries, stale-job
#        recovery) BEFORE Next.js boots
#     4. Spawns the Next.js production server as a child process
#     5. Owns SIGTERM/SIGINT for graceful shutdown
#
#   The internal processor is started in `scripts/start-production.js`
#   (a Node-level entrypoint) rather than in `src/instrumentation.ts`
#   because Next.js 14 compiles instrumentation for both the Node.js and
#   Edge runtimes, and Webpack statically resolves every reachable
#   import. Starting the worker from the launcher keeps the worker's
#   Node-only module graph (which depends on `crypto` / `http` and
#   Prisma) entirely out of the Webpack compilation pipeline.
#
#   PostgreSQL is the queue's source of truth. No separate worker
#   service and no WORKER_MODE flag are required. `npm run worker`
#   still exists for the optional standalone deployment path.
# ============================================================================

exec node scripts/start-production.js
