import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const productCreateSchema = z.object({
  sku: z.string().min(1).max(64),
  nameEn: z.string().min(1).max(160),
  nameAr: z.string().max(160).optional(),
  descriptionEn: z.string().max(2000).optional(),
  descriptionAr: z.string().max(2000).optional(),
  priceAed: z.number().int().nonnegative(),
  vatRate: z.number().int().min(0).max(100).default(5),
  imageUrl: z.string().url().optional(),
  active: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// GET /api/shop/products
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const qs = req.nextUrl.searchParams;
  const activeOnly = qs.get('activeOnly') !== 'false';
  const search = qs.get('search') ?? undefined;
  const page = Math.max(parseInt(qs.get('page') ?? '1'), 1);
  const pageSize = Math.min(Math.max(parseInt(qs.get('pageSize') ?? '50'), 1), 100);
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { tenantId: user.tenantId };
  if (activeOnly) where.active = true;
  if (search) {
    where.OR = [
      { nameEn: { contains: search, mode: 'insensitive' } },
      { nameAr: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: where as any,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.product.count({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: where as any,
    }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}

// ---------------------------------------------------------------------------
// POST /api/shop/products
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();

  const body = await req.json();
  const parsed = productCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.errors.map((e) => e.message).join('; ') },
      { status: 400 },
    );
  }

  // Check SKU uniqueness
  const existing = await prisma.product.findUnique({
    where: { tenantId_sku: { tenantId: user.tenantId, sku: parsed.data.sku } },
  });
  if (existing) {
    return NextResponse.json({ message: 'SKU already exists' }, { status: 400 });
  }

  const product = await prisma.product.create({
    data: {
      tenantId: user.tenantId,
      sku: parsed.data.sku,
      nameEn: parsed.data.nameEn,
      nameAr: parsed.data.nameAr ?? null,
      descriptionEn: parsed.data.descriptionEn ?? null,
      descriptionAr: parsed.data.descriptionAr ?? null,
      priceAed: parsed.data.priceAed,
      vatRate: parsed.data.vatRate,
      imageUrl: parsed.data.imageUrl ?? null,
      active: parsed.data.active,
    },
  });

  return NextResponse.json(product, { status: 201 });
}
