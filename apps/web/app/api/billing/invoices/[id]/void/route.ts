import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// POST /api/billing/invoices/:id/void
// ---------------------------------------------------------------------------
// Void an invoice. Matches NestJS BillingController.voidInvoice:
// - Returns 404 if not found
// - Returns 400 if already PAID (cannot void a paid invoice)
// - Sets status to WRITTEN_OFF otherwise
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (invoice.status === 'PAID') {
    return NextResponse.json(
      { error: 'Cannot void a paid invoice' },
      { status: 400 },
    );
  }

  const updated = await prisma.invoice.update({
    where: { id },
    data: { status: 'WRITTEN_OFF' },
  });

  return NextResponse.json(updated);
}
