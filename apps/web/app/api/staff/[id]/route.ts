import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const staffRoleEnum = z.enum(['TRAINER', 'RECEPTION', 'MANAGER', 'CLEANER', 'OTHER']);

const updateStaffSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: staffRoleEnum.optional(),
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
// GET /api/staff/[id]
// ---------------------------------------------------------------------------
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireServerUser();
  const { id } = await params;

  const s = await prisma.staff.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!s) {
    return NextResponse.json({ message: 'Staff not found' }, { status: 404 });
  }

  return NextResponse.json(s);
}

// ---------------------------------------------------------------------------
// PATCH /api/staff/[id]
// ---------------------------------------------------------------------------
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireServerUser();
  const { id } = await params;

  // Ensure the staff record exists
  const existing = await prisma.staff.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!existing) {
    return NextResponse.json({ message: 'Staff not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateStaffSchema.safeParse(body);

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

  // Build update data, handling PIN separately
  const data: Record<string, unknown> = {};

  if (parsed.data.fullName !== undefined) data.fullName = parsed.data.fullName;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.email !== undefined) data.email = parsed.data.email;
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone;
  if (parsed.data.hourlyRateAed !== undefined) data.hourlyRateAed = parsed.data.hourlyRateAed;
  if (parsed.data.commissionPercent !== undefined) data.commissionPercent = parsed.data.commissionPercent;
  if (parsed.data.color !== undefined) data.color = parsed.data.color;
  if (parsed.data.userId !== undefined) data.userId = parsed.data.userId;

  // Handle pin: if provided, assert uniqueness and hash
  if (parsed.data.pin) {
    try {
      await assertPinUnique(user.tenantId, parsed.data.pin, id);
    } catch (e) {
      if ((e as Error).message === 'PIN_ALREADY_IN_USE') {
        return NextResponse.json(
          { message: 'PIN already in use by another staff member' },
          { status: 400 },
        );
      }
      throw e;
    }
    data.pinHash = await bcrypt.hash(parsed.data.pin, 10);
  }

  // If no fields to update (only pin was provided and handled), still proceed
  const updated = await prisma.staff.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}
