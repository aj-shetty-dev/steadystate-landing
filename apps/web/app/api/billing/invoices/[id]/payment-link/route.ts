import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// POST /api/billing/invoices/:id/payment-link
// ---------------------------------------------------------------------------
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { member: { select: { fullName: true, email: true } } },
  });

  if (!invoice) {
    return NextResponse.json({ message: 'Invoice not found' }, { status: 404 });
  }

  // Generate a payment URL — for MVP this is a simple invoice page URL.
  // When Stripe is integrated, this would create a Stripe Checkout session.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const url = `${baseUrl}/billing/invoices/${invoice.id}`;

  return NextResponse.json({ url });
}
