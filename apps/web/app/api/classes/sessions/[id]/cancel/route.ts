import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// POST /api/classes/sessions/[id]/cancel
// ---------------------------------------------------------------------------
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  // Get session with classType info
  const session = await prisma.classSession.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      classType: { select: { id: true, nameEn: true, nameAr: true } },
    },
  });

  if (!session) {
    return NextResponse.json({ message: 'Session not found' }, { status: 404 });
  }

  if (session.status === 'CANCELLED') {
    return NextResponse.json(session);
  }

  // Cancel all active bookings for this session and mark session as CANCELLED
  const cancelled = await prisma.$transaction(async (tx) => {
    await tx.booking.updateMany({
      where: {
        tenantId: user.tenantId,
        sessionId: id,
        status: { in: ['BOOKED', 'WAITLISTED', 'CHECKED_IN'] as any },
      },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    return tx.classSession.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  });

  return NextResponse.json(cancelled);
}
