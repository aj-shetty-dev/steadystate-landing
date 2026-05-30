import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { planInputSchema } from '../route';

// ---------------------------------------------------------------------------
// GET /api/membership-plans/[id]
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const plan = await prisma.membershipPlan.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!plan) {
    return NextResponse.json({ message: 'Plan not found' }, { status: 404 });
  }

  return NextResponse.json(plan);
}

// ---------------------------------------------------------------------------
// PATCH /api/membership-plans/[id]
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;
  const body = await req.json();

  const parsed = planInputSchema.partial().parse(body);

  const existing = await prisma.membershipPlan.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ message: 'Plan not found' }, { status: 404 });
  }

  const plan = await prisma.membershipPlan.update({
    where: { id },
    data: parsed,
  });

  return NextResponse.json(plan);
}
