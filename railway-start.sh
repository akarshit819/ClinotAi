#!/bin/sh
set -e

npx prisma db push --skip-generate

# Opt-in: create/verify the clearly-marked dev/test user on every boot.
# Only runs when CLINOT_DEV_SEED=true is set in the Railway environment.
if [ "$CLINOT_DEV_SEED" = "true" ]; then
  echo "[railway] CLINOT_DEV_SEED is enabled - ensuring dev/test user exists..."
  npx tsx src/seed-dev-user.ts || echo "[railway] Dev seed skipped or failed; continuing boot."
fi

npm run start
