import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';
import { randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CHECKIN_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateCheckinCode(): string {
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CHECKIN_CODE_CHARS[bytes[i] % CHECKIN_CODE_CHARS.length];
  }
  return code;
}

async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCheckinCode();
    const exists = await prisma.classSession.findUnique({
      where: { checkinCode: code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  return generateCheckinCode();
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const createSessionSchema = z.object({
  classTypeId: z.string().min(1),
  instructorId: z.string().optional(),
  startsAt: z.string().refine((v) => /^\d{4}-\d{2}-\d{2}/.test(v) && !isNaN(new Date(v).getTime()), { message: "Invalid date. Use YYYY-MM-DD format (e.g. 2025-06-09)." }),
  durationMin: z.number().int().positive().optional(),
  room: z.string().optional(),
  capacityOverride: z.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/classes/sessions
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const qs = req.nextUrl.searchParams;
  const from = qs.get('from') ? new Date(qs.get('from')!) : undefined;
  const to = qs.get('to') ? new Date(qs.get('to')!) : undefined;
  const classTypeId = qs.get('classTypeId') ?? undefined;
  const instructorId = qs.get('instructorId') ?? undefined;
  const room = qs.get('room') ?? undefined;
  const status = qs.get('status') ?? undefined;

  const validStatuses = ['SCHEDULED', 'CANCELLED', 'COMPLETED'];
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json(
      { message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
      { status: 400 },
    );
  }

  const items = await prisma.classSession.findMany({
    where: {
      tenantId: user.tenantId,
      ...(from || to
        ? {
            startsAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(classTypeId ? { classTypeId } : {}),
      ...(instructorId ? { instructorId } : {}),
      ...(room ? { room } : {}),
      ...(status ? { status: status as any } : {}),
    },
    orderBy: { startsAt: 'asc' },
    include: {
      classType: {
        select: { id: true, nameEn: true, nameAr: true, capacity: true, color: true },
      },
      instructor: { select: { id: true, fullName: true } },
      _count: { select: { bookings: true } },
    },
  });

  return NextResponse.json(items);
}

// ---------------------------------------------------------------------------
// POST /api/classes/sessions
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();

  const parsed = createSessionSchema.safeParse(body);
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

  // Validate class type exists and is active
  const classType = await prisma.classType.findFirst({
    where: { id: parsed.data.classTypeId, tenantId: user.tenantId, active: true },
  });
  if (!classType) {
    return NextResponse.json({ message: 'Class type not found or inactive' }, { status: 404 });
  }

  // Validate instructor exists and is active
  if (parsed.data.instructorId) {
    const instructor = await prisma.staff.findFirst({
      where: { id: parsed.data.instructorId, tenantId: user.tenantId, active: true },
      select: { id: true },
    });
    if (!instructor) {
      return NextResponse.json(
        { message: 'Instructor not found or inactive' },
        { status: 400 },
      );
    }
  }

  const startsAt = new Date(parsed.data.startsAt);
  const duration = parsed.data.durationMin ?? classType.durationMin;
  const endsAt = new Date(startsAt.getTime() + duration * 60_000);
  const code = await generateUniqueCode();

  const session = await prisma.classSession.create({
    data: {
      tenantId: user.tenantId,
      classTypeId: parsed.data.classTypeId,
      instructorId: parsed.data.instructorId,
      startsAt,
      endsAt,
      room: parsed.data.room,
      capacityOverride: parsed.data.capacityOverride,
      checkinCode: code,
      status: 'SCHEDULED',
    },
  });

  return NextResponse.json(session, { status: 201 });
}
