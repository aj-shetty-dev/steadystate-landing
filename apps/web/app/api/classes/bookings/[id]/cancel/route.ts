import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// POST /api/classes/bookings/[id]/cancel
// Cancel a booking. If waitlisted members exist, promote the first one.
// Matching NestJS BookingsService.cancel
// ---------------------------------------------------------------------------
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const b = await prisma.booking.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!b) {
    return NextResponse.json({ message: 'Booking not found' }, { status: 404 });
  }

  if (b.status === 'CANCELLED') {
    return NextResponse.json(b);
  }

  const result = await prisma.$transaction(async (tx) => {
    const cancelled = await tx.booking.update({
      where: { id },
      data: { status: 'CANCELLED' as any, cancelledAt: new Date() },
    });

    // Promote first waitlisted member, if any
    const next = await tx.booking.findFirst({
      where: {
        sessionId: b.sessionId,
        tenantId: user.tenantId,
        status: 'WAITLISTED' as any,
      },
      orderBy: { position: 'asc' },
    });

    let promotedId: string | null = null;
    if (next) {
      await tx.booking.update({
        where: { id: next.id },
        data: { status: 'BOOKED' as any, position: null },
      });
      promotedId = next.id;
    }

    return { cancelled, promotedId };
  });

  return NextResponse.json(result.cancelled);
}
