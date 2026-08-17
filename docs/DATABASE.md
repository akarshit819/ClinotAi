# Clinot AI — Database Persistence, Migrations & Backups

## Current architecture (as of this migration)

- **Provider:** PostgreSQL (previously SQLite on a non-persistent Railway volume-less container).
- **Schema source of truth:** `prisma/schema.prisma` (`provider = "postgresql"`, `url = env("DATABASE_URL")`).
- **Production schema management:** Prisma migrations, applied with `prisma migrate deploy` on every Railway boot (`railway-start.sh`). `prisma db push` is **never** used in production.
- **Local development:** `DATABASE_URL` in `.env` (currently `file:./dev.db` for a throwaway local SQLite dev.db; switch to a local Postgres connection string when developing against Postgres).
- **One subscription per clinic:** `Subscription.clinicId` is `@unique`, matching how the billing code upserts subscriptions. `ConversationMessage.sourceMessageId` remains an indexed (non-unique) field by design so duplicate webhook deliveries can be de-duplicated in the handler.

## Schema changes (migration history)

Prisma migrations live in `prisma/migrations/`. The initial migration `20260816000000_init` creates the full schema from empty.

| Script | Purpose |
| ------ | ------- |
| `npm run db:migrate:deploy` | Apply pending migrations (production) |
| `npm run db:migrate:dev` | Create/apply migrations in development |
| `npm run db:push` | Push schema without migrations — dev only, never in production |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:seed:system` | Idempotent system data (permissions, plans, clinic template). No users, no credentials. Safe in prod. |
| `npm run db:seed` | **Demo seed** (demo clinic + `admin@clinot.ai`/`admin123`). Refuses to run when `NODE_ENV=production` unless `CLINOT_SEED_DEMO=true`. Dev only. |
| `npm run db:seed:dev` | Opt-in dev/test user; refuses in production unless `CLINOT_DEV_SEED=true`. |
| `npm run db:seed:whatsapp` | Connect the WhatsApp Business account from env vars (idempotent). Only runs when `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_WABA_ID` are set. Does not create users. |
| `npm run db:import:sqlite` | One-time SQLite → Postgres data import (see below). |

## Production boot sequence (railway-start.sh)

1. `npx prisma generate`
2. `npx prisma migrate deploy` — applies migrations; fails fast if schema drift or unreachable DB.
3. `npx tsx src/seed-system.ts` — idempotent, credential-free system data.
4. `npx tsx src/seed-dev-user.ts` — only if `CLINOT_DEV_SEED=true`.
5. `npx tsx src/seed-whatsapp.ts` — only if the WhatsApp env vars are present.
6. `npm run start`

The demo seed (`src/seed.ts`) is deliberately **not** part of the boot sequence and is blocked in production.

## Data preservation / migration

### Existing production data

Before this migration, production used `file:./dev.db` with **no volume**, so the SQLite database was recreated empty on every deploy and populated by the old seed-on-boot behavior. No real tenant data persisted across deploys. If any data from the old runtime needs to be carried over, use the import utility below.

### SQLite → Postgres import utility

`scripts/import-sqlite-to-postgres.ts` copies all tables from an existing SQLite database into Postgres, preserving primary keys, timestamps, and relations. It is idempotent (`skipDuplicates`) and never deletes or overwrites existing rows in the target.

```bash
# generate the throwaway SQLite client (already gitignored at /.sqlite-client)
npx prisma generate --schema prisma/schema.sqlite.prisma

# run the import (source DB + target Postgres)
SQLITE_DATABASE_URL="file:./prisma/dev.db" \
DATABASE_URL="postgres://user:pass@host:5432/dbname?sslmode=require" \
  npm run db:import:sqlite
```

`db:import:sqlite` runs the generate step too, so `npm run db:import:sqlite` is enough after setting both env vars.

## Backups & recovery

### Railway-managed Postgres

Railway provisioned Postgres services are managed by Railway. Use the Railway dashboard or CLI for backups:

- **Dashboard:** Services → Postgres → Backups tab. Railway keeps daily backups automatically; a manual backup can be triggered there.
- **CLI:** `railway backup` and `railway restore` are available once a Postgres plugin is linked (see Railway docs).

### Manual dump/restore (pg_dump)

The connection string is the `DATABASE_URL` of the Postgres service. You can dump/restore from any machine with `pg_dump`/`psql`:

```bash
# backup
pg_dump "$DATABASE_URL" -Fc -f clinot-$(date +%F).dump

# restore into a fresh database
pg_restore --clean --if-exists -d "$DATABASE_URL" clinot-<date>.dump
```

### Point-in-time recovery

Restore the latest good dump into a new database, point `DATABASE_URL` at it (Railway variable), and redeploy. Because `railway-start.sh` runs `prisma migrate deploy`, the restored database is automatically migrated to the latest schema if you restore into an older schema.

## Rollback

- **Code rollback:** `git revert` / redeploy the previous commit.
- **Schema rollback:** not automatic. Create a new down-migration with `npx prisma migrate dev --create-only` and apply it, or restore from backup. Prefer backup restore for data-preserving rollbacks.
- **Never** edit an applied migration file in `prisma/migrations/` after it has run in production; create a new migration instead.

## Operational notes

- `NODE_ENV=production` and a reachable `DATABASE_URL` are required on Railway.
- The healthcheck endpoint `/api/health` runs `SELECT 1` against the DB, so a failing database surfaces as a degraded/restarting service.
- Keep `JWT_SECRET`/`ENCRYPTION_KEY` as production secrets; they are unrelated to the DB but required for sessions/crypto.