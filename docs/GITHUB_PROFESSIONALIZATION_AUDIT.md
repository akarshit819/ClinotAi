# Clinot AI — GitHub Professionalization Audit

> Phase 1 only. Read-only audit of the existing repository. No application code was modified to produce this report.
> Audit date: 2026-10-04. Repo: `dentalpilot-ai` (`clinot-ai@1.0.0`, `private: true`). Remote: `github.com/akarshit819/ClinotAi.git`, branch `main` (311 tracked files). Working tree clean at `60d7ddc` at time of audit.

## 1. Project Overview

Clinot AI is an existing, actively-built AI-assisted dental clinic management and patient-communication platform. Verified scope (from source, not marketing):

- Multi-tenant clinic workspaces (clinic-scoped users, roles, patients, appointments, conversations, services, FAQs, leads, integrations, billing records).
- Custom JWT + DB-session authentication with role-based permissions (owner / admin / staff + permission codes).
- Next.js 14 App Router web app: public marketing/site pages, auth pages, clinic dashboard, patient chat widget, and ~47 API routes (auth, appointments, inbox, knowledge, leads, integrations, billing, messaging ingest, webhooks for WhatsApp/Messenger/Instagram/Telegram/Stripe, health, chat).
- Single AI provider path: OpenRouter gateway with env-driven primary + fallback model chain, deterministic guardrails, dental-domain allowlist with typo tolerance, DB-backed fallback responses, and per-clinic AI usage tracking.
- Messaging pipeline with a PostgreSQL-backed job queue and single-service background worker (WhatsApp inbound/outbound is the real path; Messenger/Instagram connectors exist; Telegram webhook is a stub).
- Stripe billing integration (plans, subscriptions, checkout/portal, webhook handlers, billing history, feature gating).
- Production boot orchestrator (`scripts/start-production.js`): Prisma generate → migrate deploy → system/admin/WhatsApp seeds → internal worker + Next.js standalone server. Deploy targets documented for Railway/Voroa/Render.

What this is not: there is no evidence of a live multi-customer production deployment with real patient data, no SLA/uptime claims verified, no mobile apps, no calendar sync implementation found, and no separate microservices — it is a single-service monolith by design.

## 2. Current Architecture

Verified single-service monolith (no Redis, no separate worker service required):

```text
Browser / Meta webhooks / Stripe webhooks
  → Next.js 14 App Router (Node standalone server)
    → Edge middleware (headers, rate-limit subset, CSRF origin check, presence-only auth gate)
    → API routes (per-route JWT verify + clinic-scoped Prisma queries)
    → Prisma 5.20 → PostgreSQL (migrations, clinicId FK isolation, no RLS)
    → Job table queue → internal worker process (same boot unit)
    → OpenRouter (single LLM gateway) / Stripe / Meta Graph API / Resend email
```

Key components (verified paths):

- Frontend: `src/app/(site)/` marketing pages, `src/app/login|signup|onboarding|chat`, `src/app/dashboard/*` (overview, appointments, patients, inbox, knowledge, integrations, analytics, api-config, settings/ai-providers, billing, usage, widget, website-integration), `src/components/`, `src/hooks/`, `src/contexts/`.
- Backend: `src/app/api/*` routes; domain logic in `src/lib/` (auth, billing, appointment, ai, jobs, security, messaging policy), `src/messaging/` (engine, pipeline, AI receptionist router, patient identity, inbox, notifications), `src/integrations/` (whatsapp/messenger/instagram connectors + telegram helper, token-store), `src/features/`, `src/config/`.
- Jobs: `src/lib/jobs/queue.ts` (PostgreSQL `Job` table: PENDING/PROCESSING/COMPLETED/FAILED/DEAD_LETTER, idempotencyKey unique, stale recovery) + `src/lib/jobs/worker.ts` (2s poll, exponential backoff to 30s, handles PROCESS_INBOUND_MESSAGE / SEND_WHATSAPP_MESSAGE; appointment booking/notification handlers are noop logs).
- Boot: `railway-start.sh` / `voroa-start.sh` are identical thin wrappers → `node scripts/start-production.js` (446 lines, single source of truth). `src/instrumentation.ts` only validates secrets (Edge-safe by design; worker intentionally not started there).
- Auth: custom HS256 JWT (manual base64url + HMAC-SHA256 via `crypto.subtle`), 15m access / 7d refresh / 30d session / 90d remember-me, SHA256 token-hash storage, refresh rotation with family revoke-all, argon2id primary + bcrypt legacy auto-rehash, 5-fail lockout 15m, 10+char strong passwords. `registerClinic()` split into two short transactions (Supabase/PgBouncer P2028 mitigation); `ensureClinicRoles()` uses batch `createMany`.
- Security layers: `src/lib/security/` (csrf, rate-limit, headers/CSP, sanitize, prompt-guard, audit), `src/middleware.ts` (under `src/`, non-standard location but supported), `next.config.js` headers, `src/lib/tenant-context.ts` (AsyncLocalStorage tenant + permission checks, owner bypass).

