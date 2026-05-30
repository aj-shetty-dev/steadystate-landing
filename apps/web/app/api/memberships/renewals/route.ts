import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { MembershipStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// GET /api/memberships/renewals
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const daysParam = req.nextUrl.searchParams.get('days');
  const windowDays = daysParam
    ? Math.min(Math.max(parseInt(daysParam, 10) || 30, 1), 90)
    : 30;

  const cutoff = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000);

  const renewals = await prisma.membership.findMany({
    where: {
      tenantId: user.tenantId,
      status: MembershipStatus.PENDING_PAYMENT,
      startDate: { lte: cutoff },
    },
    include: {
      member: { select: { id: true, fullName: true, phone: true } },
      plan: { select: { id: true, nameEn: true, priceAed: true, durationDays: true } },
    },
    orderBy: { startDate: 'asc' },
    take: 200,
  });

  return NextResponse.json(renewals);
}
