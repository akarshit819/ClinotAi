# Screenshots — manual capture list

No screenshots have been captured yet. This environment has no browser tooling, and screenshots must be **real**
captures of the running application — never generated or fabricated. Do not commit AI-generated mockups here.

## How to capture

1. `npm install && npm run setup && npm run dev` (local dev seed only — never production data).
2. Log in with the local demo account and open each page below at **1440×900**, light theme.
3. Confirm no real patient data, secrets, or API keys are visible (demo seed data is synthetic by design).
4. Save as PNG with exactly these filenames and reference them from the root `README.md`.

## Required shots

| File | Page | Must show |
|---|---|---|
| `dashboard.png` | `/dashboard` | Overview cards, recent activity |
| `appointments.png` | `/dashboard/appointments` | Appointment list with statuses |
| `patients.png` | `/dashboard/patients` | Patient records table |
| `inbox.png` | `/dashboard/inbox` | Conversation list + message thread |
| `ai-receptionist.png` | `/chat` | Website chat answering a clinic question |
| `integrations.png` | `/dashboard/integrations` | WhatsApp/Meta connection states |

Optional if visually useful: `billing.png` (`/dashboard/billing`), `knowledge.png` (`/dashboard/knowledge`),
`landing.png` (`/`).