## 3. Technology Stack

Verified from `package.json`, configs, and source (not README claims):

| Layer | Reality |
|---|---|
| Framework | Next.js `^14.2.15`, React 18.3, TypeScript `^5.6.2` (`strict: true`), App Router |
| Styling | Tailwind `^3.4.13`, `tailwind-merge`, `clsx`, `class-variance-authority`, `lucide-react` icons |
| Database | PostgreSQL via Prisma `^5.20.0`; 4 migrations; `prisma/schema.prisma` is source of truth; stale `prisma/schema.sqlite.prisma` retained for one-time import |
| Auth | Custom JWT + sessions (no NextAuth); `hash-wasm` argon2id + `bcryptjs` legacy; no passkeys/OAuth login for users |
| AI | OpenRouter HTTPS only (`openrouter.ai/api/v1/chat/completions`); no OpenAI/Anthropic SDKs; `zod` for tool schemas; in-memory BM25 RAG helper |
| Messaging | Meta Graph API (WhatsApp/Messenger/Instagram), website widget; `nodemailer` + Resend for email |
| Billing | `stripe@^22.3.2` full provider + Prisma plans/subscriptions |
| Dates | `date-fns@^4.4.0`, `date-fns-tz@^3.2.0` |
| Runtime/deploy | `output: standalone`, `tsx`, `pg@8.23.0` pinned, NIXPACKS/Railway + Render runbook; no Dockerfile |
| Quality | `vitest@^4.1.10` (29 test files), `eslint@8.57 + eslint-config-next` (no config file), `prettier@3.3 + tailwind plugin` (no config file) |
| NOT present (despite adjacent claims) | Recharts (claimed in `AGENTS.md`, absent from `package.json`), OpenAI/BuildPico providers (removed), Redis (referenced `REDIS_URL` read but consumed by nothing), Telegram pipeline, calendar sync implementation, Docker/CI workflows |

Runtime: Node.js. Package manager: npm (`package-lock.json` tracked). Private package (`private: true`) — correct for now; must be flipped deliberately if open-sourcing.

## 4. Implemented Features

Verified in code (route/model/logic exists, not just README text):

