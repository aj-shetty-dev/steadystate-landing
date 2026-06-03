import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// GET /api/billing/invoices
// ---------------------------------------------------------------------------
// List invoices with pagination, optional filters: status, memberId, search
// Matches NestJS BillingService.listInvoices response shape exactly.
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const searchParams = req.nextUrl.searchParams;
  const page = Math.max(Number(searchParams.get('page')) || 1, 1);
  const pageSize = Math.min(Math.max(Number(searchParams.get('pageSize')) || 25, 1), 100);
  const memberId = searchParams.get('memberId') || undefined;
  const status = searchParams.get('status') || undefined;
  const search = searchParams.get('search') || undefined;

  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { tenantId: user.tenantId };
  if (memberId) where.memberId = memberId;
  if (status) where.status = status;
  if (search) {
    where.member = { fullName: { contains: search, mode: 'insensitive' } };
  }

  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { dueDate: 'desc' },
      skip,
      take: pageSize,
      include: { member: { select: { id: true, fullName: true, phone: true } } },
    }),
    prisma.invoice.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}

// ---------------------------------------------------------------------------
// POST /api/billing/invoices
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();

  const { memberId, amountAed, vatAed, dueDate, description } = body as {
    memberId?: string;
    amountAed?: number;
    vatAed?: number;
    dueDate?: string;
    description?: string;
  };

  if (!memberId || !amountAed || !dueDate) {
    return NextResponse.json(
      { message: 'memberId, amountAed (in fils), and dueDate are required' },
      { status: 400 },
    );
  }

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: user.tenantId,
      memberId,
      amountAed,
      vatAed: vatAed ?? 0,
      dueDate: new Date(dueDate),
      description: description ?? null,
      status: 'DUE',
    },
    include: {
      member: { select: { id: true, fullName: true, phone: true, email: true } },
      attempts: { orderBy: { scheduledFor: 'desc' }, take: 20 },
    },
  });

  return NextResponse.json(invoice, { status: 201 });
}
