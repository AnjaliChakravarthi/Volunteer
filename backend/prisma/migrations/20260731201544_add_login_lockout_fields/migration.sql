-- AlterTable: add progressive login lockout fields to volunteer (SEC-001)
-- failed_login_attempts: counter reset to 0 on successful login
-- locked_until: non-null while account is temporarily locked; null = not locked
ALTER TABLE "volunteer" ADD COLUMN IF NOT EXISTS "failed_login_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "volunteer" ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMP(3);
