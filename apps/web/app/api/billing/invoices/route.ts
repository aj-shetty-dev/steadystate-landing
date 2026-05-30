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
