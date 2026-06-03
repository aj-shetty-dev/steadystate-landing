import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { MembershipStatus } from '@prisma/client';
import { z } from 'zod';

export const createMembershipSchema = z.object({
  memberId: z.string().min(1),
  planId: z.string().min(1),
  startDate: z.string().datetime().optional(),
  status: z.nativeEnum(MembershipStatus).optional(),
});

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// ---------------------------------------------------------------------------
// GET /api/memberships
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const qs = req.nextUrl.searchParams;
  const statusParam = qs.get('status');
  const memberId = qs.get('memberId');
  const search = qs.get('search');
  const page = Math.max(parseInt(qs.get('page') ?? '1') || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(qs.get('pageSize') ?? '25') || 25, 1), 100);

  const status = statusParam && statusParam in MembershipStatus
    ? (statusParam as MembershipStatus)
    : undefined;

  const take = pageSize;
  const skip = (page - 1) * take;
  const q = search?.trim();

  const where: Record<string, unknown> = {
    tenantId: user.tenantId,
    ...(status ? { status } : {}),
    ...(memberId ? { memberId } : {}),
    ...(q
      ? {
          member: {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q } },
            ],
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.membership.findMany({
      where: where as any,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        member: { select: { id: true, fullName: true, phone: true } },
        plan: { select: { id: true, nameEn: true, durationDays: true, priceAed: true } },
      },
    }),
    prisma.membership.count({ where: where as any }),
  ]);

  return NextResponse.json({ items, total, page: Math.max(page, 1), pageSize: take });
}

// ---------------------------------------------------------------------------
// POST /api/memberships
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();

  const parsed = createMembershipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.errors.map((e) => e.message).join('; ') },
      { status: 400 },
    );
  }

  const [member, plan] = await Promise.all([
    prisma.member.findFirst({
      where: { id: parsed.data.memberId, tenantId: user.tenantId },
      select: { id: true, fullName: true, phone: true, preferredLocale: true },
    }),
    prisma.membershipPlan.findFirst({
      where: { id: parsed.data.planId, tenantId: user.tenantId, active: true },
    }),
  ]);

  if (!member) {
    return NextResponse.json({ message: 'Member not found' }, { status: 404 });
  }
  if (!plan) {
    return NextResponse.json({ message: 'Plan not found or inactive' }, { status: 404 });
  }

  const start = parsed.data.startDate ? new Date(parsed.data.startDate) : new Date();
  const end = addDays(start, plan.durationDays);
  const status = parsed.data.status ?? MembershipStatus.PENDING_PAYMENT;

  // Check for overlapping active/pending/frozen memberships
  const overlapping = await prisma.membership.findFirst({
    where: {
      tenantId: user.tenantId,
      memberId: parsed.data.memberId,
      planId: parsed.data.planId,
      status: { in: [MembershipStatus.ACTIVE, MembershipStatus.FROZEN, MembershipStatus.PENDING_PAYMENT] },
      endDate: { gt: start },
      startDate: { lt: end },
    },
    select: { id: true },
  });
  if (overlapping) {
    return NextResponse.json(
      { message: 'Member already has an overlapping active or pending membership' },
      { status: 409 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const m = await tx.membership.create({
      data: {
        tenantId: user.tenantId,
        memberId: parsed.data.memberId,
        planId: parsed.data.planId,
        startDate: start,
        endDate: end,
        status,
      },
    });
    if (status === MembershipStatus.ACTIVE) {
      await tx.member.update({
        where: { id: parsed.data.memberId },
        data: { membershipStatus: MembershipStatus.ACTIVE, membershipExpiresAt: end },
      });
    }
    return m;
  });

  return NextResponse.json(created, { status: 201 });
}
