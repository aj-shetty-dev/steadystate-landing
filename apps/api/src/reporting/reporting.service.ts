import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface DateRange {
  from: Date;
  to: Date;
}

function defaultRange(range?: Partial<DateRange>): DateRange {
  const to = range?.to ?? new Date();
  const from = range?.from ?? new Date(to.getTime() - 30 * 86400000);
  return { from, to };
}

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async revenue(tenantId: string, range?: Partial<DateRange>) {
    const { from, to } = defaultRange(range);
    const [sales, invoices] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { tenantId, paymentStatus: 'PAID', createdAt: { gte: from, lte: to } },
        _sum: { subtotalAed: true, vatAed: true, totalAed: true },
        _count: { _all: true },
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId, status: 'PAID', dueDate: { gte: from, lte: to } },
        _sum: { amountAed: true, vatAed: true },
        _count: { _all: true },
      }),
    ]);
    const invoiceTotal = (invoices._sum.amountAed ?? 0) + (invoices._sum.vatAed ?? 0);
    return {
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
    };
  }

  async memberGrowth(tenantId: string, range?: Partial<DateRange>) {
    const { from, to } = defaultRange(range);
    const [added, churned, totalActive] = await Promise.all([
      this.prisma.member.count({
        where: { tenantId, joinedAt: { gte: from, lte: to } },
      }),
      this.prisma.member.count({
        where: { tenantId, membershipStatus: { in: ['EXPIRED', 'CANCELLED'] }, updatedAt: { gte: from, lte: to } },
      }),
      this.prisma.member.count({
        where: { tenantId, membershipStatus: 'ACTIVE' },
      }),
    ]);
    return {
      range: { from, to },
      newMembers: added,
      churnedMembers: churned,
      netGrowth: added - churned,
      currentActive: totalActive,
    };
  }

  async classUtilization(tenantId: string, range?: Partial<DateRange>) {
    const { from, to } = defaultRange(range);
    const sessions = await this.prisma.classSession.findMany({
      where: { tenantId, startsAt: { gte: from, lte: to }, status: { in: ['SCHEDULED', 'COMPLETED'] } },
      include: {
        classType: { select: { id: true, nameEn: true, capacity: true } },
        bookings: { where: { status: { in: ['BOOKED', 'CHECKED_IN'] } }, select: { id: true, status: true } },
      },
    });
    const byClass = new Map<string, { classTypeId: string; nameEn: string; sessions: number; capacity: number; booked: number; checkedIn: number }>();
    for (const s of sessions) {
      const cap = s.capacityOverride ?? s.classType.capacity;
      const booked = s.bookings.length;
      const checked = s.bookings.filter((b) => b.status === 'CHECKED_IN').length;
      const cur = byClass.get(s.classType.id) ?? { classTypeId: s.classType.id, nameEn: s.classType.nameEn, sessions: 0, capacity: 0, booked: 0, checkedIn: 0 };
      cur.sessions += 1;
      cur.capacity += cap;
      cur.booked += booked;
      cur.checkedIn += checked;
      byClass.set(s.classType.id, cur);
    }
    return {
      range: { from, to },
      classes: [...byClass.values()].map((c) => ({
        ...c,
        fillRate: c.capacity ? c.booked / c.capacity : 0,
        attendanceRate: c.booked ? c.checkedIn / c.booked : 0,
      })),
    };
  }

  async staffCommission(tenantId: string, range?: Partial<DateRange>) {
    const { from, to } = defaultRange(range);
    const staff = await this.prisma.staff.findMany({
      where: { tenantId, active: true },
      select: { id: true, fullName: true, role: true },
    });
    const sales = await this.prisma.sale.groupBy({
      by: ['staffId'],
      where: { tenantId, staffId: { not: null }, paymentStatus: 'PAID', createdAt: { gte: from, lte: to } },
      _sum: { totalAed: true },
      _count: { _all: true },
    });
    const salesByStaff = new Map(sales.map((s) => [s.staffId!, { totalAed: s._sum.totalAed ?? 0, count: s._count._all }]));
    return {
      range: { from, to },
      staff: staff.map((s) => {
        const stat = salesByStaff.get(s.id) ?? { totalAed: 0, count: 0 };
        return {
          id: s.id,
          name: s.fullName,
          role: s.role,
          salesCount: stat.count,
          totalAed: stat.totalAed,
        };
      }),
    };
  }
}
