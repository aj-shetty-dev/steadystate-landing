import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// GET /api/billing/reconciliation
// ---------------------------------------------------------------------------
export async function GET() {
  const user = await requireServerUser();
  const tenantId = user.tenantId;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [posAgg, invoiceAgg, activeMembers] = await Promise.all([
    prisma.sale.aggregate({
      where: { tenantId, paymentStatus: 'PAID', createdAt: { gte: monthStart } },
      _sum: { totalAed: true },
    }),
    prisma.invoice.aggregate({
      where: { tenantId, status: 'PAID', createdAt: { gte: monthStart } },
      _sum: { amountAed: true },
    }),
    prisma.member.count({
      where: { tenantId, membershipStatus: 'ACTIVE' },
    }),
  ]);

  const posRevenue = posAgg._sum.totalAed ?? 0;
  const invoiceRevenue = invoiceAgg._sum.amountAed ?? 0;
  const totalRevenue = posRevenue + invoiceRevenue;

  // Average membership price from active plans for estimation
  const plansAgg = await prisma.membershipPlan.aggregate({
    where: { tenantId, active: true },
    _avg: { priceAed: true },
  });
  const avgPlanPrice = plansAgg._avg.priceAed ?? 0;
  const estimatedMonthly = activeMembers * avgPlanPrice;

  return NextResponse.json({
    posRevenueAed: (posRevenue / 100).toFixed(2),
    invoiceRevenueAed: (invoiceRevenue / 100).toFixed(2),
    totalRevenueAed: (totalRevenue / 100).toFixed(2),
    activeMembers,
    estimatedMonthlyAed: estimatedMonthly.toFixed(2),
  });
}
