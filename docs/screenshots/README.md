# Screenshots — manual file transfer required

No screenshot files are committed yet. Availability check (2026-10-04): no browser, no
Playwright/Puppeteer, no Chromium/Edge binary in this environment — and screenshots must be **real**
captures of the running application, never generated or fabricated. Do not commit AI-generated mockups here.

## Assets received in conversation (not yet files)

Real Clinot captures were supplied in conversation on 2026-10-04 and reviewed visually. They are **not**
on disk in this environment, so they could not be committed. To publish them, save each with the exact
filename below into this directory:

| Received asset | Save as | Safety review |
|---|---|---|
| Clinic Overview dashboard (1 patient, zeros elsewhere, no PII) | `dashboard.png` | Clean — counts only, no PII visible |
| Appointments page + details ("Example" / "EXAMPLE REASON" / "Demo Admin") | `appointments.png` | Flagged — phone `918700879401` looks like a real-format number; confirm it is synthetic demo data or replace with an obviously fake number before publishing |
| Landing hero ("Your clinic's AI front desk") | optional `landing-hero.png` | Clean — marketing copy, no PII |
| "Live in three steps" section | optional `how-it-works.png` | Clean — no PII |
| "AI Receptionist in Under 30 Minutes" section | optional `onboarding-steps.png` | Clean — no PII |
| Blue CTA banner | optional `cta-banner.png` | Clean — no PII |

Still missing (no asset received): `patients.png`, `inbox.png`, `ai-receptionist.png` (`/chat`),
`integrations.png`. Do not claim the set is complete until all six required files exist.

## How to capture

1. `npm install && npm run setup && npm run dev` (local dev seed only — never production data).
2. Log in with the local demo account (`admin@clinot.ai` / `admin123`) and seed demo content so lists are
   non-empty (`npm run db:seed` locally; refuses in production).
3. Viewport **1440×900**, light theme, 100% zoom. Hide bookmarks bar; close devtools.
4. Confirm no real patient data, secrets, API keys, or private URLs are visible (demo seed data is synthetic
   by design — patient names/phones it creates are fixtures, not real people).
5. Save as PNG with exactly the filenames below, then reference them from the root `README.md`
   ("Product Screenshots").

## Required shots

| File | Route | State needed (synthetic data) | Must show |
|---|---|---|---|
| `dashboard.png` | `/dashboard` | Seeded clinic with a few appointments + conversations | Overview cards, recent activity |
| `appointments.png` | `/dashboard/appointments` | ≥3 appointments, mixed statuses | List with statuses, dates, patient names |
| `patients.png` | `/dashboard/patients` | ≥3 demo patients | Patient records table |
| `inbox.png` | `/dashboard/inbox` | 1 open conversation with several messages selected | Conversation list + message thread |
| `ai-receptionist.png` | `/chat` | Ask "What are your opening hours?" with seeded clinic FAQs | Chat answering from clinic knowledge |
| `integrations.png` | `/dashboard/integrations` | WhatsApp disconnected state (no real credentials) | Channel cards, connection states |

Optional if visually useful: `billing.png` (`/dashboard/billing`), `knowledge.png`
(`/dashboard/knowledge`), `landing.png` (`/`).
