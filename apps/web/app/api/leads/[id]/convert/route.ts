import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';

export const leadConvertSchema = z.object({
  planId: z.string().min(1).optional(),
  startDate: z.string().datetime().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/leads/[id]/convert
// ---------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = leadConvertSchema.parse(body ?? {});

  const lead = await prisma.lead.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!lead) {
    return NextResponse.json({ message: 'Lead not found' }, { status: 404 });
  }

  if (lead.convertedMemberId) {
    return NextResponse.json({ message: 'Lead already converted' }, { status: 400 });
  }

  const dup = await prisma.member.findFirst({
    where: { tenantId: user.tenantId, phone: lead.phone },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json(
      { message: `Member with phone ${lead.phone} already exists` },
      { status: 409 },
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const member = await tx.member.create({
      data: {
        tenantId: user.tenantId,
        externalId: `lead-${lead.id}`,
        fullName: lead.fullName,
        phone: lead.phone,
        email: lead.email,
        source: 'LEAD_CONVERSION',
        membershipStatus: 'PENDING_PAYMENT',
        joinedAt: new Date(),
        raw: {},
      },
    });

    let membershipId: string | null = null;
    if (parsed.planId) {
      const plan = await tx.membershipPlan.findFirst({
        where: { id: parsed.planId, tenantId: user.tenantId, active: true },
      });
      if (!plan) throw new Error('Plan not found');
      const start = parsed.startDate ? new Date(parsed.startDate) : new Date();
      const end = new Date(start.getTime() + plan.durationDays * 86400000);
      const ms = await tx.membership.create({
        data: {
          tenantId: user.tenantId,
          memberId: member.id,
          planId: plan.id,
          startDate: start,
          endDate: end,
          status: 'PENDING_PAYMENT',
        },
      });
      membershipId = ms.id;
    }

    await tx.lead.update({
      where: { id },
      data: { stage: 'CONVERTED', convertedMemberId: member.id },
    });

    return { memberId: member.id, membershipId };
  });

  return NextResponse.json(
    { memberId: result.memberId, membershipId: result.membershipId },
    { status: 201 },
  );
}
