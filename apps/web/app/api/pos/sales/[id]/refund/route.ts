import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { PaymentStatus } from '@prisma/client';
import { z } from 'zod';

const refundBodySchema = z.object({
  amountAed: z.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/pos/sales/[id]/refund
// Refund a sale (only if PAID or PARTIALLY_REFUNDED).
// matching NestJS PaymentsService.refundSale
// ---------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const sale = await prisma.sale.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!sale) {
    return NextResponse.json({ message: 'Sale not found' }, { status: 404 });
  }

  if (
    sale.paymentStatus !== PaymentStatus.PAID &&
    sale.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED
  ) {
    return NextResponse.json(
      { message: 'Only paid sales can be refunded' },
      { status: 400 },
    );
  }

  if (!sale.stripePaymentIntentId) {
    return NextResponse.json(
      { message: 'No payment intent to refund' },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = refundBodySchema.parse(body);

  const remaining = sale.totalAed - sale.refundedAed;
  const refundAmount = parsed.amountAed ?? remaining;

  if (refundAmount <= 0) {
    return NextResponse.json(
      { message: 'Nothing to refund' },
      { status: 400 },
    );
  }
  if (refundAmount > remaining) {
    return NextResponse.json(
      { message: 'Refund exceeds remaining amount' },
      { status: 400 },
    );
  }

  // Process refund via Stripe (live) or mock
  let refundId: string;
  let refundStatus: string;

  if (process.env.STRIPE_MODE === 'live') {
    const Stripe = (await import('stripe')).default;
    const stripeClient = new Stripe(
      process.env.STRIPE_SECRET_KEY ?? '',
      { apiVersion: '2024-12-18.acacia' as any },
    );
    const refund = await stripeClient.refunds.create({
      payment_intent: sale.stripePaymentIntentId,
      amount: refundAmount,
    });
    refundId = refund.id;
    refundStatus = refund.status ?? 'succeeded';
  } else {
    refundId = `re_mock_${Date.now()}`;
    refundStatus = 'succeeded';
  }

  const newRefunded = sale.refundedAed + refundAmount;
  const newStatus =
    newRefunded >= sale.totalAed
      ? PaymentStatus.REFUNDED
      : PaymentStatus.PARTIALLY_REFUNDED;

  await prisma.sale.update({
    where: { id: sale.id },
    data: { refundedAed: newRefunded, paymentStatus: newStatus },
  });

  return NextResponse.json({
    refundId,
    status: refundStatus,
    refundedAed: refundAmount,
    salePaymentStatus: newStatus,
  });
}
