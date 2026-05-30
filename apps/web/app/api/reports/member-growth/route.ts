import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

function defaultRange(from?: string, to?: string) {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 86400000);
  return { from: fromDate, to: toDate };
}

// ---------------------------------------------------------------------------
// GET /api/reports/member-growth
// Member growth report with date range.
// Matching NestJS ReportingController.growth → ReportingService.memberGrowth
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const qs = req.nextUrl.searchParams;
  const { from, to } = defaultRange(qs.get('from') ?? undefined, qs.get('to') ?? undefined);

  const [added, churned, totalActive] = await Promise.all([
    prisma.member.count({
      where: { tenantId: user.tenantId, joinedAt: { gte: from, lte: to } },
    }),
    prisma.member.count({
      where: {
        tenantId: user.tenantId,
        membershipStatus: { in: ['EXPIRED', 'CANCELLED'] },
        updatedAt: { gte: from, lte: to },
      },
    }),
    prisma.member.count({
      where: { tenantId: user.tenantId, membershipStatus: 'ACTIVE' },
    }),
  ]);

  return NextResponse.json({
    range: { from, to },
    newMembers: added,
    churnedMembers: churned,
    netGrowth: added - churned,
    currentActive: totalActive,
  });
}