1. Clinic workspace: clinic profile, contact/address/timezone/language/branding, business hours, services, FAQs/knowledge base, clinic template seeding.
2. Auth lifecycle: signup (`registerClinic` + clinic + 3 system roles + owner user), login/logout, refresh rotation, sessions list/revoke, change/forgot/reset password, verify-email tokens, account lockout, audit events.
3. RBAC: `Role/Permission/RolePermission` tables, `DEFAULT_ROLE_PERMISSIONS` (owner/admin = all ~30 codes; staff = 16-code subset), `requirePermission` tenant context with owner bypass.
4. Appointments: CRUD API, status workflow, deterministic state machine + slot filling, availability helpers, soft-delete (`isDeleted/deletedAt`), unique slot guard (`clinicId/doctor/date/time`), cancel notifications, WhatsApp E2E booking tests.
5. Patients: records with phone/email/notes, platform profiles, conversation/appointment/lead links.
6. Conversations/inbox: conversation + message models, status/intent/confidence/emergency metadata, unread counts, inbound pipeline, outbound sanitization, inbox APIs + dashboard.
7. AI receptionist: 10-route deterministic router (EMERGENCY > APPOINTMENT_START > SLOT_ANSWER > INTERRUPTION > CANCEL > RESCHEDULE > CLINIC > INSURANCE > SYMPTOM > GENERAL), appointment draft in conversation metadata, OpenRouter failover with per-model cooldown, guardrails (length/gibberish/spam/abuse/emergency/medical/off-topic), dental-domain allowlist + Hinglish + fuzzy typo tolerance (Levenshtein ≤2), DB-backed fallback templates, usage tracking.
8. Messaging integrations: WhatsApp (verify GET, HMAC POST, phone-number → clinic resolution, idempotent job enqueue, rate-limited send), Messenger/Instagram connectors + webhooks, website widget/chat APIs, ingest API.
9. Billing: DB-driven plans, Stripe customer/checkout/portal/cancel/reactivate/plan-change/invoices, 9 webhook handlers with `StripeEvent` idempotency, billing history + emails, `canProcessMessaging` feature gate (lenient: no subscription = allowed).
10. Ops: `/api/health` (DB `SELECT 1` + job processor status), `bootstrap-admin` (gated opt-in owner creation), `seed-system` (idempotent permissions/plans/template, 90s watchdog), `seed-whatsapp` (idempotent WABA attach), SQLite→Postgres import tool, `check-admin` script, postbuild standalone asset copy.
11. Security baseline: security headers, prod CSP helper, CSRF origin checks, rate limits on login/signup/chat, webhook signature verification (WhatsApp/Stripe), audit log with partial redaction, encrypted credential store path (`ENCRYPTION_KEY` AES-256-GCM).

## 5. Partially Implemented Features

Honest gaps where code exists but behavior is incomplete, stubbed, or disconnected:

1. Telegram webhook (`src/app/api/webhooks/telegram/route.ts`): validates secret, finds any telegram integration, parses update + logs only. Never enqueues jobs, never resolves clinic by token, no reply path. `src/integrations/telegram.ts` send/setWebhook helpers exist but are not wired to the messaging pipeline.
2. RAG wiring: `src/lib/ai/rag.ts` (in-memory BM25, topK=5) is real but its result (`ragContext`) is never interpolated by `buildSystemPrompt()` — computed context is dropped. Only `fallback.ts` consumes RAG results.
3. LLM tool calling: `src/lib/ai/tools.ts` (APPOINTMENT_TOOLS, zod→JSON schema, `executeToolCall`) is real but unused in the production receptionist path (`includeTools: false`; booking is deterministic via `appointment-state` + `booking.ts`).
4. Appointment booking/notification jobs: `PROCESS_APPOINTMENT_BOOKING` / `SEND_APPOINTMENT_NOTIFICATION` handlers are noop logs in `worker.ts`.
5. Calendar sync: `GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET` mentioned in deployment docs; no implementation verified in this audit — treat as not implemented until proven.
6. Analytics: `/api/analytics` + dashboard page exist but were not functionally verified in this audit; do not showcase until verified.
7. SQLite compatibility: `prisma/schema.sqlite.prisma` is stale (missing `Job`, webhook event tables, `Appointment.endTime/isDeleted/deletedAt`, unique constraints). `db:import:sqlite` will silently drop those — one-time tool only, not a supported dual-DB mode.
8. Email delivery: forgot-password/verify-email require `RESEND_API_KEY`/`FROM_EMAIL`; without them the flows fail per-request (warn-only at boot).

## 6. Repository Structure

Actual top-level layout (`dentalpilot-ai/`):

```text
src/app/            # site pages, auth pages, dashboard pages, 47 API routes
src/components/ src/hooks/ src/contexts/ src/features/ src/config/
src/lib/            # auth, db, env, ai/, appointment/, billing/, jobs/, security/, messaging/
src/messaging/      # engine, pipeline, ai/ router, patient/, inbox/, notifications/
src/integrations/   # whatsapp/messenger/instagram connectors + telegram helper + token-store
src/types/ src/middleware.ts src/instrumentation.ts
src/bootstrap-admin.ts src/seed*.ts (system/demo/dev/whatsapp)
prisma/             # schema.prisma, schema.sqlite.prisma (stale), migrations/ (4), dev.db (ignored)
scripts/            # start-production.js, postbuild.js, check-admin.ts, import-sqlite-to-postgres.ts
tests/              # 29 vitest files
docs/               # DATABASE.md, RENDER-DEPLOYMENT.md (this audit will be third)
public/brand/       # clinot-logo.png (single asset)
 railway-start.sh, voroa-start.sh, railway.json, .dockerignore
 package.json, tsconfig.json, vitest.config.ts, next.config.js, tailwind/postcss
 AGENTS.md, README.md (truncated), .env, .env.example, .gitignore
```

