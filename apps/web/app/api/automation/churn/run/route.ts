import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// POST /api/automation/churn/run
// Run churn detection cycle synchronously.
// Matching NestJS AutomationController.runNow → ChurnEngineService.runCycle
// ---------------------------------------------------------------------------
export async function POST() {
  const user = await requireServerUser();

  // Detect churn signals based on last check-in
  const cutoff = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000); // 21 days ago
  const atRiskMembers = await prisma.member.findMany({
    where: {
      tenantId: user.tenantId,
      membershipStatus: 'ACTIVE',
      lastCheckinAt: { lt: cutoff },
    },
    select: { id: true, fullName: true, phone: true, lastCheckinAt: true },
  });

  // For each at-risk member, check if a signal already exists
  let signalsCreated = 0;
  for (const member of atRiskMembers) {
    const lastCheckinDate = member.lastCheckinAt ?? new Date(0);
    const daysSince = Math.floor(
      (Date.now() - lastCheckinDate.getTime()) / (24 * 60 * 60 * 1000),
    );

    const existing = await prisma.churnSignal.findFirst({
      where: {
        tenantId: user.tenantId,
        memberId: member.id,
      },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.churnSignal.create({
      data: {
        tenantId: user.tenantId,
        memberId: member.id,
        daysSinceLastCheckin: daysSince,
        status: 'PENDING',
        detectedAt: new Date(),
      },
    });
    signalsCreated++;
  }

  // Detect expired memberships
  const expiredMembers = await prisma.member.findMany({
    where: {
      tenantId: user.tenantId,
      membershipStatus: 'ACTIVE',
      membershipExpiresAt: { lt: new Date() },
    },
    select: { id: true, fullName: true, membershipExpiresAt: true },
  });

  for (const member of expiredMembers) {
    const expiryDate = member.membershipExpiresAt ?? new Date(0);
    const daysSince = Math.floor(
      (Date.now() - expiryDate.getTime()) / (24 * 60 * 60 * 1000),
    );

    const existing = await prisma.churnSignal.findFirst({
      where: {
        tenantId: user.tenantId,
        memberId: member.id,
      },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.churnSignal.create({
      data: {
        tenantId: user.tenantId,
        memberId: member.id,
        daysSinceLastCheckin: daysSince,
        status: 'PENDING',
        detectedAt: new Date(),
      },
    });
    signalsCreated++;
  }

  const result = {
    detection: {
      atRiskFound: atRiskMembers.length,
      expiredFound: expiredMembers.length,
      signalsCreated,
    },
    dispatch: {
      nudgesSent: 0,
      errors: 0,
    },
  };

  return NextResponse.json(result);
}
