-- Migration: phase3_attendance_participation_ledger
-- Phase 3: Attendance module + Participation Ledger + ParticipationAdjustment + QrToken
-- NOTE: Prisma maps @id/@default(uuid()) as TEXT in PostgreSQL, not native UUID type.
-- All FK columns referencing volunteer.id / participation.id must be TEXT to match.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXTEND attendance TABLE
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "attendance"
  ADD COLUMN IF NOT EXISTS "offline_queued_at"    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "offline_conflict"      BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "offline_conflict_note" TEXT,
  ADD COLUMN IF NOT EXISTS "supervised_by_id"      TEXT,
  ADD COLUMN IF NOT EXISTS "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- FK: attendance.supervised_by_id → volunteer(id)  (nullable — self-checkin has no supervisor)
ALTER TABLE "attendance"
  DROP CONSTRAINT IF EXISTS "attendance_supervised_by_id_fkey";
ALTER TABLE "attendance"
  ADD CONSTRAINT "attendance_supervised_by_id_fkey"
  FOREIGN KEY ("supervised_by_id") REFERENCES "volunteer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Performance indexes
CREATE INDEX IF NOT EXISTS ix_attendance_status        ON "attendance" ("status");
CREATE INDEX IF NOT EXISTS ix_attendance_checked_in_at ON "attendance" ("checked_in_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. EXTEND participation TABLE
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "participation"
  ADD COLUMN IF NOT EXISTS "checkin_time"    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "checkout_time"   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "break_minutes"   INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "approved_at"     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "has_discrepancy" BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "evidence_ref"    TEXT;

-- Performance indexes
CREATE INDEX IF NOT EXISTS ix_participation_volunteer_status ON "participation" ("volunteer_id", "status");
CREATE INDEX IF NOT EXISTS ix_participation_event_status     ON "participation" ("event_id",     "status");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CREATE participation_adjustment TABLE (append-only)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "participation_adjustment" (
  "id"                     TEXT          NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "participation_id"       TEXT          NOT NULL,
  "delta_hours"            DECIMAL(10,2) NOT NULL,
  "reason"                 TEXT          NOT NULL,
  "previous_snapshot_json" JSONB         NOT NULL,
  "new_snapshot_json"      JSONB         NOT NULL,
  "actor_id"               TEXT          NOT NULL,
  "created_at"             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "participation_adjustment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "participation_adjustment"
  DROP CONSTRAINT IF EXISTS "participation_adjustment_participation_id_fkey";
ALTER TABLE "participation_adjustment"
  ADD CONSTRAINT "participation_adjustment_participation_id_fkey"
  FOREIGN KEY ("participation_id") REFERENCES "participation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "participation_adjustment"
  DROP CONSTRAINT IF EXISTS "participation_adjustment_actor_id_fkey";
ALTER TABLE "participation_adjustment"
  ADD CONSTRAINT "participation_adjustment_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "volunteer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS ix_participation_adj_participation_id
  ON "participation_adjustment" ("participation_id");
CREATE INDEX IF NOT EXISTS ix_participation_adj_actor_id
  ON "participation_adjustment" ("actor_id");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CREATE qr_token TABLE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "qr_token" (
  "id"            TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "assignment_id" TEXT        NOT NULL,
  "volunteer_id"  TEXT        NOT NULL,
  "token"         TEXT        NOT NULL,
  "expires_at"    TIMESTAMPTZ NOT NULL,
  "used_at"       TIMESTAMPTZ,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "qr_token_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "qr_token_token_key" UNIQUE      ("token")
);

ALTER TABLE "qr_token"
  DROP CONSTRAINT IF EXISTS "qr_token_volunteer_id_fkey";
ALTER TABLE "qr_token"
  ADD CONSTRAINT "qr_token_volunteer_id_fkey"
  FOREIGN KEY ("volunteer_id") REFERENCES "volunteer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- qr_token.assignment_id: service-layer enforced only (walk-in tokens created in same tx)
CREATE INDEX IF NOT EXISTS ix_qr_token_token      ON "qr_token" ("token");
CREATE INDEX IF NOT EXISTS ix_qr_token_expires_at ON "qr_token" ("expires_at");