Notable structure issues:

- `src/middleware.ts` instead of root `middleware.ts` (works but non-standard; surprises contributors).
- Dual deploy wrappers (`railway-start.sh` / `voroa-start.sh`) are byte-identical wrappers around one launcher — keep one canonical name or document why both exist.
- `certificates/` empty untracked dir; `.freebuff/` + `.sqlite-client/` local tool artifacts (correctly ignored, but confusing at root).
- Root hygiene files tracked that do not belong at root: `dev-test-css.html` (saved 404 snapshot), `test-whatsapp.ps1` (manual webhook tester with stale prod URL + dummy signature).
- `tsconfig.tsbuildinfo`, `.next/`, `node_modules/` present locally but correctly ignored (not tracked).
- `public/` has only one logo; no screenshots, architecture diagrams, favicon set, or OG images.

## 7. Security Findings

No secret values are printed in this report. Where a finding references credentials, only file/path + type are given.

- Committed secrets: none found in tracked source for high-confidence patterns (`sk-live`, `ghp_`, `AKIA`, private-key headers). `.env` (~2.4kB) exists locally but is untracked and correctly ignored (`git check-ignore` confirms). `.env.example` contains placeholders/empties only. `prisma/dev.db` exists locally, ignored, not tracked. Safe.
- Secret-adjacent logging (paths only, values masked): `src/seed.ts` logs demo email + generated password; `src/seed-dev-user.ts` logs test email + password in non-prod; `src/bootstrap-admin.ts` logs email only (safe); `scripts/start-production.js` logs presence booleans + host/dbname only (safe). No `DATABASE_URL`/`JWT_SECRET`/`OPENROUTER_API_KEY` values logged. `src/lib/logger.ts` writes to console in all envs — keep sensitive payloads out of it.
- Dev fallback secrets: `src/lib/env.ts` hardcodes dev-only `JWT_SECRET`/`ENCRYPTION_KEY` fallbacks and `CSRF_SECRET` falls back to `JWT_SECRET`. Prod throws when unset (correct), but any prod ever booted with fallbacks must rotate. `CSRF_SECRET` missing from `.env.example` while required in prod validation — P1 gap.
- Middleware/auth gaps: edge middleware checks only `access_token` cookie presence (no signature verify; deferred to routes) — a stolen/expired token passes edge. CSRF check skips when both `Origin`/`Referer` are missing. `x-access-token` response header echoes the cookie on dashboard paths. Per-route `verifyAccessToken` + `requirePermission` coverage was spot-checked only — needs a systematic route audit before public launch.
- Concrete bugs: `src/middleware.ts:42-44` builds CSP via `Object.entries()` on a string (`getCSPDirectives()` returns string) — production CSP is malformed. `getCorsHeaders()` joins origins with comma (invalid with credentials). `XSS-Protection: 0` + CSP `unsafe-inline/unsafe-eval` weaken XSS posture. `COEP: require-corp` can break Google Fonts without CORP headers. Bot regex blocks `curl/python` health checks on `/api/chat`.
- Rate limiting is in-memory `Map` (single instance, lost on restart, no multi-instance sharing). Authenticated API abuse (`api 100/15min`) is defined but only login/signup/chat are enforced in middleware.
- Sanitization is regex-based (`sanitizeHtml`) — bypassable; not a substitute for DOMPurify + zod. Prompt-guard has 21 broad regexes with false-positive risk (`write code`, `output json`, `you are a ... assistant`); leakage detector can return raw slices into logs. Audit redaction misses `secret/jwt/DATABASE_URL/OPENROUTER_API_KEY/WHATSAPP_*` keys and is fail-open.
- Data-model risks: no Postgres RLS — isolation depends on every query scoping `clinicId` (webhook/audit tables have bare `clinicId` with no FK). `User.email` globally unique blocks same email across clinics. `Appointment` slot uniqueness is string-based and bypassable with `NULL doctor`; no true overlap exclusion. Several relations lack `onDelete` (`User.role`, `ConversationMessage.conversationId`, `Appointment/Lead.patientId`, billing parents) — deletes fail or orphan. `Integration.credentials` is `String?` — verify encryption-at-rest via token-store before claiming SOC2-adjacent posture.
- Client exposure: `NEXT_PUBLIC_*` limited to `APP_URL`, `GA_ID`, `APP_VERSION` (no secret leak). Risk is functional: empty `NEXT_PUBLIC_APP_URL` disables CSRF origin checks.

