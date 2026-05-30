import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// GET /api/stats/overview
// Dashboard overview stats — member counts, churn signals, messages, leads,
// classes today, and MTD revenue.
// Mirrors NestJS StatsService.overview() exactly.
// ---------------------------------------------------------------------------
export async function GET(_req: NextRequest) {
  const user = await requireServerUser();
  const tenantId = user.tenantId;

  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [memberRows, signalRows, messageRows, leadsOpen, classesToday, sales] = await Promise.all([
    prisma.member.groupBy({
      by: ['membershipStatus'],
      where: { tenantId },
      _count: { _all: true },
    }),
    prisma.churnSignal.groupBy({
      by: ['status'],
      where: { tenantId, detectedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.whatsappMessage.groupBy({
      by: ['status'],
      where: { tenantId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.lead.count({
      where: {
        tenantId,
        stage: { in: ['NEW', 'CONTACTED', 'TRIAL_BOOKED', 'TRIAL_COMPLETED'] },
      },
    }),
    prisma.classSession.count({
      where: { tenantId, startsAt: { gte: todayStart, lt: todayEnd }, status: 'SCHEDULED' },
    }),
    prisma.sale.aggregate({
      where: { tenantId, paymentStatus: 'PAID', createdAt: { gte: monthStart } },
      _sum: { totalAed: true },
    }),
  ]);

  const memberCount = (status: string) =>
    memberRows.find((r) => r.membershipStatus === status)?._count._all ?? 0;
  const signalCount = (status: string) =>
    signalRows.find((r) => r.status === status)?._count._all ?? 0;
  const msgCount = (status: string) =>
    messageRows.find((r) => r.status === status)?._count._all ?? 0;

  return NextResponse.json({
    members: {
      total: memberRows.reduce((s, r) => s + r._count._all, 0),
      active: memberCount('ACTIVE'),
    },
    signals30d: {
      pending: signalCount('PENDING'),
      nudged: signalCount('NUDGED'),
      dismissed: signalCount('DISMISSED'),
      failed: signalCount('FAILED'),
    },
    messages30d: {
      total: messageRows.reduce((s, r) => s + r._count._all, 0),
      sent: msgCount('SENT'),
      failed: msgCount('FAILED'),
    },
    leadsOpen,
    classesToday,
    revenueMtdAed: sales._sum.totalAed ?? 0,
  });
}
