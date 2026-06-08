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

  const validStatuses = ['ACTIVE', 'EXPIRED', 'PAUSED', 'FROZEN', 'CANCELLED', 'PENDING', 'PENDING_PAYMENT'];
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
  const parsed = createMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.errors.map((e) => e.message).join('; ') },
      { status: 400 },
    );
  }

  if (parsed.data.phone) {
    const dup = await prisma.member.findFirst({
      where: { tenantId: user.tenantId, phone: parsed.data.phone },
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
      fullName: parsed.data.fullName,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      membershipStatus: parsed.data.membershipStatus,
      joinedAt: parsed.data.joinedAt ? new Date(parsed.data.joinedAt) : new Date(),
      preferredLocale: parsed.data.preferredLocale,
      gender: parsed.data.gender ?? null,
      dateOfBirth: parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : null,
      medicalNotes: parsed.data.medicalNotes ?? null,
      emergencyContact: parsed.data.emergencyContact ?? null,
      assignedTrainerId: parsed.data.assignedTrainerId ?? null,
      raw: {},
    },
  });

  return NextResponse.json(member, { status: 201 });
}
