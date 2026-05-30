import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';

export const planInputSchema = z.object({
  nameEn: z.string().min(1).max(160),
  nameAr: z.string().max(160).optional(),
  description: z.string().max(2000).optional(),
  durationDays: z.number().int().positive().max(3650),
  priceAed: z.number().int().nonnegative(),
  vatRate: z.number().int().min(0).max(100).default(5),
  includesClasses: z.boolean().default(false),
  maxFreezeDays: z.number().int().min(0).max(365).default(0),
  active: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// GET /api/membership-plans
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const activeOnly = req.nextUrl.searchParams.get('active') === 'true';

  const plans = await prisma.membershipPlan.findMany({
    where: {
      tenantId: user.tenantId,
      ...(activeOnly ? { active: true } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(plans);
}

// ---------------------------------------------------------------------------
// POST /api/membership-plans
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();

  const parsed = planInputSchema.parse(body);

  const plan = await prisma.membershipPlan.create({
    data: {
      tenantId: user.tenantId,
      nameEn: parsed.nameEn,
      nameAr: parsed.nameAr ?? null,
      description: parsed.description ?? null,
      durationDays: parsed.durationDays,
      priceAed: parsed.priceAed,
      vatRate: parsed.vatRate,
      includesClasses: parsed.includesClasses,
      maxFreezeDays: parsed.maxFreezeDays,
      active: parsed.active,
    },
  });

  return NextResponse.json(plan, { status: 201 });
}
