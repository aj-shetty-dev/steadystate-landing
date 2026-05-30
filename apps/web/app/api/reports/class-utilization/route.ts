import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

function defaultRange(from?: string, to?: string) {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 86400000);
  return { from: fromDate, to: toDate };
}

// ---------------------------------------------------------------------------
// GET /api/reports/class-utilization
// Class utilization report with date range.
// Matching NestJS ReportingController.classes → ReportingService.classUtilization
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const qs = req.nextUrl.searchParams;
  const { from, to } = defaultRange(qs.get('from') ?? undefined, qs.get('to') ?? undefined);

  const sessions = await prisma.classSession.findMany({
    where: {
      tenantId: user.tenantId,
      startsAt: { gte: from, lte: to },
      status: { in: ['SCHEDULED', 'COMPLETED'] },
    },
    include: {
      classType: { select: { id: true, nameEn: true, capacity: true } },
      bookings: {
        where: { status: { in: ['BOOKED', 'CHECKED_IN'] } },
        select: { id: true, status: true },
      },
    },
  });

  const byClass = new Map<
    string,
    {
      classTypeId: string;
      nameEn: string;
      sessions: number;
      capacity: number;
      booked: number;
      checkedIn: number;
    }
  >();

  for (const s of sessions) {
    const cap = s.capacityOverride ?? s.classType.capacity;
    const booked = s.bookings.length;
    const checked = s.bookings.filter((b) => b.status === 'CHECKED_IN').length;
    const cur = byClass.get(s.classType.id) ?? {
      classTypeId: s.classType.id,
      nameEn: s.classType.nameEn,
      sessions: 0,
      capacity: 0,
      booked: 0,
      checkedIn: 0,
    };
    cur.sessions += 1;
    cur.capacity += cap;
    cur.booked += booked;
    cur.checkedIn += checked;
    byClass.set(s.classType.id, cur);
  }

  const classes = [...byClass.values()].map((c) => ({
    ...c,
    fillRate: c.capacity ? c.booked / c.capacity : 0,
    attendanceRate: c.booked ? c.checkedIn / c.booked : 0,
  }));

  return NextResponse.json({
    range: { from, to },
    classes,
  });
}
