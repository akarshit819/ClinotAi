# Clinot AI - Setup & Commands

## First Time Setup
```bash
npm install
npm run setup
npm run dev
```

## Development
```bash
npm run dev          # Start dev server on http://localhost:3000
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run linter
npm run typecheck    # TypeScript type check
npm run test         # Run vitest tests
```

## Database
PostgreSQL is the source of truth in production (Prisma migrations, applied via `db:migrate:deploy` at boot).
Local dev may use a throwaway SQLite file via `.env` (`DATABASE_URL="file:./dev.db"`), but never use `db:push` or SQLite against production data.
```bash
npm run db:generate      # Generate Prisma client
npm run db:migrate:deploy # Apply migrations (production)
npm run db:migrate:dev    # Create/apply migrations (development)
npm run db:push           # Push schema without migrations - dev only, NEVER in production
npm run db:seed:system    # Idempotent system data (permissions, plans, clinic template)
npm run db:seed           # Demo data (blocked in production unless CLINOT_SEED_DEMO=true)
npm run db:seed:dev       # Opt-in dev/test user (requires CLINOT_DEV_SEED=true in prod)
npm run db:seed:whatsapp  # Connect WhatsApp WABA from env vars (idempotent)
npm run db:import:sqlite  # One-time SQLite -> Postgres data import
npm run setup             # Local dev full setup (generate + push + seed)
```

## Login
Demo credentials (local dev only): `admin@clinot.ai` / `admin123`

## Architecture
- Next.js 14 App Router with TypeScript
- PostgreSQL (via Prisma) with Prisma migrations - see `docs/DATABASE.md` for schema, backups, and recovery
- Tailwind CSS for styling
- Custom JWT + DB-session auth (HS256 access/refresh tokens, argon2id passwords)
- Single-service runtime: `npm run start` boots the Next.js server AND the internal PostgreSQL-backed job processor (no separate worker needed); see `docs/RENDER-DEPLOYMENT.md`

## Project Structure
- `src/app/` - Pages and API routes
- `src/components/` - React components
- `src/lib/` - Utilities, auth, DB client
- `prisma/schema.prisma` - Database schema
- `prisma/migrations/` - Database migrations
- `scripts/` - Utility scripts (e.g. SQLite -> Postgres import)
- `docs/` - Documentation (database persistence/backups)
- Landing page at `/`, Dashboard at `/dashboard`, Chat at `/chat`