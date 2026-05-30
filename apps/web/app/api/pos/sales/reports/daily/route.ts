import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// GET /api/pos/sales/reports/daily
// Daily sales aggregation.
// Matching NestJS PosController.daily → PosService.dailyTotals
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const qs = req.nextUrl.searchParams;
  const dateStr = qs.get('date') ?? new Date().toISOString();
  const date = new Date(dateStr);

  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 1);

  const result = await prisma.sale.aggregate({
    where: {
      tenantId: user.tenantId,
      createdAt: { gte: start, lt: end },
      paymentStatus: 'PAID',
    },
    _sum: { subtotalAed: true, vatAed: true, totalAed: true },
    _count: { _all: true },
  });

  return NextResponse.json(result);
}
