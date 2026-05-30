import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// POST /api/classes/bookings/[id]/check-in
// Check in a booking.
// Matching NestJS BookingsService.checkIn
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

  if (b.status === 'CHECKED_IN') {
    return NextResponse.json(b);
  }

  if (b.status !== 'BOOKED') {
    return NextResponse.json(
      { message: `Cannot check in a ${b.status} booking` },
      { status: 400 },
    );
  }

  const booking = await prisma.booking.update({
    where: { id },
    data: { status: 'CHECKED_IN' as any, checkedInAt: new Date() },
  });

  return NextResponse.json(booking);
}
