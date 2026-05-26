-- AlterTable
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "lastReminderSentAt" TIMESTAMP(3);
