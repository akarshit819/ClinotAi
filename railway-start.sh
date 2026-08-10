#!/bin/sh
set -e

npx prisma db push --skip-generate

# Provision core data (admin user, demo clinic, plans, FAQs) on every boot.
# The database is ephemeral on Railway (no volume), so this keeps the app usable.
npx tsx src/seed.ts || echo "[railway] Main seed failed; continuing boot."

# Opt-in: create/verify the clearly-marked dev/test user on every boot.
# Only runs when CLINOT_DEV_SEED=true is set in the Railway environment.
if [ "$CLINOT_DEV_SEED" = "true" ]; then
  echo "[railway] CLINOT_DEV_SEED is enabled - ensuring dev/test user exists..."
  npx tsx src/seed-dev-user.ts || echo "[railway] Dev seed skipped or failed; continuing boot."
fi

# Connect the WhatsApp business account from env vars (idempotent). Required for
# inbound webhooks to resolve the clinic and for outbound replies to work.
npx tsx src/seed-whatsapp.ts || echo "[railway] WhatsApp seed skipped or failed; continuing boot."

npm run start
