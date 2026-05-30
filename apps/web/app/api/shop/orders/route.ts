import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { OrderStatus } from '@prisma/client';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// VAT helpers (mirrors apps/api/src/shop/vat.ts)
// ---------------------------------------------------------------------------
interface VatInput {
  unitPriceAed: number;
  quantity: number;
  vatRate: number;
}

interface VatLine {
  subtotalAed: number;
  vatAed: number;
  totalAed: number;
}

function computeLineVat({ unitPriceAed, quantity, vatRate }: VatInput): VatLine {
  if (quantity <= 0 || unitPriceAed < 0) throw new Error('invalid line');
  const subtotal = unitPriceAed * quantity;
  const vat = Math.round((subtotal * vatRate) / 100);
  return { subtotalAed: subtotal, vatAed: vat, totalAed: subtotal + vat };
}

function sumLines(lines: VatLine[]): VatLine {
  return lines.reduce<VatLine>(
    (acc, l) => ({
      subtotalAed: acc.subtotalAed + l.subtotalAed,
      vatAed: acc.vatAed + l.vatAed,
      totalAed: acc.totalAed + l.totalAed,
    }),
    { subtotalAed: 0, vatAed: 0, totalAed: 0 },
  );
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const orderCreateSchema = z.object({
  memberId: z.string().min(1),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
});

// ---------------------------------------------------------------------------
// GET /api/shop/orders
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const qs = req.nextUrl.searchParams;
  const status = qs.get('status') ?? undefined;
  const memberId = qs.get('memberId') ?? undefined;
  const page = Math.max(parseInt(qs.get('page') ?? '1'), 1);
  const pageSize = Math.min(Math.max(parseInt(qs.get('pageSize') ?? '25'), 1), 100);
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { tenantId: user.tenantId };
  if (status) where.status = status;
  if (memberId) where.memberId = memberId;

  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: where as any,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        member: { select: { id: true, fullName: true } },
        lines: true,
      },
    }),
    prisma.order.count({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: where as any,
    }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}

// ---------------------------------------------------------------------------
// POST /api/shop/orders
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();

  const body = await req.json();
  const parsed = orderCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.errors.map((e) => e.message).join('; ') },
      { status: 400 },
    );
  }

  // Validate products exist and are active
  const productIds = parsed.data.lines.map((l) => l.productId);
  const products = await prisma.product.findMany({
    where: { tenantId: user.tenantId, id: { in: productIds }, active: true },
  });
  if (products.length !== productIds.length) {
    return NextResponse.json(
      { message: 'One or more products are unavailable' },
      { status: 400 },
    );
  }

  // Validate member
  const member = await prisma.member.findFirst({
    where: { id: parsed.data.memberId, tenantId: user.tenantId },
  });
  if (!member) {
    return NextResponse.json({ message: 'Member not found' }, { status: 404 });
  }

  // Compute VAT per line
  const lineComputations = parsed.data.lines.map((l) => {
    const product = products.find((p) => p.id === l.productId)!;
    const vat = computeLineVat({
      unitPriceAed: product.priceAed,
      quantity: l.quantity,
      vatRate: product.vatRate,
    });
    return { ...l, unitPriceAed: product.priceAed, vat };
  });
  const totals = sumLines(lineComputations.map((c) => c.vat));

  const order = await prisma.order.create({
    data: {
      tenantId: user.tenantId,
      memberId: parsed.data.memberId,
      status: OrderStatus.PENDING,
      subtotalAed: totals.subtotalAed,
      vatAed: totals.vatAed,
      totalAed: totals.totalAed,
      lines: {
        create: lineComputations.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
          unitPriceAed: c.unitPriceAed,
          vatAed: c.vat.vatAed,
        })),
      },
    },
    include: { lines: true },
  });

  return NextResponse.json(order, { status: 201 });
}
