import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const updateRecurrenceSchema = z.object({
  classTypeId: z.string().min(1).optional(),
  instructorId: z.string().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  durationMin: z.number().int().positive().optional(),
  room: z.string().optional(),
  validFrom: z.string().refine((v) => /^\d{4}-\d{2}-\d{2}/.test(v) && !isNaN(new Date(v).getTime()), { message: "Invalid date. Use YYYY-MM-DD format (e.g. 2025-06-09)." }).optional(),
  validUntil: z.string().refine((v) => /^\d{4}-\d{2}-\d{2}/.test(v) && !isNaN(new Date(v).getTime()), { message: "Invalid date. Use YYYY-MM-DD format (e.g. 2025-06-09)." }).optional(),
  active: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/classes/recurrences/[id]
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const rec = await prisma.classRecurrence.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      classType: { select: { id: true, nameEn: true } },
    },
  });

  if (!rec) {
    return NextResponse.json({ message: 'Recurrence not found' }, { status: 404 });
  }

  // Resolve instructor if set
  let instructor: { id: string; fullName: string } | null = null;
  if (rec.instructorId) {
    const staff = await prisma.staff.findFirst({
      where: { id: rec.instructorId, tenantId: user.tenantId },
      select: { id: true, fullName: true },
    });
    instructor = staff;
  }

  return NextResponse.json({ ...rec, instructor });
}

// ---------------------------------------------------------------------------
// PATCH /api/classes/recurrences/[id]
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const existing = await prisma.classRecurrence.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!existing) {
    return NextResponse.json({ message: 'Recurrence not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateRecurrenceSchema.safeParse(body);

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

  // Build data, converting date strings to Date objects
  const data: Record<string, unknown> = {};
  if (parsed.data.classTypeId !== undefined) data.classTypeId = parsed.data.classTypeId;
  if (parsed.data.instructorId !== undefined) data.instructorId = parsed.data.instructorId;
  if (parsed.data.daysOfWeek !== undefined) data.daysOfWeek = parsed.data.daysOfWeek;
  if (parsed.data.startTime !== undefined) data.startTime = parsed.data.startTime;
  if (parsed.data.durationMin !== undefined) data.durationMin = parsed.data.durationMin;
  if (parsed.data.room !== undefined) data.room = parsed.data.room;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.validFrom !== undefined) data.validFrom = new Date(parsed.data.validFrom);
  if (parsed.data.validUntil !== undefined) {
    data.validUntil = parsed.data.validUntil ? new Date(parsed.data.validUntil) : null;
  }

  const updated = await prisma.classRecurrence.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}
