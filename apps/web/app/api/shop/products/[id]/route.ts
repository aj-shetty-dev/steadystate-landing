import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const productUpdateSchema = z.object({
  sku: z.string().min(1).max(64).optional(),
  nameEn: z.string().min(1).max(160).optional(),
  nameAr: z.string().max(160).optional(),
  descriptionEn: z.string().max(2000).optional(),
  descriptionAr: z.string().max(2000).optional(),
  priceAed: z.number().int().nonnegative().optional(),
  vatRate: z.number().int().min(0).max(100).optional(),
  imageUrl: z.string().url().optional(),
  active: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/shop/products/[id]
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const product = await prisma.product.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!product) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  return NextResponse.json(product);
}

// ---------------------------------------------------------------------------
// PATCH /api/shop/products/[id]
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireServerUser();
  const { id } = await params;

  const product = await prisma.product.findFirst({
    where: { id, tenantId: user.tenantId },
  });

  if (!product) {
    return NextResponse.json({ message: 'Product not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = productUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.errors.map((e) => e.message).join('; ') },
      { status: 400 },
    );
  }

  // If SKU is changing, check uniqueness
  if (parsed.data.sku && parsed.data.sku !== product.sku) {
    const collision = await prisma.product.findUnique({
      where: { tenantId_sku: { tenantId: user.tenantId, sku: parsed.data.sku } },
    });
    if (collision) {
      return NextResponse.json({ message: 'SKU already exists' }, { status: 400 });
    }
  }

  const updated = await prisma.product.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json(updated);
}
