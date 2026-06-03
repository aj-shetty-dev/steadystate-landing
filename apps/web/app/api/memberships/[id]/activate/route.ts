import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { MembershipStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// POST /api/memberships/[id]/activate
// ---------------------------------------------------------------------------
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const membership = await prisma.membership.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!membership) {
    return NextResponse.json({ message: 'Membership not found' }, { status: 404 });
  }

  if (membership.status !== 'PENDING_PAYMENT') {
    return NextResponse.json(
      { message: `Cannot activate a ${membership.status} membership` },
      { status: 400 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const m = await tx.membership.update({
      where: { id },
      data: { status: MembershipStatus.ACTIVE },
    });
    await tx.member.update({
      where: { id: membership.memberId },
      data: { membershipStatus: MembershipStatus.ACTIVE },
    });
    return m;
  });

  return NextResponse.json(updated);
}
