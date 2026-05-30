import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const staffRoleEnum = z.enum(['TRAINER', 'RECEPTION', 'MANAGER', 'CLEANER', 'OTHER']);

const createStaffSchema = z.object({
  fullName: z.string().min(1),
  role: staffRoleEnum,
  email: z.string().email().optional(),
  phone: z.string().optional(),
  hourlyRateAed: z.number().int().nonnegative().optional(),
  commissionPercent: z.number().int().min(0).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  pin: z.string().regex(/^\d{4,8}$/).optional(),
  userId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function assertPinUnique(tenantId: string, pin: string, excludeStaffId?: string) {
  const existing = await prisma.staff.findMany({
    where: {
      tenantId,
      active: true,
      pinHash: { not: null },
      ...(excludeStaffId ? { NOT: { id: excludeStaffId } } : {}),
    },
    select: { id: true, pinHash: true },
  });

  for (const s of existing) {
    if (s.pinHash && (await bcrypt.compare(pin, s.pinHash))) {
      throw new Error('PIN_ALREADY_IN_USE');
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/staff
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const includeInactive = req.nextUrl.searchParams.get('includeInactive');
  const activeOnly = includeInactive !== 'true';

  const items = await prisma.staff.findMany({
    where: {
      tenantId: user.tenantId,
      ...(activeOnly ? { active: true } : {}),
    },
    orderBy: { fullName: 'asc' },
  });

  return NextResponse.json(items);
}

// ---------------------------------------------------------------------------
// POST /api/staff
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();

  const parsed = createStaffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.errors.map((e) => e.message).join('; ') },
      { status: 400 },
    );
  }

  // Check PIN uniqueness if provided
  if (parsed.data.pin) {
    try {
      await assertPinUnique(user.tenantId, parsed.data.pin);
    } catch (e) {
      if ((e as Error).message === 'PIN_ALREADY_IN_USE') {
        return NextResponse.json(
          { message: 'PIN already in use by another staff member' },
          { status: 400 },
        );
      }
      throw e;
    }
  }

  const pinHash = parsed.data.pin ? await bcrypt.hash(parsed.data.pin, 10) : null;
  const { pin: _pin, ...rest } = parsed.data;

  const staff = await prisma.staff.create({
    data: {
      tenantId: user.tenantId,
      ...rest,
      pinHash,
    } as any,
  });

  return NextResponse.json(staff, { status: 201 });
}
