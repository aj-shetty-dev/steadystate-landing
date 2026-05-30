import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const createClassTypeSchema = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().optional(),
  description: z.string().optional(),
  durationMin: z.number().int().positive(),
  capacity: z.number().int().positive(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  requiresEquipment: z.boolean().optional(),
  dropInPriceAed: z.number().int().nonnegative().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/classes/types
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const includeArchived = req.nextUrl.searchParams.get('includeArchived');
  const activeOnly = includeArchived !== 'true';

  const items = await prisma.classType.findMany({
    where: {
      tenantId: user.tenantId,
      ...(activeOnly ? { active: true } : {}),
    },
    orderBy: { nameEn: 'asc' },
  });

  return NextResponse.json(items);
}

// ---------------------------------------------------------------------------
// POST /api/classes/types
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();

  const parsed = createClassTypeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.errors.map((e) => e.message).join('; ') },
      { status: 400 },
    );
  }

  const item = await prisma.classType.create({
    data: {
      tenantId: user.tenantId,
      ...parsed.data,
    } as any,
  });

  return NextResponse.json(item, { status: 201 });
}
