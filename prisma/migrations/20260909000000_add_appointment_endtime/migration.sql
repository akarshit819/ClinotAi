-- Add the Appointment.endTime column that prisma/schema.prisma has declared
-- (as `endTime String?`) but no previous migration ever created.
--
-- Production incident: the generated Prisma client selects "endTime" in
-- appointment queries (availability checks, booking, dashboard), while
-- production PostgreSQL — migrated only through 20260816000000_init and
-- 20260903000000_add_missing_job_and_webhook_event_tables — has no such
-- column. Every appointment query failed with:
--
--   The column `Appointment.endTime` does not exist in the current database.
--
-- and the booking flow degraded to "availability unverifiable".
--
-- This migration is ADDITIVE ONLY: it adds one NULLABLE column, never
-- modifies existing tables/columns, never drops data, and never changes
-- constraints. Running it against a database that already has the column
-- is a no-op (guarded by an information_schema check), so it is safe on
-- fresh databases, already-migrated databases, and databases that were
-- previously patched by hand. Applied automatically at boot by
-- `prisma migrate deploy` in scripts/start-production.js (and the
-- voroa-start.sh / railway-start.sh launchers).

-- ============================================================================
-- Appointment.endTime: nullable appointment end wall-clock ("HH:mm").
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Appointment'
      AND column_name = 'endTime'
  ) THEN
    ALTER TABLE "Appointment" ADD COLUMN "endTime" TEXT;
  END IF;
END $$;
