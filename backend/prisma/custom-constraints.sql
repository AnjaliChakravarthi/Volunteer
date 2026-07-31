-- ============================================================
-- custom-constraints.sql
-- PostgreSQL constraints that Prisma cannot express natively.
-- Run AFTER `prisma migrate deploy` on each environment.
-- Idempotent: each statement uses IF NOT EXISTS / DROP CONSTRAINT IF EXISTS.
-- ============================================================

-- Enable btree_gist extension (required for mixed-type GIST indexes)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- DB-003a: Partial unique index on registration
-- Business rule: a volunteer may not have more than one active
-- registration per shift (CANCELLED registrations are excluded).
-- Prisma's @@unique covers all statuses; this enforces the
-- domain constraint that only one non-cancelled row is allowed.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS ux_registration_active_per_shift
  ON registration (volunteer_id, shift_id)
  WHERE status != 'CANCELLED';

-- ============================================================
-- DB-003b: GIST exclusion constraint on assignment
-- Business rule (BR-11): a single volunteer cannot be assigned to
-- overlapping shifts. Uses denormalized starts_at/ends_at columns.
-- The half-open interval [starts_at, ends_at) prevents false
-- conflicts for back-to-back shifts (ends_at of one == starts_at
-- of next).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'no_overlapping_assignments'
  ) THEN
    ALTER TABLE assignment
      ADD CONSTRAINT no_overlapping_assignments
      EXCLUDE USING gist (
        volunteer_id WITH =,
        tsrange(starts_at, ends_at, '[)') WITH &&
      )
      WHERE (status != 'CANCELLED');
  END IF;
END;
$$;

-- ============================================================
-- DB-004: Audit log — revoke UPDATE/DELETE from application role.
-- Run as superuser after creating the application DB role.
-- Replace 'app_user' with your actual application database role.
-- ============================================================
-- REVOKE UPDATE, DELETE ON TABLE audit_log FROM app_user;

-- ============================================================
-- DB-005: Email case-insensitivity index (citext semantics via lower())
-- The application normalizes email to lowercase before writes.
-- This index enforces unique lower-cased emails at the DB level.
-- ============================================================
DROP INDEX IF EXISTS ux_volunteer_email_lower;
CREATE UNIQUE INDEX ux_volunteer_email_lower
  ON volunteer (lower(email))
  WHERE deleted_at IS NULL;

-- ============================================================
-- Performance indexes (supplement Prisma-generated FK indexes)
-- ============================================================

-- Registration lookups by status (coordinator queues)
CREATE INDEX IF NOT EXISTS ix_registration_volunteer_status
  ON registration (volunteer_id, status);

CREATE INDEX IF NOT EXISTS ix_registration_shift_status
  ON registration (shift_id, status);

-- Shift time-range queries (calendar views)
CREATE INDEX IF NOT EXISTS ix_shift_starts_at
  ON shift (starts_at);

-- Assignment volunteer + status (overlap check support)
CREATE INDEX IF NOT EXISTS ix_assignment_volunteer_status
  ON assignment (volunteer_id, status);

-- Credential expiry monitoring
CREATE INDEX IF NOT EXISTS ix_credential_expires_at
  ON credential (expires_at)
  WHERE expires_at IS NOT NULL;
