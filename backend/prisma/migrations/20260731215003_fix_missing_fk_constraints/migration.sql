-- Migration: fix_missing_fk_constraints
-- Adds FK constraints that were declared in schema.prisma but missing from
-- the actual DB after the initial migration. Detected via psql \d inspection.

-- 1. application.volunteer_id → volunteer(id)
--    Was in schema.prisma Volunteer.applications relation but omitted from
--    the DB. Confirmed missing by: \d application showed only 1 FK (opportunity).
ALTER TABLE "application"
  ADD CONSTRAINT "application_volunteer_id_fkey"
  FOREIGN KEY ("volunteer_id") REFERENCES "volunteer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. participation.volunteer_id → volunteer(id)
--    Participation model had no volunteer relation in schema until this fix.
ALTER TABLE "participation"
  ADD CONSTRAINT "participation_volunteer_id_fkey"
  FOREIGN KEY ("volunteer_id") REFERENCES "volunteer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. participation.assignment_id → assignment(id)  (nullable)
--    Allows null per BR-04 (remote hours without check-in).
ALTER TABLE "participation"
  ADD CONSTRAINT "participation_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "assignment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. participation.approved_by_id → volunteer(id)  (nullable)
--    References the coordinator/supervisor who approved hours.
ALTER TABLE "participation"
  ADD CONSTRAINT "participation_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "volunteer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
