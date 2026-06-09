import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { MembershipStatus } from '@prisma/client';
import { z } from 'zod';

const changePlanSchema = z.object({
  newPlanId: z.string().min(1, 'newPlanId is required.'),
  startDate: z.string().optional(),
});

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

  const parsed = changePlanSchema.safeParse(body);
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

  const { newPlanId, startDate } = parsed.data;

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
