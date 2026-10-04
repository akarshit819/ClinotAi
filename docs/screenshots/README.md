# Screenshots — manual capture required

No screenshots have been captured yet. Availability check (2026-10-04): no browser, no
Playwright/Puppeteer, no Chromium/Edge binary, no image tooling in this environment — and screenshots must
be **real** captures of the running application, never generated or fabricated. Do not commit AI-generated
mockups here.

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
