import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const bookingInputSchema = z.object({
  sessionId: z.string().min(1),
  memberId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// POST /api/classes/bookings
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();

  const parsed = bookingInputSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.errors) {
      const field = issue.path.join('.') || 'form';
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return NextResponse.json(
      { message: Object.values(fieldErrors).join('; '), fieldErrors },
      { status: 400 },
    );
  }

  // Load session, member, and existing booking in parallel
  const [session, member, existing] = await Promise.all([
    prisma.classSession.findFirst({
      where: { id: parsed.data.sessionId, tenantId: user.tenantId },
      include: {
        classType: { select: { capacity: true, dropInPriceAed: true } },
        _count: {
          select: {
            bookings: {
              where: { status: { in: ['BOOKED', 'CHECKED_IN'] } },
            },
          },
        },
      },
    }),
    prisma.member.findFirst({
      where: { id: parsed.data.memberId, tenantId: user.tenantId },
      select: { id: true, membershipStatus: true },
    }),
    prisma.booking.findFirst({
      where: {
        sessionId: parsed.data.sessionId,
        memberId: parsed.data.memberId,
        tenantId: user.tenantId,
      },
    }),
  ]);

  if (!session) {
    return NextResponse.json({ message: 'Session not found' }, { status: 404 });
  }

  if (!member) {
    return NextResponse.json({ message: 'Member not found' }, { status: 404 });
  }

  if (session.startsAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { message: 'Cannot book a session that has already started' },
      { status: 400 },
    );
  }

  if (session.status !== 'SCHEDULED') {
    return NextResponse.json(
      { message: `Cannot book a ${session.status} session` },
      { status: 400 },
    );
  }

  if (existing && existing.status !== 'CANCELLED') {
    return NextResponse.json({ message: 'Already booked' }, { status: 409 });
  }

  // Check if member is on freeze during this session
  if (member.membershipStatus === 'FROZEN') {
    const conflictingFreeze = await prisma.membershipFreeze.findFirst({
      where: {
        tenantId: user.tenantId,
        status: 'ACTIVE',
        startDate: { lte: session.startsAt },
        endDate: { gte: session.startsAt },
        membership: { memberId: parsed.data.memberId, tenantId: user.tenantId },
      },
      select: { id: true },
    });
    if (conflictingFreeze) {
      return NextResponse.json(
        { message: 'Member is on freeze during this session' },
        { status: 400 },
      );
    }
  }

  const capacity = session.capacityOverride ?? session.classType.capacity;

  const eligible =
    member.membershipStatus === 'ACTIVE' || member.membershipStatus === 'FROZEN';
  const hasDropIn = session.classType.dropInPriceAed !== undefined && session.classType.dropInPriceAed !== null;
  if (!eligible && !hasDropIn) {
    return NextResponse.json(
      { message: 'Member has no active membership and no drop-in price configured' },
      { status: 400 },
    );
  }

  // Re-evaluate capacity inside transaction to avoid double-booking race
  const booking = await prisma.$transaction(async (tx) => {
    const taken = await tx.booking.count({
      where: {
        sessionId: parsed.data.sessionId,
        tenantId: user.tenantId,
        status: { in: ['BOOKED', 'CHECKED_IN'] as any },
      },
    });
    const overCapacity = taken >= capacity;
    const waitlistAhead = overCapacity
      ? await tx.booking.count({
          where: {
            sessionId: parsed.data.sessionId,
            tenantId: user.tenantId,
            status: 'WAITLISTED' as any,
          },
        })
      : 0;

    if (existing) {
      return tx.booking.update({
        where: { id: existing.id },
        data: {
          status: overCapacity ? 'WAITLISTED' : 'BOOKED',
          position: overCapacity ? waitlistAhead + 1 : null,
          cancelledAt: null,
        },
        include: {
          member: {
            select: { id: true, fullName: true, phone: true, membershipStatus: true },
          },
        },
      });
    }

    return tx.booking.create({
      data: {
        tenantId: user.tenantId,
        sessionId: parsed.data.sessionId,
        memberId: parsed.data.memberId,
        status: overCapacity ? 'WAITLISTED' : 'BOOKED',
        position: overCapacity ? waitlistAhead + 1 : null,
      },
      include: {
        member: {
          select: { id: true, fullName: true, phone: true, membershipStatus: true },
        },
      },
    });
  });

  return NextResponse.json(booking, { status: 201 });
}
