import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// GET /api/pos/sales/[id]
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const sale = await prisma.sale.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      lines: true,
      member: {
        select: { id: true, fullName: true, email: true, phone: true },
      },
      staff: { select: { id: true, fullName: true } },
    },
  });

  if (!sale) {
    return NextResponse.json({ message: 'Sale not found' }, { status: 404 });
  }

  return NextResponse.json(sale);
}
