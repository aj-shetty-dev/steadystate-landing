import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { MembershipStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// POST /api/memberships/[id]/cancel
// ---------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason: string | undefined = body?.reason;

  const membership = await prisma.membership.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      member: { select: { id: true, fullName: true, phone: true, preferredLocale: true } },
      plan: { select: { id: true, nameEn: true, nameAr: true } },
    },
  });

  if (!membership) {
    return NextResponse.json({ message: 'Membership not found' }, { status: 404 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.membership.update({
      where: { id },
      data: { status: MembershipStatus.CANCELLED, cancellationReason: reason ?? null, cancelAtPeriodEnd: false },
    });
    await tx.member.update({
      where: { id: membership.memberId },
      data: { membershipStatus: MembershipStatus.CANCELLED },
    });
    return u;
  });

  return NextResponse.json(updated);
}
