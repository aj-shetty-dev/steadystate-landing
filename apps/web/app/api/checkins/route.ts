import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';
import type { CheckInSource, MembershipStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SESSION_LINK_WINDOW_MIN = 30;
const DEDUPE_WINDOW_MIN = 5;
const MAX_TAKE = 500;
const DEFAULT_TAKE = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizePhone(raw: string): string {
  const trimmed = raw.replace(/[\s\-\(\)\.]/g, '');
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('00')) return `+${trimmed.slice(2)}`;
  if (trimmed.startsWith('0')) return `+971${trimmed.slice(1)}`;
  return `+${trimmed}`;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const checkInSourceEnum = z.enum([
  'KIOSK_PIN',
  'KIOSK_QR',
  'DOOR_EVENT',
  'MANUAL',
  'MOBILE_QR',
]);

const checkInSchema = z
  .object({
    source: checkInSourceEnum,
    memberId: z.string().optional(),
    phone: z.string().optional(),
    qrToken: z.string().optional(),
    staffId: z.string().optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => data.memberId || data.phone || data.qrToken, {
    message: 'memberId, phone, or qrToken is required',
  });

// ---------------------------------------------------------------------------
// GET /api/checkins
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const qs = req.nextUrl.searchParams;
  const memberId = qs.get('memberId') ?? undefined;
  const from = qs.get('from') ? new Date(qs.get('from')!) : undefined;
  const to = qs.get('to') ? new Date(qs.get('to')!) : undefined;
  const takeParam = qs.get('take');
  const skipParam = qs.get('skip');

  const take = Math.min(Math.max(parseInt(takeParam ?? '') || DEFAULT_TAKE, 1), MAX_TAKE);
  const skip = Math.max(parseInt(skipParam ?? '') || 0, 0);

  const where: Record<string, unknown> = {
    tenantId: user.tenantId,
    ...(memberId ? { memberId } : {}),
    ...(from || to
      ? { checkedInAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };

  const items = await prisma.checkIn.findMany({
    where: where as any,
    orderBy: { checkedInAt: 'desc' },
    take,
    skip,
    include: {
      member: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json(items);
}

// ---------------------------------------------------------------------------
// POST /api/checkins
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();

  // Validate input
  const parsed = checkInSchema.safeParse(body);
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

  // Resolve member
  const member = await resolveMember(user.tenantId, parsed.data);
  if (!member) {
    return NextResponse.json({ message: 'Member not found' }, { status: 404 });
  }

  // Check membership status
  const invalidStatuses: MembershipStatus[] = ['CANCELLED', 'EXPIRED'];
  if (invalidStatuses.includes(member.membershipStatus as MembershipStatus)) {
    return NextResponse.json(
      {
        message: `Member's membership is ${member.membershipStatus}; cannot check in. Renew first.`,
      },
      { status: 400 },
    );
  }

  // Validate staff if provided
  if (parsed.data.staffId) {
    const staff = await prisma.staff.findFirst({
      where: { id: parsed.data.staffId, tenantId: user.tenantId, active: true },
      select: { id: true },
    });
    if (!staff) {
      return NextResponse.json({ message: 'Staff not found or inactive' }, { status: 400 });
    }
  }

  const now = new Date();

  // Dedupe: reject if a check-in for this member was created within the dedupe window
  const dedupeSince = new Date(now.getTime() - DEDUPE_WINDOW_MIN * 60_000);
  const recent = await prisma.checkIn.findFirst({
    where: {
      tenantId: user.tenantId,
      memberId: member.id,
      checkedInAt: { gte: dedupeSince },
    },
    orderBy: { checkedInAt: 'desc' },
  });
  if (recent) {
    return NextResponse.json(
      {
        message: `Duplicate check-in: member already checked in within the last ${DEDUPE_WINDOW_MIN} minutes`,
      },
      { status: 409 },
    );
  }

  // Look for a nearby booking to link
  const windowStart = new Date(now.getTime() - SESSION_LINK_WINDOW_MIN * 60_000);
  const windowEnd = new Date(now.getTime() + SESSION_LINK_WINDOW_MIN * 60_000);
  const booking = await prisma.booking.findFirst({
    where: {
      tenantId: user.tenantId,
      memberId: member.id,
      status: 'BOOKED',
      session: { startsAt: { gte: windowStart, lte: windowEnd } },
    },
    include: { session: true },
  });

  // Transaction: create checkin, update member, optionally update booking
  const ci = await prisma.$transaction(async (tx) => {
    const checkin = await tx.checkIn.create({
      data: {
        tenantId: user.tenantId,
        memberId: member.id,
        source: parsed.data.source as CheckInSource,
        staffId: parsed.data.staffId ?? null,
        sessionId: booking?.sessionId ?? null,
        notes: parsed.data.notes ?? null,
      },
    });

    await tx.member.update({
      where: { id: member.id },
      data: { lastCheckinAt: now },
    });

    if (booking) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'CHECKED_IN', checkedInAt: now },
      });
    }

    return checkin;
  });

  return NextResponse.json(ci, { status: 201 });
}

// ---------------------------------------------------------------------------
// Shared: resolve a member by memberId, phone, or qrToken
// ---------------------------------------------------------------------------
async function resolveMember(
  tenantId: string,
  params: { memberId?: string; phone?: string; qrToken?: string },
) {
  if (params.memberId) {
    return prisma.member.findFirst({ where: { id: params.memberId, tenantId } });
  }

  if (params.qrToken) {
    const tok = await prisma.memberQrToken.findFirst({
      where: { token: params.qrToken, expiresAt: { gt: new Date() } },
    });
    if (!tok || tok.tenantId !== tenantId) return null;
    return prisma.member.findFirst({ where: { id: tok.memberId, tenantId } });
  }

  if (params.phone) {
    const normalized = normalizePhone(params.phone);
    const found = await prisma.member.findFirst({
      where: { phone: normalized, tenantId },
    });
    if (found) return found;
    // Fall back to raw input in case data isn't normalized in DB yet
    return prisma.member.findFirst({ where: { phone: params.phone, tenantId } });
  }

  return null;
}