## 8. Documentation Problems

- `README.md` (~7.4kB, 219 lines) ends mid-sentence at `Language` — truncated. TOC promises Contributing/License with no bodies. Long feature exposition, weak on env/commands/deploy compared to `AGENTS.md` + `docs/`. No badges, screenshots, architecture diagram, status honesty (does not say what is stubbed), or env table.
- `AGENTS.md` inaccuracies: claims Recharts (not installed), implies SQLite dev default while preaching Postgres migrations (`.env.example` `DATABASE_URL=file:./dev.db`), omits single-service worker launcher detail and Railway/Voroa wrappers.
- `docs/` has only 2 files, both good (`DATABASE.md` ~95 lines, `RENDER-DEPLOYMENT.md` ~175 lines, both verified against code). Missing: `ARCHITECTURE.md`, `AI.md`, `SECURITY.md`, `DEPLOYMENT.md` consolidation (Render doc exists; Railway/Voroa boot is code-commented but not a doc), API reference, webhook setup guides, screenshots.
- No `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md` — auto-fail for portfolio-grade open source.
- No `.github/` (no issue/PR templates, no CI workflows, no dependabot, no codeowners).
- Env docs drift: `CSRF_SECRET` required but undocumented; `OPENROUTER_MODEL` not validated (silent fallback); Stripe price IDs present but not validated; `REDIS_URL` read but unused; `WORKER_MODE` referenced as removed (good) but may linger in old deploy copies.

## 9. GitHub Presentation Problems

- No repository metadata prepared: description, topics (`nextjs`, `dental`, `ai-receptionist`, `whatsapp`, `prisma`, `stripe`), homepage/demo URL, license, releases, or social preview image.
- README has no hero, badges (build/test/license), live-demo link verification, screenshots, architecture diagram, project structure, or honest limitations/roadmap.
- Zero visual evidence: one logo (`public/brand/clinot-logo.png`), no `docs/screenshots/`, no architecture images, no demo GIF/video, no favicon/OG set.
- No CI badge possible (no CI). `npm run lint` uses deprecated `next lint`; no format/test coverage scripts; `private: true` blocks public packaging signals.
- Commit history is functional but not portfolio-curated (recent P2028 fixes, dashboard cleanup, audit commits). No tags/releases, no changelog, no contribution guidance — looks like a private build, not an open-source product.
- Tracked clutter at root (`dev-test-css.html`, `test-whatsapp.ps1`) signals unfinished cleanup to any recruiter browsing files.

## 10. Code Quality Findings

- TypeScript `strict: true` is good, but `tsconfig.json` excludes `scripts`, `tests`, and `test*.ts` — production launcher and all tests are untypechecked. `skipLibCheck` + `allowJs` are acceptable for Next.js.
- No ESLint/Prettier configs despite installed deps (`eslint`, `eslint-config-next`, `prettier`, `prettier-plugin-tailwindcss`). `npm run lint` = `next lint` (deprecated in Next 14). No `format`, `lint:fix`, or `test:coverage` scripts.
- Migration health is currently OK (4 additive/idempotent migrations, `migrate deploy` at boot) but history shows reactive patching (missing tables hot-fixed; appointment `endTime` added after a prod incident; soft-delete follow-up). `schema.sqlite.prisma` drift is the sharpest edge — either sync or delete it.
- Test suite is a strength: 29 files, hermetic OpenRouter mocking (`OPENROUTER_API_KEY=""`), sequential file execution, gated real-provider test, production replay tests. Last verified state per prior work: typecheck clean, 622 passed / 11 skipped, build 83/83 pages. (Re-verify in Phase 2; not re-run in this read-only audit.)
- Code smells to address carefully (no large refactors): `console.*` in 89 places in `src` (use `logger`), `String?` JSON columns vs `Json` type inconsistency (`Plan.features` vs `Job.payload`), `ApiConfig.model` default `gpt-4o` vs OpenRouter-only reality, `doctor/preferredDate/preferredTime` as strings, duplicate bot regexes, duplicate start wrappers, `getRoleByName`-style lookups without caching (verify before claiming perf issues).

