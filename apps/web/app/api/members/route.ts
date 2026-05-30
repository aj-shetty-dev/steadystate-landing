import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { createMemberSchema } from '@/lib/schemas/members';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function loadActivePlanNames(tenantId: string, memberIds: string[]) {
  const map = new Map<string, string[]>();
  if (memberIds.length === 0) return map;
  const memberships = await prisma.membership.findMany({
    where: {
      tenantId,
      memberId: { in: memberIds },
      status: { in: ['ACTIVE', 'FROZEN'] },
    },
    select: { memberId: true, plan: { select: { nameEn: true } } },
    orderBy: { startDate: 'desc' },
  });
  for (const m of memberships) {
    const existing = map.get(m.memberId);
    if (existing) existing.push(m.plan.nameEn);
    else map.set(m.memberId, [m.plan.nameEn]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// GET /api/members
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const qs = req.nextUrl.searchParams;
  const page = Math.max(parseInt(qs.get('page') ?? '1') || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(qs.get('pageSize') ?? '25') || 25, 1), 100);
  const search = qs.get('search')?.trim();
  const status = qs.get('status');

  const validStatuses = ['ACTIVE', 'FROZEN', 'CANCELLED', 'PENDING_PAYMENT'];
  const statusFilter = status && validStatuses.includes(status) ? status : undefined;

  const take = pageSize;
  const skip = (page - 1) * take;

  const where: Record<string, unknown> = {
    tenantId: user.tenantId,
    ...(statusFilter ? { membershipStatus: statusFilter } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.member.findMany({
      where: where as any,
      orderBy: { lastCheckinAt: { sort: 'desc', nulls: 'last' } },
      skip,
      take,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        membershipStatus: true,
        provider: true,
        lastCheckinAt: true,
        joinedAt: true,
      },
    }),
    prisma.member.count({ where: where as any }),
  ]);

  const activePlanByMember = await loadActivePlanNames(user.tenantId, items.map((m) => m.id));
  const enriched = items.map((m) => ({ ...m, activePlanNames: activePlanByMember.get(m.id) ?? [] }));

  return NextResponse.json({ items: enriched, total, page, pageSize: take });
}

// ---------------------------------------------------------------------------
// POST /api/members
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();
  const parsed = createMemberSchema.parse(body);

  if (parsed.phone) {
    const dup = await prisma.member.findFirst({
      where: { tenantId: user.tenantId, phone: parsed.phone },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json({ message: 'A member with this phone number already exists' }, { status: 409 });
    }
  }

  const member = await prisma.member.create({
    data: {
      tenantId: user.tenantId,
      externalId: randomUUID(),
      provider: 'NATIVE',
      source: 'MANUAL',
      fullName: parsed.fullName,
      phone: parsed.phone ?? null,
      email: parsed.email ?? null,
      membershipStatus: parsed.membershipStatus,
      joinedAt: parsed.joinedAt ? new Date(parsed.joinedAt) : new Date(),
      preferredLocale: parsed.preferredLocale,
      gender: parsed.gender ?? null,
      dateOfBirth: parsed.dateOfBirth ? new Date(parsed.dateOfBirth) : null,
      medicalNotes: parsed.medicalNotes ?? null,
      emergencyContact: parsed.emergencyContact ?? null,
      assignedTrainerId: parsed.assignedTrainerId ?? null,
      raw: {},
    },
  });

  return NextResponse.json(member, { status: 201 });
}
