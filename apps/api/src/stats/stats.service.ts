import { Injectable } from '@nestjs/common';
import { ChurnSignalStatus, LeadStage, MembershipStatus, WhatsappMessageStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface OverviewStats {
  members: { total: number; active: number };
  signals30d: { pending: number; nudged: number; dismissed: number; failed: number };
  messages30d: { total: number; sent: number; failed: number };
  leadsOpen: number;
  classesToday: number;
  revenueMtdAed: number;
}

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string, now: Date = new Date()): Promise<OverviewStats> {
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // 6 parallel queries instead of 12 — groupBy collapses per-status round-trips into one.
    const [memberRows, signalRows, messageRows, leadsOpen, classesToday, sales] = await Promise.all([
      this.prisma.member.groupBy({
        by: ['membershipStatus'],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.churnSignal.groupBy({
        by: ['status'],
        where: { tenantId, detectedAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.whatsappMessage.groupBy({
        by: ['status'],
        where: { tenantId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.lead.count({
        where: {
          tenantId,
          stage: { in: [LeadStage.NEW, LeadStage.CONTACTED, LeadStage.TRIAL_BOOKED, LeadStage.TRIAL_COMPLETED] },
        },
      }),
      this.prisma.classSession.count({
        where: { tenantId, startsAt: { gte: todayStart, lt: todayEnd }, status: 'SCHEDULED' },
      }),
      this.prisma.sale.aggregate({
        where: { tenantId, paymentStatus: 'PAID', createdAt: { gte: monthStart } },
        _sum: { totalAed: true },
      }),
    ]);

    const memberCount = (status: MembershipStatus) =>
      memberRows.find((r) => r.membershipStatus === status)?._count._all ?? 0;
    const signalCount = (status: ChurnSignalStatus) =>
      signalRows.find((r) => r.status === status)?._count._all ?? 0;
    const msgCount = (status: WhatsappMessageStatus) =>
      messageRows.find((r) => r.status === status)?._count._all ?? 0;

    return {
      members: {
        total: memberRows.reduce((s, r) => s + r._count._all, 0),
        active: memberCount(MembershipStatus.ACTIVE),
      },
      signals30d: {
        pending: signalCount(ChurnSignalStatus.PENDING),
        nudged: signalCount(ChurnSignalStatus.NUDGED),
        dismissed: signalCount(ChurnSignalStatus.DISMISSED),
        failed: signalCount(ChurnSignalStatus.FAILED),
      },
      messages30d: {
        total: messageRows.reduce((s, r) => s + r._count._all, 0),
        sent: msgCount(WhatsappMessageStatus.SENT),
        failed: msgCount(WhatsappMessageStatus.FAILED),
      },
      leadsOpen,
      classesToday,
      revenueMtdAed: sales._sum.totalAed ?? 0,
    };
  }
}