## 11. Developer Experience Findings

- Setup is documented (`npm install`, `npm run setup`, `npm run dev`) and boot is robust (generate → migrate → seeds → worker → server with clear logs). This is better than most early-stage repos.
- Gaps: no `.nvmrc`/engines (Node version unpinned), no Docker for local Postgres (dev defaults to SQLite file while prod is Postgres — highest DX footgun), no `format` script, no editorconfig, no VSCode recommendations, no Makefile/task runner, no seed/reset one-liners for Postgres-local dev, no API client collection (Postman/Bruno/Thunder), no webhook tunneling guide (ngrok/cloudflared for Meta), no troubleshooting section.
- `.env.example` is close but missing `CSRF_SECRET` and under-documents `OPENROUTER_FALLBACK_MODELS`, Stripe price wiring, and WhatsApp boot provisioning trio.
- `npm run setup` uses `prisma db push` (correct for local throwaway, dangerous if copied to prod — docs warn correctly, but the script name invites misuse).
- Windows contributors: `railway-start.sh`/`voroa-start.sh` are `sh` scripts; local dev is `next dev` so fine, but document WSL/Git-Bash expectation for script contributors.

## 12. Missing Professional Assets

Confirmed absent (checked `git ls-files` + filesystem):

- `LICENSE` (any) — blocks all open-source reuse signals.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`.
- `.github/` — no `workflows/ci.yml`, `dependabot.yml`, `ISSUE_TEMPLATE/`, `pull_request_template.md`, `CODEOWNERS`.
- `Dockerfile` / `docker-compose.yml` (only `.dockerignore` exists).
- `.eslintrc*` / `eslint.config.*`, `.prettierrc*`, `.editorconfig`, `.nvmrc`.
- Screenshots/demo media: no `docs/screenshots/`, `docs/architecture/`, demo GIF, OG image, favicon set.
- API reference, webhook setup guides, architecture diagram (Mermaid or image), status page, roadmap file.
- Badges, releases/tags, discussion/Q&A scaffolding.

## 13. Recommended Improvements

Smallest reasonable changes only; no rewrites, no fabricated features.

- P0-1 Docs honesty: rewrite README from verified functionality only; explicitly mark Telegram/RAG-tools/calendar/analytics as stubbed or unverified; finish truncated sections; add env table with `CSRF_SECRET`; fix `AGENTS.md` Recharts + SQLite claims.
- P0-2 Security correctness: fix middleware CSP construction bug; remove `x-access-token` echo; tighten CSRF missing-origin path (fail-closed for state-changing routes or document why open); fix `getCorsHeaders` multi-origin; add `HSTS` to `next.config.js` headers; expand audit redaction keys; systematic per-route auth/tenant audit.
- P0-3 Governance: add `LICENSE` (choose MIT vs Apache-2.0 vs proprietary — decision required), `SECURITY.md` (report path + supported versions), `.github/` templates + minimal CI (install → typecheck → tests → build).
- P1-1 Config hygiene: add missing ESLint/Prettier configs or remove deps; add `format` script; include `scripts` in typecheck (separate config if needed); add `.nvmrc`; document Postgres-local dev (Docker compose or connection string) and deprecate SQLite default in `.env.example` comments.
- P1-2 Repo cleanup: move `dev-test-css.html` → `tests/fixtures/` or delete; move `test-whatsapp.ps1` → `tests/` tooling or delete; ignore or remove `certificates/`; sync or delete `schema.sqlite.prisma`; consolidate or document dual start wrappers.
- P1-3 Visuals: add `docs/screenshots/` with real captures (dashboard, appointments, inbox, AI chat, integrations), architecture Mermaid in `docs/ARCHITECTURE.md`, honest `docs/AI.md` (provider, failover, guardrails, RAG gap), `docs/SECURITY.md` (auth, tenant isolation, secrets, limitations), `docs/DEPLOYMENT.md` consolidation, `CHANGELOG.md`, realistic `ROADMAP.md`.
- P2: rate-limit abstraction (document single-instance limit; add Redis option later, not now), replace regex sanitizer with DOMPurify/zod where user HTML renders, constant-time CSRF HMAC compare, `ConversationMessage` cascade policy decision, `Appointment` overlap hardening (document, then constrain), `User.email` per-clinic uniqueness evaluation (major migration — roadmap only), `ApiConfig.model` default alignment, `String?` JSON normalization (new columns, not rewrites).
- P3: OG images, favicon set, social preview, badges polish, demo video, GitHub topics/description, releases/tags, discussions, sponsorship/funding metadata (only if relevant).

## 14. Priority Matrix

| ID | Item | Priority | Rationale |
|---|---|---|---|
| S-1 | Middleware CSP malformed (`Object.entries` on string) | P0 | Production security header is broken; small fix |
| S-2 | `x-access-token` echo + CSRF missing-origin bypass | P0 | Token/session handling weakness; verify + fix |
| S-3 | `CSRF_SECRET` required but missing from `.env.example` | P0 | Prod boot failure risk; docs/config fix |
| S-4 | Per-route auth/tenant audit (presence-only edge gate) | P0 | Cross-clinic leak is the top data risk (no RLS) |
| G-1 | Add `LICENSE` + `SECURITY.md` | P0 | Blocking for any public/portfolio claim |
| G-2 | Add `.github/` (CI workflow, issue/PR templates) | P0 | Recruiters check Actions + templates first |
| D-1 | Finish truncated README; honest capabilities/limitations | P0 | Currently ends mid-sentence; credibility risk |
| D-2 | Fix `AGENTS.md` false claims (Recharts, SQLite default) | P1 | Internal docs must match `package.json`/env |
| C-1 | Add ESLint/Prettier configs or remove deps; add `format` script | P1 | Installed-but-unconfigured looks unfinished |
| C-2 | Typecheck `scripts/` (separate config) + `.nvmrc` | P1 | Boot launcher is untypechecked; Node unpinned |
| C-3 | Postgres-local dev path; deprecate SQLite default | P1 | Dev/prod parity is the top DX footgun |
| H-1 | Remove/relocate `dev-test-css.html`, `test-whatsapp.ps1`; handle `certificates/` | P1 | Root clutter visible on GitHub landing |
| H-2 | Sync or delete stale `schema.sqlite.prisma` | P1 | Silent data loss in import tool |
| V-1 | Real screenshots + `docs/ARCHITECTURE.md` + `docs/AI.md` | P1 | Portfolio impact per effort is highest here |
| V-2 | `CHANGELOG.md` + realistic roadmap | P1 | Signals maintained product vs snapshot |
| Q-1 | `getCorsHeaders` fix, HSTS, audit redaction expansion | P1 | Small, safe hardening |
| Q-2 | Regex sanitizer + prompt-guard tuning (document limits) | P2 | Avoid over-claiming XSS/prompt security |
| M-1 | `Appointment` overlap + `NULL doctor` double-book | P2 | Needs migration design; document first |
| M-2 | Missing cascades / webhook FK orphans | P2 | Decide policy per table; migrate carefully |
| M-3 | `User.email` global uniqueness → per-clinic | P3 | Major migration; roadmap only, do not attempt now |
| M-4 | `String?` JSON columns normalization | P3 | New columns + backfill; cosmetic until then |

### Recommended implementation order (Phase 2, when authorized)

1. Decisions: license choice, public vs private, demo URL to showcase.
2. P0 security correctness (S-1, S-2, S-3) + systematic route auth audit (S-4) — smallest diffs first, tests after each.
3. Governance (G-1, G-2): `LICENSE`, `SECURITY.md`, `.github/` templates + minimal CI.
4. Docs honesty (D-1, D-2): complete README from verified features only, fix `AGENTS.md`, env table.
5. Config + hygiene (C-1, C-2, C-3, H-1, H-2, Q-1).
6. Visuals + architecture docs (V-1, V-2): screenshots, `ARCHITECTURE.md`, `AI.md`, `SECURITY.md` docs, `DEPLOYMENT.md`, `CHANGELOG.md`, roadmap.
7. P2/P3 hardening and migrations only with explicit approval per item.

> End of Phase 1. No application files were modified. Awaiting review/approval before Phase 2.
