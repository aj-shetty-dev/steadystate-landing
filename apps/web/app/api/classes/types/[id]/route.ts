import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const updateClassTypeSchema = z.object({
  nameEn: z.string().min(1).optional(),
  nameAr: z.string().optional(),
  description: z.string().optional(),
  durationMin: z.number().int().positive().optional(),
  capacity: z.number().int().positive().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  requiresEquipment: z.boolean().optional(),
  dropInPriceAed: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/classes/types/[id]
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const ct = await prisma.classType.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!ct) {
    return NextResponse.json({ message: 'Class type not found' }, { status: 404 });
  }

  return NextResponse.json(ct);
}

// ---------------------------------------------------------------------------
// PATCH /api/classes/types/[id]
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const existing = await prisma.classType.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!existing) {
    return NextResponse.json({ message: 'Class type not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateClassTypeSchema.safeParse(body);

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

  // If archiving, check for upcoming sessions
  if (parsed.data.active === false) {
    const sessions = await prisma.classSession.count({
      where: {
        tenantId: user.tenantId,
        classTypeId: id,
        status: 'SCHEDULED',
        startsAt: { gte: new Date() },
      },
    });
    if (sessions > 0) {
      return NextResponse.json(
        { message: `Cannot archive: ${sessions} upcoming sessions scheduled` },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.classType.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json(updated);
}
