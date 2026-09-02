# Clinot — Render Deployment Runbook

Authoritative environment configuration, verified against the code at
`src/**`, `scripts/**`, `prisma/schema.prisma` and the boot scripts.
Every variable below is actually referenced by the code — nothing is guessed.

## Architecture

```
Render PostgreSQL (one instance)
        │  same DATABASE_URL
        ├── Web Service (clinot-ai)   Build: npm ci && npm run build
        │                             Start: npm run start
        │                             Health: /api/health
        │                             → generate → migrate → seed → standalone server
        └── Worker Service            Build: npm ci
                                      Start: WORKER_MODE=true npm run start
                                      → validates env, waits for PG, polls Job table forever
```

- **Migrations run on the Web service only.** The worker boot branches to the
  worker before any migration/seed step, so simultaneous boots cannot race.
- **No Redis.** `REDIS_URL` is read by `src/lib/env.ts` but consumed by
  nothing — the queue is the PostgreSQL `Job` table.
- The standalone Next.js server is started with `HOSTNAME=0.0.0.0` forced by
  the boot orchestrator, so it binds the platform-routable interface.

## Required environment variables

### Web service

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | YES | Render PostgreSQL **Internal Database URL** (`postgresql://...`) |
| `JWT_SECRET` | YES | Session/token signing — prod refuses to start without it (32+ chars) |
| `ENCRYPTION_KEY` | YES | AES-256-GCM for stored credentials (32+ chars) — **keep the existing value once credentials are stored** |
| `NEXT_PUBLIC_APP_URL` | YES | Must be the exact Render public URL — used by CSRF same-origin checks (middleware), auth emails, OAuth, WhatsApp webhook registration |
| `META_APP_SECRET` | YES (for WhatsApp inbound) | Webhook HMAC signature verification |
| `WA_WEBHOOK_SECRET` | YES (for WhatsApp inbound) | `hub.verify_token`; same value is pasted into Meta |
| `OPENROUTER_API_KEY` or `OPENAI_API_KEY` | YES (for live AI replies) | Platform AI provider — OpenRouter wins whenever it is set |
| `PORT` | Platform | Injected by Render; never hardcode |

### First boot only (web) — REMOVE after first successful login

| Variable | Value |
|---|---|
| `CLINOT_BOOTSTRAP_ADMIN` | `true` |
| `BOOTSTRAP_ADMIN_EMAIL` | your login email |
| `BOOTSTRAP_ADMIN_PASSWORD` | your strong password (strength-validated, never logged) |
| `BOOTSTRAP_ADMIN_NAME` | optional (default `Admin`) |
| `BOOTSTRAP_CLINIC_NAME` | optional (default `Clinot Dental Clinic`) |
| `BOOTSTRAP_CLINIC_COUNTRY` | optional (default `US`) |
| `BOOTSTRAP_CLINIC_TIMEZONE` | optional but recommended (default `America/New_York`) — booking availability depends on it |

### Worker service

| Variable | Required |
|---|---|
| `DATABASE_URL` | YES — **identical to the web service** |
| `WORKER_MODE` | `true` — must be **unset/false on the web service** |
| AI key + WhatsApp credentials | Needed only at job-execution time; a missing credential fails that job (with retries), never the worker boot |
| `PORT` / `HEALTH_PORT` | Optional — enables the worker's embedded `/health` endpoint |

### Optional

- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`
  (all three together enable boot-time auto-provisioning),
  `WHATSAPP_BUSINESS_ID` (auto-resolved), `META_APP_ID` (OAuth),
  `META_WA_CONFIG_ID` (embedded signup), `META_GRAPH_API` (default
  `https://graph.facebook.com/v20.0`)
- `STRIPE_SECRET_KEY`, `STRIPE_STARTER_PRICE_ID`,
  `STRIPE_PROFESSIONAL_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`, `FROM_EMAIL` (required for forgot-password/verify-email
  email delivery)
- `GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET` (calendar)
- `CSRF_SECRET` (falls back to `JWT_SECRET`), `LOG_LEVEL`,
  `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_APP_VERSION`
- `PICO_LLM_API_URL` (fallback LLM)

### Never set in production

- `CLINOT_SEED_DEMO`, `CLINOT_DEV_SEED`, `CLINOT_DEV_USER_PASSWORD`
  (dev/demo seeds)
- `SQLITE_DATABASE_URL` (one-time import tool only)
- Do **not** copy `DATABASE_URL` or `NEXT_PUBLIC_APP_URL` from Railway/Voroa.

## Secret generation

Generate each value independently (never reuse one value for multiple vars):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`WA_WEBHOOK_SECRET` is self-generated and then pasted as the verify token in
the Meta webhook configuration.

## Deployment order

1. Create the Render PostgreSQL instance.
2. Set all Web env vars (including the first-boot bootstrap tier).
3. Deploy the Web service — build, then boot runs:
   `prisma generate` → `prisma migrate deploy` → `seed-system` (fatal on
   failure) → optional admin bootstrap (fatal on failure when enabled) →
   optional WhatsApp provisioning → standalone server binds `PORT`.
4. Verify `GET /api/health` returns 200 `healthy`.
5. Log in at `/login`; then remove `CLINOT_BOOTSTRAP_ADMIN` and redeploy.
6. Create the Worker service (`WORKER_MODE=true npm run start`).
7. Configure the Meta webhook:
   `https://<render-url>/api/webhooks/whatsapp`, verify token =
   `WA_WEBHOOK_SECRET`.

## Validation evidence

Verified against a live PostgreSQL instance and the production-only
dependency path (`npm ci --omit=dev && npm run build`):

- fresh-DB `prisma migrate deploy` — all migrations apply
- `seed-system` — idempotent (30 permissions / 3 plans / 1 template, zero
  duplicates), safe under concurrent boots, 90s stall watchdog
- full `npm run start` boot → standalone server → `/api/health` 200 healthy
- `typecheck` clean, 177/177 tests, production build passes
