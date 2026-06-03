import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// POST /api/memberships/process-renewals
// ---------------------------------------------------------------------------
export async function POST() {
  const user = await requireServerUser();
  const tenantId = user.tenantId;

  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + 30);

  // Find memberships expiring within the next 30 days that aren't already cancelled/expired
  const due = await prisma.membership.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
      endDate: { lte: windowEnd },
    },
    include: {
      member: { select: { id: true, fullName: true, membershipStatus: true } },
      plan: { select: { id: true, nameEn: true, durationDays: true, priceAed: true } },
    },
  });

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const membership of due) {
    try {
      const newStart = new Date(membership.endDate);
      const newEnd = new Date(newStart);
      newEnd.setDate(newEnd.getDate() + membership.plan.durationDays);

      // Create a renewal membership (PENDING_PAYMENT until payment is received)
      await prisma.membership.create({
        data: {
          tenantId,
          memberId: membership.memberId,
          planId: membership.planId,
          status: 'PENDING_PAYMENT',
          startDate: newStart,
          endDate: newEnd,
        },
      });

      created++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    due: due.length,
    created,
    skipped,
    failed,
  });
}
