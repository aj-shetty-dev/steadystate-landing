import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

export async function GET(_req: NextRequest) {
  const user = await requireServerUser();

  const orders = await prisma.order.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 25,
    include: {
      member: { select: { id: true, fullName: true } },
      lines: { include: { product: { select: { nameEn: true, sku: true } } } },
    },
  });

  const items = orders.map((o) => ({
    id: o.id,
    memberId: o.memberId,
    status: o.status,
    subtotalAed: o.subtotalAed,
    vatAed: o.vatAed,
    totalAed: o.totalAed,
    currency: o.currency,
    createdAt: o.createdAt.toISOString(),
    member: o.member,
    lines: o.lines,
  }));

  return NextResponse.json({ items, total: items.length, page: 1, pageSize: 25 });
}
