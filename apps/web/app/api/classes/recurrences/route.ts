import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const createRecurrenceSchema = z.object({
  classTypeId: z.string().min(1),
  instructorId: z.string().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMin: z.number().int().positive(),
  room: z.string().optional(),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/classes/recurrences
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const classTypeId = req.nextUrl.searchParams.get('classTypeId') ?? undefined;

  const recs = await prisma.classRecurrence.findMany({
    where: {
      tenantId: user.tenantId,
      active: true,
      ...(classTypeId ? { classTypeId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      classType: { select: { id: true, nameEn: true } },
    },
  });

  // Resolve instructor names (staff) for recurrences that have instructorId set
  const ids = [
    ...new Set(
      recs
        .map((r) => r.instructorId)
        .filter((id): id is string => id != null),
    ),
  ];
  const staffMap = new Map<string, { id: string; fullName: string }>();
  if (ids.length > 0) {
    const staff = await prisma.staff.findMany({
      where: { tenantId: user.tenantId, id: { in: ids } },
      select: { id: true, fullName: true },
    });
    staff.forEach((s) => staffMap.set(s.id, s));
  }

  const result = recs.map((r) => ({
    ...r,
    instructor: r.instructorId ? (staffMap.get(r.instructorId) ?? null) : null,
  }));

  return NextResponse.json(result);
}

// ---------------------------------------------------------------------------
// POST /api/classes/recurrences
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();

  const parsed = createRecurrenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.errors.map((e) => e.message).join('; ') },
      { status: 400 },
    );
  }

  const item = await prisma.classRecurrence.create({
    data: {
      tenantId: user.tenantId,
      classTypeId: parsed.data.classTypeId,
      instructorId: parsed.data.instructorId,
      daysOfWeek: parsed.data.daysOfWeek,
      startTime: parsed.data.startTime,
      durationMin: parsed.data.durationMin,
      room: parsed.data.room,
      validFrom: new Date(parsed.data.validFrom),
      validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
