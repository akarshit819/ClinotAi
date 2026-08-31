#!/bin/sh
set -e

# ============================================================================
# ARCHITECTURE (no recursion, one process per service):
#
#   WEB SERVICE  (WORKER_MODE unset/false):
#     prisma generate → prisma migrate deploy → seeds → Next standalone server
#     The WEB service is the ONLY place migrations run.
#
#   WORKER SERVICE (WORKER_MODE=true):
#     npm run worker → worker.ts (validates env, waits for PostgreSQL, polls
#     forever). NO migrations, NO Next.js — so Web + Worker booting at the
#     same time can never race on `prisma migrate deploy`. The worker waits
#     for the database and starts processing once the Web service is done.
# ============================================================================

# 1. Worker mode: start the background worker directly.
if [ "$WORKER_MODE" = "true" ]; then
  echo "[boot] WORKER_MODE enabled - starting background worker (migrations are owned by the Web service)..."
  exec npm run worker
fi

# 2. Web service: apply database migrations. Production schema is managed by
# Prisma migrations, never `db push` (which would silently drift).
npx prisma generate

# Recover from a previously failed migration attempt so the corrected
# migration can be applied on a later boot. No-op if the migration is not in a
# failed state (and harmless if the migration already applied successfully).
npx prisma migrate resolve --rolled-back 20260816000000_init || true

npx prisma migrate deploy

# 3. Provision non-secret system data (permissions, plans, clinic template).
# Idempotent, contains no credentials and never creates a demo admin user.
npx tsx src/seed-system.ts || echo "[boot] System seed failed; continuing boot."

# 4. Opt-in: bootstrap initial admin account on new database.
# Only runs when CLINOT_BOOTSTRAP_ADMIN=true and BOOTSTRAP_ADMIN_EMAIL/PASSWORD are set.
# Failure here is FATAL: the operator explicitly requested admin creation, and
# silently continuing would produce a deployment where login cannot work.
if [ "$CLINOT_BOOTSTRAP_ADMIN" = "true" ]; then
  echo "[boot] CLINOT_BOOTSTRAP_ADMIN is enabled - running admin bootstrap..."
  npx tsx src/bootstrap-admin.ts || {
    echo "[boot] FATAL: admin bootstrap failed (see errors above). Check BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD and redeploy."
    exit 1
  }
fi

# 5. Opt-in: create/verify the clearly-marked dev/test user on boot.
# Only runs when CLINOT_DEV_SEED=true is set in the environment.
if [ "$CLINOT_DEV_SEED" = "true" ]; then
  echo "[boot] CLINOT_DEV_SEED is enabled - ensuring dev/test user exists..."
  npx tsx src/seed-dev-user.ts || echo "[boot] Dev seed skipped or failed; continuing boot."
fi

# 6. Connect the WhatsApp business account from env vars (idempotent). Only runs
# when WHATSAPP_ACCESS_TOKEN/PHONE_NUMBER_ID/WABA_ID are set, and it never
# creates users or demo data. Required for inbound webhooks + outbound replies.
npx tsx src/seed-whatsapp.ts || echo "[boot] WhatsApp provisioning skipped or failed; continuing boot."

# 7. Web mode: start Next.js web server.
# next.config.js uses output: "standalone" — `next start` does not support it.
# Prefer the self-contained server (static assets copied by scripts/postbuild.js).
if [ -f .next/standalone/server.js ]; then
  echo "[boot] Starting standalone Next.js server on port ${PORT:-3000}..."
  exec node .next/standalone/server.js
else
  echo "[boot] No standalone build found - falling back to next start on port ${PORT:-3000}..."
  exec npx next start -p "${PORT:-3000}"
fi
