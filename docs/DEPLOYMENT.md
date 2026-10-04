# Clinot AI — Deployment

> Consolidated from the verified boot path (`scripts/start-production.js`, `railway-start.sh`,
> `voroa-start.sh`, `railway.json`). The Render-specific runbook with full env tables lives in
> [RENDER-DEPLOYMENT.md](RENDER-DEPLOYMENT.md) and remains authoritative for Render.

## 1. Requirements

- **Node**: `>=18.17` (`.nvmrc` pins `24`; verified locally on `v24.18.0`). Next.js 14, `output: standalone`.
- **Database**: one managed PostgreSQL instance. The app needs only `DATABASE_URL`.
- **No Redis, no separate worker service.** The queue is the Postgres `Job` table.

## 2. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (also backs the job queue). |
| `JWT_SECRET` | Yes (32+ chars) | Session/token signing. |
| `ENCRYPTION_KEY` | Yes (32+ chars) | AES-256-GCM for stored credentials — keep stable once set. |
| `CSRF_SECRET` | Yes (32+ chars) | CSRF token secret (falls back to `JWT_SECRET` in dev only). |
| `NEXT_PUBLIC_APP_URL` | Yes | Exact public URL — CSRF checks, emails, OAuth, webhook registration. |
| `META_APP_SECRET` | Yes (for inbound messaging) | Webhook HMAC verification. |
| `WA_WEBHOOK_SECRET` | Yes (for inbound messaging) | `hub.verify_token` pasted into Meta. |
| `STRIPE_SECRET_KEY` | Yes (for billing) | Stripe API + webhook construction. |
| `OPENROUTER_API_KEY` | For live AI replies | Single LLM provider key; without it all replies use fallback. |
| `OPENROUTER_MODEL` | For live AI replies | Primary model, always first. |
| `OPENROUTER_FALLBACK_MODELS` | Optional | Comma-separated fallback chain. |
| `STRIPE_STARTER_PRICE_ID` / `STRIPE_PROFESSIONAL_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` | For billing | Plans + webhook verification. |
| `RESEND_API_KEY` / `FROM_EMAIL` | For auth emails | Forgot-password / verify-email delivery. |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_WABA_ID` | For auto-provisioning | All three together link WhatsApp at boot. |
| `META_APP_ID` / `META_WA_CONFIG_ID` | Optional | OAuth + embedded signup. |
| `CLINOT_BOOTSTRAP_ADMIN` + `BOOTSTRAP_ADMIN_*` | First boot only | Creates the initial owner; remove after first login. |
| `PORT` | Platform-injected | Never hardcode. |
| `CLINOT_DISABLE_INTERNAL_WORKER` | Optional | Only when running a dedicated `npm run worker`. |

Never set in production: `CLINOT_SEED_DEMO`, `CLINOT_DEV_SEED`, `CLINOT_DEV_USER_PASSWORD`, `SQLITE_DATABASE_URL`.
Generate secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` — one
independent value per variable.

## 3. Production startup

`railway-start.sh` / `voroa-start.sh` are thin wrappers around `node scripts/start-production.js`:

1. `prisma generate`, then `prisma migrate deploy` (never `db push` in production — fails fast on drift).
2. Schema readiness check (raw query over core tables).
3. `seed-system` (idempotent permissions/plans/template; fatal on failure).
4. Optional `bootstrap-admin` (only when explicitly enabled; fatal on failure when enabled).
5. Optional WhatsApp provisioning (only when all three `WHATSAPP_*` vars are set).
6. Start the internal job processor, then spawn `node .next/standalone/server.js` with `HOSTNAME=0.0.0.0`.
7. Owns `SIGTERM`/`SIGINT`: forwards to the Next.js child and drains in-flight jobs.

Build: `npm ci && npm run build` (`postbuild` copies `public` + static assets into the standalone output).

## 4. Platforms

- **Railway**: `railway.json` (NIXPACKS, `npm run build`, start `sh railway-start.sh`, 60s healthcheck, 3 retries).
  Use Railway Postgres + backups; see [DATABASE.md](DATABASE.md).
- **Render**: web service + managed Postgres per [RENDER-DEPLOYMENT.md](RENDER-DEPLOYMENT.md) (`npm run start`,
  health check `/api/health`).
- **Voroa**: same wrapper contract as Railway (`voroa-start.sh`).

## 5. Health and verification

- `GET /api/health` returns DB status plus internal job-processor state. After deploy: 200 `healthy`, log in at
  `/login`, then remove `CLINOT_BOOTSTRAP_ADMIN` and redeploy.
- Meta webhook: `https://<app-url>/api/webhooks/whatsapp` with verify token = `WA_WEBHOOK_SECRET`.

## 6. Common problems

- **Boot refuses to start**: a required secret is missing/short — the error names the variable; generate and set it.
- **CSRF 403s in production**: `NEXT_PUBLIC_APP_URL` must exactly match the public URL (no trailing slash issues).
- **AI always falls back**: `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` unset — check logs for `fallbackReason`.
- **WhatsApp silent**: all three `WHATSAPP_*` vars required for auto-provision; `NEXT_PUBLIC_APP_URL` required for
  webhook registration; verify Meta webhook subscription afterwards.
- **Database drift**: restore from backup and let `migrate deploy` catch up; never hand-edit applied migrations.
- **Rotating `ENCRYPTION_KEY`**: invalidates stored integration credentials — reconnect integrations afterwards.
