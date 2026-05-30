import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// GET /api/billing/invoices/:id
// ---------------------------------------------------------------------------
// Get a single invoice by ID with member info and recent payment attempts.
// Matches NestJS BillingController.getOne.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      member: { select: { id: true, fullName: true, phone: true, email: true } },
      attempts: { orderBy: { scheduledFor: 'desc' }, take: 20 },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  return NextResponse.json(invoice);
}
