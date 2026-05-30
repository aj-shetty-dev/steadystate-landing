import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// POST /api/members/[id]/deactivate
// Deactivate a member (transaction: cancel memberships, cancel future
// bookings, set member status to CANCELLED).
// Matching NestJS MembersController.deactivate
// ---------------------------------------------------------------------------
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const existing = await prisma.member.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!existing) {
    return NextResponse.json({ message: 'Member not found' }, { status: 404 });
  }

  const member = await prisma.$transaction(async (tx) => {
    // Cancel active/frozen/pending memberships
    await tx.membership.updateMany({
      where: {
        tenantId: user.tenantId,
        memberId: id,
        status: { in: ['ACTIVE', 'FROZEN', 'PENDING_PAYMENT'] as any },
      },
      data: {
        status: 'CANCELLED' as any,
        cancellationReason: 'Member deactivated',
        cancelAtPeriodEnd: false,
      },
    });

    // Cancel any forward-looking bookings
    await tx.booking.updateMany({
      where: {
        tenantId: user.tenantId,
        memberId: id,
        status: { in: ['BOOKED', 'WAITLISTED'] as any },
        session: { startsAt: { gt: new Date() } },
      },
      data: { status: 'CANCELLED' as any, cancelledAt: new Date() },
    });

    return tx.member.update({
      where: { id },
      data: { membershipStatus: 'CANCELLED' as any },
    });
  });

  return NextResponse.json(member);
}
