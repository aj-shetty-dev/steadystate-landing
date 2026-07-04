import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { updateMemberSchema } from '@/lib/schemas/members';

// ---------------------------------------------------------------------------
// GET /api/members/[id]
// ---------------------------------------------------------------------------
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireServerUser();
  const { id } = await params;

  const member = await prisma.member.findFirst({
    where: { id, tenantId: user.tenantId },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      membershipStatus: true,
      membershipExpiresAt: true,
      provider: true,
      lastCheckinAt: true,
      joinedAt: true,
      externalId: true,
      preferredLocale: true,
      medicalNotes: true,
      dateOfBirth: true,
      gender: true,
      source: true,
      emergencyContact: true,
      assignedTrainerId: true,
      assignedTrainer: { select: { id: true, fullName: true } },
    },
  });

  if (!member) {
    return NextResponse.json({ message: 'Member not found' }, { status: 404 });
  }

  // Load active plan names
  const memberships = await prisma.membership.findMany({
    where: {
      tenantId: user.tenantId,
      memberId: member.id,
      status: { in: ['ACTIVE', 'FROZEN'] },
    },
    select: { plan: { select: { nameEn: true } } },
    orderBy: { startDate: 'desc' },
  });
  const activePlanNames = memberships.map((m) => m.plan.nameEn);

  return NextResponse.json({ ...member, activePlanNames });
}

// ---------------------------------------------------------------------------
// PATCH /api/members/[id]
// ---------------------------------------------------------------------------
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireServerUser();
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.member.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) {
    return NextResponse.json({ message: 'Member not found' }, { status: 404 });
  }

  const parsed = updateMemberSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.errors) {
      const field = issue.path.join('.') || 'form';
      if (!fieldErrors[field]) fieldErrors[issue.path.join('.') || 'form'] = issue.message;
    }
    return NextResponse.json(
      {
        message: Object.values(fieldErrors).join('; '),
        fieldErrors,
      },
      { status: 400 },
    );
  }

  if (parsed.data.phone && parsed.data.phone !== existing.phone) {
    const dup = await prisma.member.findFirst({
      where: { tenantId: user.tenantId, phone: parsed.data.phone, NOT: { id } },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json({ message: 'A member with this phone number already exists' }, { status: 409 });
    }
  }

  const member = await prisma.member.update({
    where: { id },
    data: {
      ...parsed.data,
      joinedAt: parsed.data.joinedAt ? new Date(parsed.data.joinedAt) : undefined,
      dateOfBirth:
        parsed.data.dateOfBirth === null ? null : parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : undefined,
      membershipExpiresAt:
        parsed.data.membershipExpiresAt === null
          ? null
          : parsed.data.membershipExpiresAt
            ? new Date(parsed.data.membershipExpiresAt)
            : undefined,
    },
  });

  return NextResponse.json(member);
}
