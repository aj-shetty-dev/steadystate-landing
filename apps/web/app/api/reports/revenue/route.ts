import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

function defaultRange(from?: string, to?: string) {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 86400000);
  return { from: fromDate, to: toDate };
}

// ---------------------------------------------------------------------------
// GET /api/reports/revenue
// Revenue report with date range.
// Matching NestJS ReportingController.revenue → ReportingService.revenue
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const qs = req.nextUrl.searchParams;
  const { from, to } = defaultRange(qs.get('from') ?? undefined, qs.get('to') ?? undefined);

  const [sales, invoices] = await Promise.all([
    prisma.sale.aggregate({
      where: { tenantId: user.tenantId, paymentStatus: 'PAID', createdAt: { gte: from, lte: to } },
      _sum: { subtotalAed: true, vatAed: true, totalAed: true },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: { tenantId: user.tenantId, status: 'PAID', dueDate: { gte: from, lte: to } },
      _sum: { amountAed: true, vatAed: true },
      _count: { _all: true },
    }),
  ]);

  const invoiceTotal = (invoices._sum.amountAed ?? 0) + (invoices._sum.vatAed ?? 0);

  return NextResponse.json({
    range: { from, to },
    sales: {
      count: sales._count._all,
      subtotalAed: sales._sum.subtotalAed ?? 0,
      vatAed: sales._sum.vatAed ?? 0,
      totalAed: sales._sum.totalAed ?? 0,
    },
    invoices: {
      count: invoices._count._all,
      totalAed: invoiceTotal,
    },
    grandTotalAed: (sales._sum.totalAed ?? 0) + invoiceTotal,
  });
}
