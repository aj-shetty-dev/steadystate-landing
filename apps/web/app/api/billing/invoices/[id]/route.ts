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

// ---------------------------------------------------------------------------
// PATCH /api/billing/invoices/:id
// ---------------------------------------------------------------------------
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;
  const body = await req.json();

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!invoice) {
    return NextResponse.json({ message: 'Invoice not found' }, { status: 404 });
  }

  if (invoice.status !== 'DUE') {
    return NextResponse.json(
      { message: 'Only DUE invoices can be edited' },
      { status: 400 },
    );
  }

  const { amountAed, vatAed, dueDate, description } = body as {
    amountAed?: number;
    vatAed?: number;
    dueDate?: string;
    description?: string | null;
  };

  const updated = await prisma.invoice.update({
    where: { id },
    data: {
      ...(amountAed !== undefined ? { amountAed } : {}),
      ...(vatAed !== undefined ? { vatAed } : {}),
      ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
      ...(description !== undefined ? { description } : {}),
    },
    include: {
      member: { select: { id: true, fullName: true, phone: true, email: true } },
      attempts: { orderBy: { scheduledFor: 'desc' }, take: 20 },
    },
  });

  return NextResponse.json(updated);
}
