import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';

const createInvoiceSchema = z.object({
  memberId: z.string().min(1, 'Member is required.'),
  amountAed: z.number().min(0, 'Amount must be 0 or more (in fils).'),
  vatAed: z.number().min(0).default(0),
  dueDate: z.string().min(1, 'Due date is required.'),
  description: z.string().optional().nullable(),
});

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

  const validStatuses = ['DUE', 'PAID', 'FAILED', 'RETRY_SCHEDULED', 'WRITTEN_OFF'];
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json(
      { message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
      { status: 400 },
    );
  }

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

  const parsed = createInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.errors) {
      const field = issue.path.join('.') || 'form';
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return NextResponse.json(
      { message: Object.values(fieldErrors).join('; '), fieldErrors },
      { status: 400 },
    );
  }

  const { memberId, amountAed, vatAed, dueDate, description } = parsed.data;

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: user.tenantId,
      memberId,
      amountAed,
      vatAed,
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
