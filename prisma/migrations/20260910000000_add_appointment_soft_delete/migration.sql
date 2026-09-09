-- Soft delete for appointments: manual dashboard deletes must hide the
-- record without destroying data.
--
-- Adds two columns to "Appointment":
--   "isDeleted" BOOLEAN NOT NULL DEFAULT false
--   "deletedAt" TIMESTAMP(3) NULL
--
-- This migration is ADDITIVE ONLY: it never modifies existing tables or
-- columns beyond adding these two, never drops data, and never changes
-- constraints. Existing rows get isDeleted=false automatically (the
-- NOT NULL DEFAULT applies to current rows), so current bookings keep
-- working. Running it against a database that already has the columns
-- is a no-op (each ADD COLUMN is guarded by an information_schema
-- check). Applied automatically at boot by `prisma migrate deploy` in
-- scripts/start-production.js (and the voroa-start.sh / railway-start.sh
-- launchers). No destructive operations, no resets.

-- ============================================================================
-- Appointment.isDeleted
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Appointment'
      AND column_name = 'isDeleted'
  ) THEN
    ALTER TABLE "Appointment" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- ============================================================================
-- Appointment.deletedAt
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Appointment'
      AND column_name = 'deletedAt'
  ) THEN
    ALTER TABLE "Appointment" ADD COLUMN "deletedAt" TIMESTAMP(3);
  END IF;
END $$;
