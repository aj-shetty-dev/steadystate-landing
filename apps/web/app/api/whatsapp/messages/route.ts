import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import type { WhatsappMessageStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// GET /api/whatsapp/messages
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const qs = req.nextUrl.searchParams;
  const status = qs.get('status') ?? undefined;
  const search = qs.get('search') ?? undefined;
  const from = qs.get('from') ?? undefined;
  const to = qs.get('to') ?? undefined;
  const page = Math.max(parseInt(qs.get('page') ?? '1'), 1);
  const pageSize = Math.min(Math.max(parseInt(qs.get('pageSize') ?? '25'), 1), 100);
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { tenantId: user.tenantId };
  if (status && status !== 'ALL') where.status = status as WhatsappMessageStatus;
  if (search) where.to = { contains: search };
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
    if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to + 'T23:59:59.999Z');
  }

  const [items, total] = await prisma.$transaction([
    prisma.whatsappMessage.findMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: where as any,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        to: true,
        body: true,
        status: true,
        templateName: true,
        errorMessage: true,
        sentAt: true,
        createdAt: true,
      },
    }),
    prisma.whatsappMessage.count({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: where as any,
    }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}
