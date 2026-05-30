import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { LeadStage } from '@prisma/client';
import { z } from 'zod';
import { leadCreateSchema } from '../route';

export const leadUpdateSchema = leadCreateSchema.partial().extend({
  stage: z.nativeEnum(LeadStage).optional(),
});

// Disallow nonsensical transitions. CONVERTED is terminal (must go through convert()).
// LOST can be revived back to NEW for re-engagement.
const ALLOWED_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  [LeadStage.NEW]: [LeadStage.CONTACTED, LeadStage.TRIAL_BOOKED, LeadStage.TRIAL_COMPLETED, LeadStage.LOST],
  [LeadStage.CONTACTED]: [LeadStage.TRIAL_BOOKED, LeadStage.TRIAL_COMPLETED, LeadStage.LOST],
  [LeadStage.TRIAL_BOOKED]: [LeadStage.TRIAL_COMPLETED, LeadStage.CONTACTED, LeadStage.LOST],
  [LeadStage.TRIAL_COMPLETED]: [LeadStage.CONTACTED, LeadStage.LOST],
  [LeadStage.CONVERTED]: [],
  [LeadStage.LOST]: [LeadStage.NEW],
};

// ---------------------------------------------------------------------------
// GET /api/leads/[id]
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const lead = await prisma.lead.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { activities: { orderBy: { createdAt: 'desc' } } },
  });

  if (!lead) {
    return NextResponse.json({ message: 'Lead not found' }, { status: 404 });
  }

  return NextResponse.json(lead);
}

// ---------------------------------------------------------------------------
// PATCH /api/leads/[id]
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const current = await prisma.lead.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!current) {
    return NextResponse.json({ message: 'Lead not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = leadUpdateSchema.parse(body);

  if (parsed.stage && parsed.stage !== current.stage) {
    if (parsed.stage === LeadStage.CONVERTED) {
      return NextResponse.json(
        { message: 'Use convert endpoint to mark as CONVERTED' },
        { status: 400 },
      );
    }
    const allowed = ALLOWED_TRANSITIONS[current.stage as LeadStage] ?? [];
    if (!parsed.stage || !allowed.includes(parsed.stage)) {
      return NextResponse.json(
        { message: `Invalid stage transition ${current.stage} -> ${parsed.stage}` },
        { status: 400 },
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = { ...parsed };
  if (parsed.nextFollowUpAt) data.nextFollowUpAt = new Date(parsed.nextFollowUpAt);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lead = await prisma.lead.update({ where: { id }, data: data as any });

  return NextResponse.json(lead);
}
