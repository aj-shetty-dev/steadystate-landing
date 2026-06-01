import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

export async function GET(_req: NextRequest) {
  const user = await requireServerUser();

  const products = await prisma.product.findMany({
    where: { tenantId: user.tenantId, active: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(products);
}
