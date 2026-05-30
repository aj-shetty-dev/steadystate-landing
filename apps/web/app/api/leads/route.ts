import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { LeadSource, LeadStage } from '@prisma/client';
import { z } from 'zod';

export const leadCreateSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(5),
  email: z.string().email().optional(),
  source: z.nativeEnum(LeadSource).optional(),
  notes: z.string().max(2000).optional(),
  assignedToUserId: z.string().optional(),
  nextFollowUpAt: z.string().datetime().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/leads
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const qs = req.nextUrl.searchParams;
  const stageParam = qs.get('stage');
  const assignedToUserId = qs.get('assignedToUserId');
  const rawTake = qs.get('take');
  const rawSkip = qs.get('skip');

  const stage = stageParam && stageParam in LeadStage
    ? (stageParam as LeadStage)
    : undefined;
  const take = Math.min(Math.max(parseInt(rawTake ?? '100') || 100, 1), 500);
  const skip = Math.max(parseInt(rawSkip ?? '0') || 0, 0);

  const leads = await prisma.lead.findMany({
    where: {
      tenantId: user.tenantId,
      ...(stage ? { stage } : {}),
      ...(assignedToUserId ? { assignedToUserId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    skip,
  });

  return NextResponse.json(leads);
}

// ---------------------------------------------------------------------------
// POST /api/leads
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();

  const parsed = leadCreateSchema.parse(body);

  const lead = await prisma.lead.create({
    data: {
      tenantId: user.tenantId,
      fullName: parsed.fullName,
      phone: parsed.phone,
      email: parsed.email,
      source: parsed.source ?? LeadSource.WALK_IN,
      notes: parsed.notes,
      assignedToUserId: parsed.assignedToUserId,
      nextFollowUpAt: parsed.nextFollowUpAt ? new Date(parsed.nextFollowUpAt) : null,
    },
  });

  return NextResponse.json(lead, { status: 201 });
}
