# Clinot AI

**AI-powered dental clinic management and patient communication.**

Clinot gives dental clinics one workspace for appointments, patient records, a shared conversation inbox,
and an AI receptionist that answers routine questions and captures booking requests — over WhatsApp and
the website. Staff confirm everything; nothing is auto-confirmed.

![CI](https://github.com/akarshit819/ClinotAi/actions/workflows/ci.yml/badge.svg)

[Live Demo](https://clinot-ai.onrender.com) · [Documentation](docs/ARCHITECTURE.md) · [Roadmap](ROADMAP.md)

## What is Clinot?

Dental front desks answer the same questions all day — hours, pricing, insurance, availability — while new
patient inquiries arrive after hours over WhatsApp and the website. Clinot AI centralizes that work: one
clinic workspace with patient records, appointment requests, a shared conversation inbox, and an AI
receptionist that handles routine communication and hands organized requests to the team for confirmation.

Nothing is auto-confirmed without staff approval. The AI is a receptionist, not a clinician: it gives no
diagnoses and escalates symptoms and emergencies to humans.

## Features (all verified in source)

- **Clinic workspace** — profile, hours, services, FAQs/knowledge base, branding, timezone-aware booking.
- **Authentication** — custom JWT + DB sessions, argon2id passwords, refresh rotation, lockout, session management.
- **Appointments** — deterministic booking state machine, slot filling, duplicate protection, soft-delete,
  cancel notifications.
- **Patients** — records linked to conversations, appointments, and leads.
- **Inbox** — multi-channel conversations with statuses, unread counts, and staff replies.
- **AI receptionist** — 10-route deterministic router, dental-domain allowlist (incl. Hinglish + typo tolerance),
  guardrails, OpenRouter primary/fallback failover, DB-backed fallbacks, per-clinic usage tracking.
- **Messaging** — WhatsApp (webhook verify + HMAC, idempotent queue, rate-limited send), Messenger/Instagram
  connectors, website chat + embeddable widget.
- **Billing** — Stripe plans, checkout/portal, 9 webhook handlers, history, feature gating.
- **Security** — RBAC data model, clinic-scoped queries, CSRF/CSP/HSTS/rate-limiting, webhook verification,
  redacted audit log. Details: [docs/SECURITY.md](docs/SECURITY.md).

## Product Screenshots

Real captures are pending manual capture (this environment has no browser tooling; fabricated screenshots are
forbidden). The exact capture list and instructions live in [docs/screenshots/README.md](docs/screenshots/README.md)
— dashboard, appointments, patients, inbox, AI chat, and integrations.

## Architecture

Single-service monolith: Next.js → API routes → PostgreSQL (Prisma), with a Postgres-backed job queue and an
internal worker in the same boot unit. No Redis, no separate services.

```mermaid
flowchart LR
    Patient["Patients\n(WhatsApp / web)"] --> Web["Next.js app"]
    Staff["Staff (dashboard)"] --> Web
    Web --> API["API routes\n(JWT + clinic scope)"]
    API --> PG[("PostgreSQL")]
    API --> Jobs[("Job queue")]
    Worker["Internal worker"] --> Jobs
    API --> OR["OpenRouter"]
    API --> Stripe["Stripe"]
```

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## AI Receptionist

Deterministic routing first (emergency → booking → clinic info → symptoms → general), guardrails second,
OpenRouter with env-driven primary + fallback models third, DB-backed fallback always. RAG retrieval and LLM
tool-calling code exists but is **not** wired into the production path — documented honestly in
[docs/AI.md](docs/AI.md). AI output can be inaccurate; staff review applies, especially for medical concerns.

## Technology Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14, React 18, TypeScript (strict) |
| Styling | Tailwind CSS, lucide-react |
| Database | PostgreSQL via Prisma 5 (migrations) |
| Auth | Custom JWT + sessions, argon2id/bcrypt |
| AI | OpenRouter gateway (single provider path) |
| Messaging | Meta Graph API, website widget |
| Billing | Stripe |
| Email | Nodemailer + Resend |
| Quality | Vitest (633 tests), ESLint, Prettier, GitHub Actions |

## Project structure

```text
src/app/            # site, auth, dashboard pages + 46 API routes
src/components/ src/hooks/ src/contexts/
src/lib/            # auth, db, env, ai/, appointment/, billing/, jobs/, security/
src/messaging/      # engine, pipeline, AI receptionist, inbox, notifications
src/integrations/   # whatsapp/messenger/instagram connectors, token store
prisma/             # schema.prisma, migrations/
scripts/            # start-production.js, postbuild.js, import tooling
tests/              # 30 vitest files
docs/               # architecture, AI, security, deployment, reports
```

## Getting started

```bash
npm install
npm run setup     # Prisma generate + local db push + seeds (local throwaway DB only)
npm run dev       # http://localhost:3000
```

Local demo login (dev only): `admin@clinot.ai` / `admin123`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Prod: yes | PostgreSQL connection string |
| `JWT_SECRET` / `ENCRYPTION_KEY` / `CSRF_SECRET` | Prod: yes, 32+ chars | Signing, credential encryption, CSRF |
| `NEXT_PUBLIC_APP_URL` | Prod: yes | Exact public URL (CSRF, emails, OAuth, webhooks) |
| `META_APP_SECRET` / `WA_WEBHOOK_SECRET` | For inbound messaging | Webhook verification |
| `STRIPE_SECRET_KEY` (+ price/webhook secrets) | For billing | Stripe API + webhooks |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | For live AI | Provider key + primary model |
| `RESEND_API_KEY` / `FROM_EMAIL` | For auth emails | Password/email delivery |
| `WHATSAPP_*` (3 vars) | For auto-provisioning | Link WhatsApp at boot |
| `CLINOT_BOOTSTRAP_ADMIN` + `BOOTSTRAP_ADMIN_*` | First boot only | Initial owner; remove after login |

See [.env.example](.env.example) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Never commit `.env`.

## Development

```bash
npm run dev         # local server
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run format      # prettier --write (check: format:check)
npm run test        # vitest (hermetic, no live provider calls)
npm run build       # production build + standalone output
```

Database: `db:generate`, `db:migrate:dev` (local), `db:migrate:deploy` (production only),
`db:seed:system` (idempotent), `db:seed:dev` / `db:seed:whatsapp` (opt-in). Never `db:push` outside local dev.

## Deployment

One web service + one managed Postgres. Boot runs migrations, seeds, then the internal worker + Next.js server.
Providers: Railway, Render, Voroa. Details: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md),
[docs/RENDER-DEPLOYMENT.md](docs/RENDER-DEPLOYMENT.md). Health: `GET /api/health`.

## Security

Short version: verified sessions, clinic-scoped data access, audited routes, verified webhooks, strict prod
secret validation. Limitations are documented, not hidden. Full: [docs/SECURITY.md](docs/SECURITY.md).
Report issues privately per [SECURITY.md](SECURITY.md).

## Current Status

Working: clinic workspaces, auth/RBAC model, appointments, patients, inbox, AI receptionist with guardrails and
failover, WhatsApp messaging, website chat, Stripe billing, knowledge base, analytics aggregations, job system,
boot orchestration.

Incomplete or stubbed: Telegram integration (stub webhook — do not enable); Messenger/Instagram tenant mapping;
Instagram webhook secret inconsistency; RAG-to-prompt wiring; LLM tool-calling in production; appointment
booking/notification job handlers; calendar sync (does not exist); per-route role checks (any clinic session can
use clinic features — pending authorization-model decision). Tracked in [ROADMAP.md](ROADMAP.md).

No production usage, customers, revenue, uptime, SLA, or compliance certifications are claimed.

## Roadmap

- [ROADMAP.md](ROADMAP.md) — completed, in-progress, planned, future.
- [CHANGELOG.md](CHANGELOG.md) — begins from the current state (no historical tags).

## Contributing

- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, checks, PR expectations.

## License

No open-source license has been granted yet (`private: true`) — all rights reserved. Options and
recommendation: [docs/LICENSE_DECISION.md](docs/LICENSE_DECISION.md). Do not reuse this code until a
license is chosen.

## Links

- Repository: `https://github.com/akarshit819/ClinotAi`
- Live deployment (from project history, availability not guaranteed): `https://clinot-ai.onrender.com`
- Docs: [Architecture](docs/ARCHITECTURE.md) · [AI](docs/AI.md) · [Security](docs/SECURITY.md) ·
  [Deployment](docs/DEPLOYMENT.md) · [Database](docs/DATABASE.md) · [Audit](docs/GITHUB_PROFESSIONALIZATION_AUDIT.md)
