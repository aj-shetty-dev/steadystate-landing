import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

function defaultRange(from?: string, to?: string) {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 86400000);
  return { from: fromDate, to: toDate };
}

// ---------------------------------------------------------------------------
// GET /api/reports/staff-commission
// Staff commission report with date range.
// Matching NestJS ReportingController.commission → ReportingService.staffCommission
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const qs = req.nextUrl.searchParams;
  const { from, to } = defaultRange(qs.get('from') ?? undefined, qs.get('to') ?? undefined);

  const staff = await prisma.staff.findMany({
    where: { tenantId: user.tenantId, active: true },
    select: { id: true, fullName: true, role: true },
  });

  const sales = await prisma.sale.groupBy({
    by: ['staffId'],
    where: {
      tenantId: user.tenantId,
      staffId: { not: null },
      paymentStatus: 'PAID',
      createdAt: { gte: from, lte: to },
    },
    _sum: { totalAed: true },
    _count: { _all: true },
  });

  const salesByStaff = new Map(
    sales.map((s) => [s.staffId!, { totalAed: s._sum.totalAed ?? 0, count: s._count._all }]),
  );

  const result = staff.map((s) => {
    const stat = salesByStaff.get(s.id) ?? { totalAed: 0, count: 0 };
    return {
      id: s.id,
      name: s.fullName,
      role: s.role,
      salesCount: stat.count,
      totalAed: stat.totalAed,
    };
  });

  return NextResponse.json({
    range: { from, to },
    staff: result,
  });
}
