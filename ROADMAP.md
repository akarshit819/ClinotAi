# Clinot AI — Roadmap

> Only items grounded in the actual codebase. Nothing here is promised on a timeline.

## Completed

- Multi-tenant clinic workspaces (Prisma/Postgres, clinic-scoped data, 4 migrations).
- Custom JWT + DB-session auth (argon2id, refresh rotation, lockout, sessions management).
- RBAC data model (owner/admin/staff, permission codes, system-role seeding with batch writes).
- Appointment workflows (state machine, slot filling, soft-delete, duplicate protection, WhatsApp E2E tests).
- Patient records linked to conversations, appointments, and leads.
- Conversation inbox (multi-channel threads, unread counts, statuses, staff replies).
- AI receptionist: deterministic 10-route router, dental-domain allowlist + Hinglish + typo tolerance,
  guardrails, OpenRouter primary/fallback failover, DB-backed fallbacks, usage tracking.
- WhatsApp integration (webhook verify + HMAC, fail-closed clinic resolution, idempotent queue, rate-limited send).
- Messenger/Instagram connectors + webhooks (signature-verified; tenant mapping incomplete — see below).
- Website chat + embeddable widget + messaging ingest API.
- Stripe billing (plans, checkout/portal, 9 webhook handlers, history, feature gating).
- Clinic knowledge base / FAQs / services with seeder and dashboard management.
- Analytics aggregations (conversations, leads, appointments, revenue) + dashboard page.
- Background job system (Postgres queue, backoff, dead-letter, stale recovery, single-service worker).
- Admin bootstrap + system/dev/WhatsApp seeders; SQLite→Postgres one-time import tool.
- Security foundation (Phase 2A): CSP fix, CSRF hardening, CORS fix, audit redaction, session ownership,
  HSTS, secret validation, full route audit, lint/format/CI groundwork.
- Docs foundation: audit, architecture/AI/security/deployment docs, honest README.

## In progress

- GitHub professionalization (Phase 2B): screenshots, templates, CI, metadata (this roadmap item).
- Webhook tenant attribution for Messenger/Instagram (first-enabled-row-wins today; map page/IG ID → clinic).
- Telegram: decide — complete pipeline wiring + HMAC verification, or remove the stub route.
- Instagram webhook secret unification (GET verify-token vs POST HMAC secret).

## Planned

- Authorization model decision: per-role `requirePermission` enforcement vs documented single-user assumption;
  `chat`/`checkout` `PUBLIC_PATHS` cleanup so the edge also enforces auth.
- RAG wiring: interpolate computed `ragContext` into the receptionist system prompt (or remove the dead path).
- Align `ApiConfig.model` default with the OpenRouter-only provider reality.
- Appointment overlap hardening (`NULL`-doctor double-book; exclusion constraint or documented policy).
- Missing `onDelete` policies (`User.role`, conversation messages, billing parents) — decide per table.
- Distributed rate limiting (Redis) when multi-instance deployment is needed.
- DOMPurify/zod where user HTML renders; constant-time CSRF HMAC compare.
- Separate `tsconfig.scripts.json` so seed/worker scripts are type-checked.
- Repo-wide prettier pass; root hygiene moves (`dev-test-css.html`, `test-whatsapp.ps1`); sync or retire
  `schema.sqlite.prisma`.

## Future (not committed)

- Per-clinic `User.email` uniqueness (major migration; needs design).
- `String?` JSON column normalization to Prisma `Json`.
- Calendar sync (Google/Microsoft) — env names exist in docs only; no implementation exists.
- LLM tool-calling in the production receptionist path (dormant code exists; deterministic booking works).
- Second AI provider for failover beyond OpenRouter models.
- Postgres RLS as defense-in-depth over application scoping.
