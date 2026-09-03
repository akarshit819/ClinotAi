# Clinot — Render Deployment Runbook

Authoritative environment configuration, verified against the code at
`src/**`, `scripts/**`, `prisma/schema.prisma` and the boot scripts.
Every variable below is actually referenced by the code — nothing is guessed.

## Architecture (single service)

```
Render PostgreSQL (one instance)
        │ DATABASE_URL
        └── Web Service (clinot-ai)      Build:  npm ci && npm run build
                                       Start:  npm run start
                                       Health: /api/health
            │
            └── scripts/start-production.js  (Node-level launcher)
                  │
                  ├── prisma generate
                  ├── prisma migrate deploy
                  ├── system / admin / dev / WhatsApp seeds
                  ├── start internal job processor (in this Node process)
                  │       → WhatsApp queue, AI processing, outbound
                  │         messages, retries/backoff, dead-letter,
                  │         stale-job recovery
                  └── spawn node .next/standalone/server.js (Next.js)
```

- **No separate worker service is required.** One web service runs
  everything. `npm run start` invokes `scripts/start-production.js`,
  which starts the internal job processor in the SAME Node process
  and then spawns the Next.js production server as a child. The
  launcher owns SIGTERM/SIGINT: it forwards the signal to the Next.js
  child and drains in-flight jobs before exit.
- **Migrations run at web-service boot**, before the server starts
  (`prisma generate` → `prisma migrate deploy` → seeds → worker + web).
- **No Redis.** `REDIS_URL` is read by `src/lib/env.ts` but consumed by
  nothing — the queue is the PostgreSQL `Job` table, which is the source of
  truth. PENDING jobs survive restarts; stale PROCESSING jobs are recovered.
- The standalone Next.js server is started with `HOSTNAME=0.0.0.0` forced by
  the boot orchestrator, so it binds the platform-routable interface.
- Optional: a dedicated standalone worker (`npm run worker`) still exists for
  unusual scaling needs; set `CLINOT_DISABLE_INTERNAL_WORKER=true` on the web
  service if you run one, to avoid duplicate polling loops (claiming is
  atomic, so two processors are safe — just redundant).

### Why the worker is started from the launcher, not from `instrumentation.ts`

Next.js 14 compiles `src/instrumentation.ts` for BOTH the Node.js and
the Edge runtimes. Webpack statically resolves every reachable import
— including dynamic `import("...")` calls with literal string
arguments. The worker module's dependency graph (Prisma,
`@/integrations/token-store` → `crypto`, `@/lib/encryption` → `crypto`,
`@/messaging/pipeline`, etc.) is Node-only, and starting the worker
from `instrumentation.ts` would force the Edge runtime's compilation
graph to attempt resolving Node built-ins like `crypto` and `http`,
breaking the production build with `Module not found: Can't resolve
'crypto' / 'http'`.

By starting the worker in the production launcher — a pure Node.js
script that Webpack never touches — the worker's Node-only module
graph stays entirely outside the Next.js compilation pipeline. The
runtime contract is preserved: one service, one boot command, one
health endpoint, one restart unit, one process tree.

`src/instrumentation.ts` remains in place because
`experimental.instrumentationHook: true` is set in `next.config.js`,
but it only validates production secrets. It imports no Node built-ins
and no worker code, so it is safe in the Edge runtime.

## Required environment variables

### Web service (the only service)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | YES | Render PostgreSQL **Internal Database URL** (`postgresql://...`) — also backs the job queue |
| `JWT_SECRET` | YES | Session/token signing — prod refuses to start without it (32+ chars) |
| `ENCRYPTION_KEY` | YES | AES-256-GCM for stored credentials (32+ chars) — **keep the existing value once credentials are stored** |
| `NEXT_PUBLIC_APP_URL` | YES | Must be the exact Render public URL — used by CSRF same-origin checks (middleware), auth emails, OAuth, WhatsApp webhook registration |
| `META_APP_SECRET` | YES (for WhatsApp inbound) | Webhook HMAC signature verification |
| `WA_WEBHOOK_SECRET` | YES (for WhatsApp inbound) | `hub.verify_token`; same value is pasted into Meta |
| `OPENROUTER_API_KEY` or `OPENAI_API_KEY` | YES (for live AI replies) | Platform AI provider — OpenRouter wins whenever it is set |
| `PORT` | Platform | Injected by Render; never hardcode |

### First boot only — REMOVE after first successful login

| Variable | Value |
|---|---|
| `CLINOT_BOOTSTRAP_ADMIN` | `true` |
| `BOOTSTRAP_ADMIN_EMAIL` | your login email |
| `BOOTSTRAP_ADMIN_PASSWORD` | your strong password (strength-validated, never logged) |
| `BOOTSTRAP_ADMIN_NAME` | optional (default `Admin`) |
| `BOOTSTRAP_CLINIC_NAME` | optional (default `Clinot Dental Clinic`) |
| `BOOTSTRAP_CLINIC_COUNTRY` | optional (default `US`) |
| `BOOTSTRAP_CLINIC_TIMEZONE` | optional but recommended (default `America/New_York`) — booking availability depends on it |

### Optional

- `CLINOT_DISABLE_INTERNAL_WORKER=true` — only when running a separate
  dedicated worker process (`npm run worker`)
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
- `WORKER_MODE` no longer exists — remove it if it lingers from an old
  deployment copy.

## Secret generation

Generate each value independently (never reuse one value for multiple vars):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`WA_WEBHOOK_SECRET` is self-generated and then pasted as the verify token in
the Meta webhook configuration.

## Deployment order

1. Create the Render PostgreSQL instance.
2. Set all env vars (including the first-boot bootstrap tier).
3. Deploy the web service — build, then boot runs:
   `prisma generate` → `prisma migrate deploy` → `seed-system` (fatal on
   failure) → optional admin bootstrap (fatal on failure when enabled) →
   optional WhatsApp provisioning → standalone server binds `PORT` and
   starts the internal job processor.
4. Verify `GET /api/health` returns 200 `healthy` (the response includes a
   `jobProcessor` section showing the internal processor's state).
5. Log in at `/login`; then remove `CLINOT_BOOTSTRAP_ADMIN` and redeploy.
6. Configure the Meta webhook:
   `https://<render-url>/api/webhooks/whatsapp`, verify token =
   `WA_WEBHOOK_SECRET`.

## Validation evidence

Verified against a live PostgreSQL instance and the production-only
dependency path (`npm ci --omit=dev && npm run build`):

- fresh-DB `prisma migrate deploy` — all migrations apply
- `seed-system` — idempotent (30 permissions / 3 plans / 1 template, zero
  duplicates), safe under concurrent boots, 90s stall watchdog
- single-service `npm run start` boot → standalone server + internal job
  processor → `/api/health` 200 healthy with processor status
- `typecheck` clean, 177/177 tests, production build passes
