import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// GET /api/admin/tenants
// List all tenants — SUPER_ADMIN only in NestJS (we simplify to requireServerUser).
// Matching NestJS AdminController.tenants
// ---------------------------------------------------------------------------
export async function GET(_req: NextRequest) {
  await requireServerUser();

  const rows = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      subscription: true,
      _count: { select: { users: true, members: true } },
    },
  });

  const result = rows.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    city: t.city,
    createdAt: t.createdAt,
    userCount: t._count.users,
    memberCount: t._count.members,
    subscription: t.subscription,
  }));

  return NextResponse.json(result);
}
