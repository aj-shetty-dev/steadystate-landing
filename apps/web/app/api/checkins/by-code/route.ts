import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import type { MembershipStatus } from '@prisma/client';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEDUPE_WINDOW_MIN = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizePhone(raw: string): string {
  const trimmed = raw.replace(/[\s\-\(\)\.]/g, '');
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('00')) return `+${trimmed.slice(2)}`;
  if (trimmed.startsWith('0')) return `+971${trimmed.slice(1)}`;
  return `+${trimmed}`;
}

const byCodeSchema = z.object({
  code: z.string().min(1, 'Check-in code is required.'),
  phone: z.string().min(1, 'Phone number is required.'),
});

// ---------------------------------------------------------------------------
// POST /api/checkins/by-code
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();

  const parsed = byCodeSchema.safeParse(body);
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

  const { code, phone } = parsed.data;

  // Find the class session by its checkin code
  const session = await prisma.classSession.findFirst({
    where: { checkinCode: code, tenantId: user.tenantId },
    select: { id: true, startsAt: true, status: true },
  });

  if (!session) {
    return NextResponse.json({ message: 'Invalid check-in code' }, { status: 404 });
  }

  if (session.status !== 'SCHEDULED') {
    return NextResponse.json(
      { message: 'This class session is no longer open for check-in' },
      { status: 400 },
    );
  }

  // Normalize and look up the member by phone
  const normalized = normalizePhone(phone);
  const member = await prisma.member.findFirst({
    where: { phone: normalized, tenantId: user.tenantId },
  });

  if (!member) {
    return NextResponse.json({ message: 'Member not found' }, { status: 404 });
  }

  // Check membership status
  const invalidStatuses: MembershipStatus[] = ['CANCELLED', 'EXPIRED'];
  if (invalidStatuses.includes(member.membershipStatus as MembershipStatus)) {
    return NextResponse.json(
      {
        message: `Member's membership is ${member.membershipStatus}; cannot check in. Renew first.`,
      },
      { status: 400 },
    );
  }

  const now = new Date();

  // Dedupe: reject if a check-in for this member was created within the dedupe window
  const dedupeSince = new Date(now.getTime() - DEDUPE_WINDOW_MIN * 60_000);
  const recent = await prisma.checkIn.findFirst({
    where: {
      tenantId: user.tenantId,
      memberId: member.id,
      checkedInAt: { gte: dedupeSince },
    },
    orderBy: { checkedInAt: 'desc' },
  });

  if (recent) {
    return NextResponse.json(
      {
        message: `Duplicate check-in: member already checked in within the last ${DEDUPE_WINDOW_MIN} minutes`,
      },
      { status: 409 },
    );
  }

  // Look for a booking for this member + session to auto-link
  const booking = await prisma.booking.findFirst({
    where: {
      tenantId: user.tenantId,
      memberId: member.id,
      sessionId: session.id,
      status: 'BOOKED',
    },
  });

  // Transaction: create checkin, update member lastCheckinAt, update booking if linked
  const ci = await prisma.$transaction(async (tx) => {
    const checkin = await tx.checkIn.create({
      data: {
        tenantId: user.tenantId,
        memberId: member.id,
        source: 'MOBILE_QR',
        sessionId: session.id,
      },
    });

    await tx.member.update({
      where: { id: member.id },
      data: { lastCheckinAt: now },
    });

    if (booking) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'CHECKED_IN', checkedInAt: now },
      });
    }

    return checkin;
  });

  return NextResponse.json(ci, { status: 201 });
}
