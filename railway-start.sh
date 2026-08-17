#!/bin/sh
set -e

# Apply database migrations. Production schema is managed by Prisma migrations,
# never `db push` (which would silently drift from the migration history).
npx prisma generate
npx prisma migrate deploy

# Provision non-secret system data (permissions, plans, clinic template).
# Idempotent, contains no credentials and never creates a demo admin user.
npx tsx src/seed-system.ts || echo "[railway] System seed failed; continuing boot."

# Opt-in: create/verify the clearly-marked dev/test user on every boot.
# Only runs when CLINOT_DEV_SEED=true is set in the Railway environment.
if [ "$CLINOT_DEV_SEED" = "true" ]; then
  echo "[railway] CLINOT_DEV_SEED is enabled - ensuring dev/test user exists..."
  npx tsx src/seed-dev-user.ts || echo "[railway] Dev seed skipped or failed; continuing boot."
fi

# Connect the WhatsApp business account from env vars (idempotent). Only runs
# when WHATSAPP_ACCESS_TOKEN/PHONE_NUMBER_ID/WABA_ID are set, and it never
# creates users or demo data. Required for inbound webhooks + outbound replies.
npx tsx src/seed-whatsapp.ts || echo "[railway] WhatsApp provisioning skipped or failed; continuing boot."

npm run start