import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { MembershipStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// POST /api/memberships/[id]/change-plan
// ---------------------------------------------------------------------------
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;
  const body = await req.json();
  const { newPlanId, startDate } = body as { newPlanId?: string; startDate?: string };

  if (!newPlanId) {
    return NextResponse.json({ message: 'newPlanId is required' }, { status: 400 });
  }

  const membership = await prisma.membership.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { plan: { select: { id: true, nameEn: true } } },
  });

  if (!membership) {
    return NextResponse.json({ message: 'Membership not found' }, { status: 404 });
  }

  const newPlan = await prisma.membershipPlan.findFirst({
    where: { id: newPlanId, tenantId: user.tenantId, active: true },
  });

  if (!newPlan) {
    return NextResponse.json({ message: 'Plan not found or inactive' }, { status: 404 });
  }

  const effectiveStart = startDate ? new Date(startDate) : new Date();
  const endDate = new Date(effectiveStart);
  endDate.setDate(endDate.getDate() + newPlan.durationDays);

  const result = await prisma.$transaction(async (tx) => {
    // Cancel the current membership
    await tx.membership.update({
      where: { id },
      data: { status: MembershipStatus.CANCELLED, cancellationReason: `Changed to ${newPlan.nameEn}` },
    });

    // Create a new active membership
    const created = await tx.membership.create({
      data: {
        tenantId: user.tenantId,
        memberId: membership.memberId,
        planId: newPlanId,
        status: MembershipStatus.ACTIVE,
        startDate: effectiveStart,
        endDate,
      },
      include: {
        member: { select: { id: true, fullName: true, phone: true } },
        plan: { select: { id: true, nameEn: true, durationDays: true, priceAed: true } },
      },
    });

    // Update member status to ACTIVE
    await tx.member.update({
      where: { id: membership.memberId },
      data: { membershipStatus: MembershipStatus.ACTIVE, membershipExpiresAt: endDate },
    });

    return created;
  });

  return NextResponse.json(result, { status: 201 });
}
