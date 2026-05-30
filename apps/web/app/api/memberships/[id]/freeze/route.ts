import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { FreezeStatus, MembershipStatus } from '@prisma/client';
import { z } from 'zod';

export const freezeInputSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reason: z.string().max(500).optional(),
});

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function daysBetween(start: Date, end: Date): number {
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// POST /api/memberships/[id]/freeze
// ---------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;
  const body = await req.json();

  const parsed = freezeInputSchema.parse(body);
  const startDate = new Date(parsed.startDate);
  const endDate = new Date(parsed.endDate);

  if (endDate <= startDate) {
    return NextResponse.json({ message: 'endDate must be after startDate' }, { status: 400 });
  }
  const days = daysBetween(startDate, endDate);

  const membership = await prisma.membership.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      member: { select: { id: true, fullName: true, phone: true, preferredLocale: true } },
      plan: { select: { id: true, nameEn: true, nameAr: true, maxFreezeDays: true } },
      freezes: { orderBy: { startDate: 'desc' } },
    },
  });

  if (!membership) {
    return NextResponse.json({ message: 'Membership not found' }, { status: 404 });
  }

  if (membership.status === MembershipStatus.CANCELLED || membership.status === MembershipStatus.EXPIRED) {
    return NextResponse.json(
      { message: `Cannot freeze a ${membership.status} membership` },
      { status: 400 },
    );
  }

  const usedDays = membership.freezes
    .filter((f: { status: string }) => f.status !== FreezeStatus.CANCELLED)
    .reduce((sum: number, f: { daysUsed: number }) => sum + f.daysUsed, 0);
  if (usedDays + days > membership.plan.maxFreezeDays) {
    return NextResponse.json(
      { message: `Freeze quota exceeded: requested ${days}, used ${usedDays}, allowed ${membership.plan.maxFreezeDays}` },
      { status: 400 },
    );
  }

  const overlappingFreeze = await prisma.membershipFreeze.findFirst({
    where: {
      membershipId: id,
      tenantId: user.tenantId,
      status: FreezeStatus.ACTIVE,
      startDate: { lt: endDate },
      endDate: { gt: startDate },
    },
  });
  if (overlappingFreeze) {
    return NextResponse.json(
      { message: 'A freeze already exists for this period' },
      { status: 409 },
    );
  }

  const freeze = await prisma.$transaction(async (tx) => {
    const f = await tx.membershipFreeze.create({
      data: {
        tenantId: user.tenantId,
        membershipId: id,
        startDate,
        endDate,
        daysUsed: days,
        reason: parsed.reason ?? null,
        approvedByUserId: user.id,
        status: FreezeStatus.ACTIVE,
      },
    });
    const newEnd = addDays(membership.endDate, days);
    await tx.membership.update({
      where: { id },
      data: { status: MembershipStatus.FROZEN, frozenUntil: endDate, endDate: newEnd },
    });
    await tx.member.update({
      where: { id: membership.memberId },
      data: { membershipStatus: MembershipStatus.FROZEN, membershipExpiresAt: newEnd },
    });
    return f;
  });

  return NextResponse.json(freeze, { status: 201 });
}
