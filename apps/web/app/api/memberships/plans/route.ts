import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// GET /api/memberships/plans
// Alias for /api/membership-plans.
// The frontend calls /memberships/plans but NestJS controller is at
// /membership-plans. This route re-exports the same logic.
// ---------------------------------------------------------------------------
export async function GET() {
  const user = await requireServerUser();

  const plans = await prisma.membershipPlan.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(plans);
}

// ---------------------------------------------------------------------------
// POST /api/memberships/plans
// Create a new membership plan (alias for /api/membership-plans POST).
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const user = await requireServerUser();
  const body = await request.json();

  const plan = await prisma.membershipPlan.create({
    data: {
      tenantId: user.tenantId,
      nameEn: body.nameEn,
      nameAr: body.nameAr ?? null,
      description: body.description ?? null,
      durationDays: body.durationDays,
      priceAed: body.priceAed,
      vatRate: body.vatRate ?? 5,
      includesClasses: body.includesClasses ?? false,
      maxFreezeDays: body.maxFreezeDays ?? 0,
      active: body.active ?? true,
    },
  });

  return NextResponse.json(plan, { status: 201 });
}
