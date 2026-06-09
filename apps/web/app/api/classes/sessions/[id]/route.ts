import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const rescheduleSessionSchema = z.object({
  startsAt: z.string().refine((v) => /^\d{4}-\d{2}-\d{2}/.test(v) && !isNaN(new Date(v).getTime()), { message: "Invalid date. Use YYYY-MM-DD format (e.g. 2025-06-09)." }),
});

// ---------------------------------------------------------------------------
// GET /api/classes/sessions/[id]
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const session = await prisma.classSession.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      classType: true,
      instructor: { select: { id: true, fullName: true } },
      bookings: {
        include: {
          member: {
            select: { id: true, fullName: true, phone: true, membershipStatus: true },
          },
        },
        orderBy: { bookedAt: 'asc' },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ message: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json(session);
}

// ---------------------------------------------------------------------------
// PATCH /api/classes/sessions/[id]
// ---------------------------------------------------------------------------
// Reschedules a session to a new startsAt time. Only allowed for SCHEDULED sessions.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const existing = await prisma.classSession.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!existing) {
    return NextResponse.json({ message: 'Session not found' }, { status: 404 });
  }

  if (existing.status !== 'SCHEDULED') {
    return NextResponse.json(
      { message: 'Can only reschedule scheduled sessions' },
      { status: 400 },
    );
  }

  const body = await req.json();
  const parsed = rescheduleSessionSchema.safeParse(body);

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

  const newStartsAt = new Date(parsed.data.startsAt);
  const duration = existing.endsAt.getTime() - existing.startsAt.getTime();
  const newEndsAt = new Date(newStartsAt.getTime() + duration);

  const updated = await prisma.classSession.update({
    where: { id },
    data: { startsAt: newStartsAt, endsAt: newEndsAt },
  });

  return NextResponse.json(updated);
}
