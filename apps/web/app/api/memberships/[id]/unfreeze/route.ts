import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { FreezeStatus, MembershipStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// POST /api/memberships/[id]/unfreeze
// ---------------------------------------------------------------------------
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const membership = await prisma.membership.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      member: { select: { id: true, fullName: true, phone: true, preferredLocale: true } },
      plan: { select: { id: true, nameEn: true, nameAr: true } },
      freezes: { orderBy: { startDate: 'desc' } },
    },
  });

  if (!membership) {
    return NextResponse.json({ message: 'Membership not found' }, { status: 404 });
  }

  if (membership.status !== MembershipStatus.FROZEN) {
    return NextResponse.json(membership);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const active = membership.freezes.find(
      (f: { status: string }) => f.status === FreezeStatus.ACTIVE,
    );
    if (active) {
      await tx.membershipFreeze.update({
        where: { id: active.id },
        data: { status: FreezeStatus.COMPLETED },
      });
    }
    const u = await tx.membership.update({
      where: { id },
      data: { status: MembershipStatus.ACTIVE, frozenUntil: null },
    });
    await tx.member.update({
      where: { id: membership.memberId },
      data: { membershipStatus: MembershipStatus.ACTIVE, membershipExpiresAt: u.endDate },
    });
    return u;
  });

  return NextResponse.json(updated);
}
