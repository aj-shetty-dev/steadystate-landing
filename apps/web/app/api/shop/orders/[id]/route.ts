import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// GET /api/shop/orders/[id]
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      member: { select: { id: true, fullName: true, phone: true, email: true } },
      lines: {
        include: { product: { select: { nameEn: true, sku: true } } },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ message: 'Order not found' }, { status: 404 });
  }

  return NextResponse.json(order);
}
