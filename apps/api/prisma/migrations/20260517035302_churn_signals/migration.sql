-- CreateEnum
CREATE TYPE "ChurnSignalStatus" AS ENUM ('PENDING', 'NUDGED', 'DISMISSED', 'FAILED');

-- CreateTable
CREATE TABLE "ChurnSignal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daysSinceLastCheckin" INTEGER NOT NULL,
    "status" "ChurnSignalStatus" NOT NULL DEFAULT 'PENDING',
    "nudgedAt" TIMESTAMP(3),
    "whatsappMessageId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurnSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChurnSignal_tenantId_idx" ON "ChurnSignal"("tenantId");

-- CreateIndex
CREATE INDEX "ChurnSignal_tenantId_status_idx" ON "ChurnSignal"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ChurnSignal_tenantId_memberId_detectedAt_idx" ON "ChurnSignal"("tenantId", "memberId", "detectedAt");

-- CreateIndex
CREATE INDEX "Member_tenantId_membershipStatus_lastCheckinAt_idx" ON "Member"("tenantId", "membershipStatus", "lastCheckinAt");

-- AddForeignKey
ALTER TABLE "ChurnSignal" ADD CONSTRAINT "ChurnSignal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurnSignal" ADD CONSTRAINT "ChurnSignal_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
