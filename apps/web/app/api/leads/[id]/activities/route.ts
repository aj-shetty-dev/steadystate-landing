import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { LeadActivityType, LeadStage } from '@prisma/client';
import { z } from 'zod';

export const leadActivitySchema = z.object({
  type: z.nativeEnum(LeadActivityType),
  summary: z.string().min(1).max(1000),
});

// ---------------------------------------------------------------------------
// GET /api/leads/[id]/activities
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const lead = await prisma.lead.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!lead) {
    return NextResponse.json({ message: 'Lead not found' }, { status: 404 });
  }

  const activities = await prisma.leadActivity.findMany({
    where: { leadId: id, tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(activities);
}

// ---------------------------------------------------------------------------
// POST /api/leads/[id]/activities
// ---------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const lead = await prisma.lead.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, stage: true },
  });
  if (!lead) {
    return NextResponse.json({ message: 'Lead not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = leadActivitySchema.parse(body);

  const activity = await prisma.$transaction(async (tx) => {
    const act = await tx.leadActivity.create({
      data: {
        tenantId: user.tenantId,
        leadId: id,
        type: parsed.type,
        summary: parsed.summary,
        createdByUserId: user.id,
      },
    });

    // Auto-transition NEW -> CONTACTED on first activity
    if (lead.stage === LeadStage.NEW) {
      await tx.lead.update({ where: { id }, data: { stage: LeadStage.CONTACTED } });
    }

    return act;
  });

  return NextResponse.json(activity, { status: 201 });
}
