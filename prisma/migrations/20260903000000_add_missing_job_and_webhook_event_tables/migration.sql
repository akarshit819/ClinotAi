-- Add tables that were missing from the initial migration.
-- The 20260816000000_init migration did not include the Job, MessengerWebhookEvent,
-- and InstagramWebhookEvent tables. This migration adds them so production databases
-- (fresh Render PostgreSQL or already-migrated) reach a complete schema.
--
-- This migration is ADDITIVE ONLY: it never modifies existing tables, never drops
-- data, and never changes constraints. Running it against a database that already
-- has these tables is a no-op (each CREATE TABLE / CREATE INDEX is wrapped in a
-- DO block that checks for existence first).

-- ============================================================================
-- Job: background job queue (PostgreSQL-backed, single source of truth for
-- the internal job processor started by scripts/start-production.js).
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Job' AND table_schema = 'public') THEN
    CREATE TABLE "Job" (
        "id" TEXT NOT NULL,
        "clinicId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "payload" JSONB NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "priority" INTEGER NOT NULL DEFAULT 0,
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "maxAttempts" INTEGER NOT NULL DEFAULT 3,
        "lastError" TEXT,
        "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "startedAt" TIMESTAMP(3),
        "completedAt" TIMESTAMP(3),
        "failedAt" TIMESTAMP(3),
        "idempotencyKey" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,

        CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Job' AND indexname = 'Job_idempotencyKey_key') THEN
    CREATE UNIQUE INDEX "Job_idempotencyKey_key" ON "Job"("idempotencyKey");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Job' AND indexname = 'Job_clinicId_status_idx') THEN
    CREATE INDEX "Job_clinicId_status_idx" ON "Job"("clinicId", "status");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Job' AND indexname = 'Job_status_scheduledAt_idx') THEN
    CREATE INDEX "Job_status_scheduledAt_idx" ON "Job"("status", "scheduledAt");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Job' AND indexname = 'Job_idempotencyKey_idx') THEN
    CREATE INDEX "Job_idempotencyKey_idx" ON "Job"("idempotencyKey");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Job_clinicId_fkey' AND table_name = 'Job') THEN
    ALTER TABLE "Job" ADD CONSTRAINT "Job_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- MessengerWebhookEvent: idempotency store for inbound Messenger webhooks.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'MessengerWebhookEvent' AND table_schema = 'public') THEN
    CREATE TABLE "MessengerWebhookEvent" (
        "id" TEXT NOT NULL,
        "eventId" TEXT NOT NULL,
        "clinicId" TEXT NOT NULL,
        "pageId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'processed',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "MessengerWebhookEvent_pkey" PRIMARY KEY ("id")
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'MessengerWebhookEvent' AND indexname = 'MessengerWebhookEvent_eventId_key') THEN
    CREATE UNIQUE INDEX "MessengerWebhookEvent_eventId_key" ON "MessengerWebhookEvent"("eventId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'MessengerWebhookEvent' AND indexname = 'MessengerWebhookEvent_clinicId_idx') THEN
    CREATE INDEX "MessengerWebhookEvent_clinicId_idx" ON "MessengerWebhookEvent"("clinicId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'MessengerWebhookEvent' AND indexname = 'MessengerWebhookEvent_pageId_idx') THEN
    CREATE INDEX "MessengerWebhookEvent_pageId_idx" ON "MessengerWebhookEvent"("pageId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'MessengerWebhookEvent' AND indexname = 'MessengerWebhookEvent_createdAt_idx') THEN
    CREATE INDEX "MessengerWebhookEvent_createdAt_idx" ON "MessengerWebhookEvent"("createdAt");
  END IF;
END $$;

-- ============================================================================
-- InstagramWebhookEvent: idempotency store for inbound Instagram webhooks.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'InstagramWebhookEvent' AND table_schema = 'public') THEN
    CREATE TABLE "InstagramWebhookEvent" (
        "id" TEXT NOT NULL,
        "eventId" TEXT NOT NULL,
        "clinicId" TEXT NOT NULL,
        "instagramId" TEXT,
        "type" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'processed',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "InstagramWebhookEvent_pkey" PRIMARY KEY ("id")
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'InstagramWebhookEvent' AND indexname = 'InstagramWebhookEvent_eventId_key') THEN
    CREATE UNIQUE INDEX "InstagramWebhookEvent_eventId_key" ON "InstagramWebhookEvent"("eventId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'InstagramWebhookEvent' AND indexname = 'InstagramWebhookEvent_clinicId_idx') THEN
    CREATE INDEX "InstagramWebhookEvent_clinicId_idx" ON "InstagramWebhookEvent"("clinicId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'InstagramWebhookEvent' AND indexname = 'InstagramWebhookEvent_instagramId_idx') THEN
    CREATE INDEX "InstagramWebhookEvent_instagramId_idx" ON "InstagramWebhookEvent"("instagramId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'InstagramWebhookEvent' AND indexname = 'InstagramWebhookEvent_createdAt_idx') THEN
    CREATE INDEX "InstagramWebhookEvent_createdAt_idx" ON "InstagramWebhookEvent"("createdAt");
  END IF;
END $$;
