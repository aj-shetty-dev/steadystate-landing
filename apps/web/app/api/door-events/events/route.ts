import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// GET /api/door-events/events
// List door events with pagination.
// Matching NestJS DoorEventController.listEvents → DoorEventService.listEvents
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const qs = req.nextUrl.searchParams;
  const page = Math.max(parseInt(qs.get('page') ?? '1'), 1);
  const pageSize = Math.min(Math.max(parseInt(qs.get('pageSize') ?? '25'), 1), 100);
  const skip = (page - 1) * pageSize;

  const [items, total] = await prisma.$transaction([
    prisma.doorEvent.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { occurredAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        member: { select: { id: true, fullName: true } },
      },
    }),
    prisma.doorEvent.count({ where: { tenantId: user.tenantId } }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}
