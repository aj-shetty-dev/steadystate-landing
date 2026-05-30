import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { PaymentStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// POST /api/pos/sales/[id]/pay
// Mark a sale as paid (only if PENDING).
// ---------------------------------------------------------------------------
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const sale = await prisma.sale.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, paymentStatus: true },
  });

  if (!sale) {
    return NextResponse.json({ message: 'Sale not found' }, { status: 404 });
  }

  if (sale.paymentStatus !== PaymentStatus.PENDING) {
    return NextResponse.json(
      { message: 'Sale is not in PENDING status' },
      { status: 400 },
    );
  }

  const updated = await prisma.sale.update({
    where: { id: sale.id },
    data: { paymentStatus: PaymentStatus.PAID },
    include: { lines: true },
  });

  return NextResponse.json(updated);
}
