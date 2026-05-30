import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireServerUser } from '@/lib/auth-server';
import { SaleLineKind, SaleType } from '@prisma/client';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// VAT helpers (matching apps/api/src/shop/vat.ts)
// ---------------------------------------------------------------------------
function computeLineVat({
  unitPriceAed,
  quantity,
  vatRate,
}: {
  unitPriceAed: number;
  quantity: number;
  vatRate: number;
}) {
  if (quantity <= 0 || unitPriceAed < 0) throw new Error('invalid line');
  const subtotal = unitPriceAed * quantity;
  const vat = Math.round((subtotal * vatRate) / 100);
  return { subtotalAed: subtotal, vatAed: vat, totalAed: subtotal + vat };
}

function sumLines(
  lines: { subtotalAed: number; vatAed: number; totalAed: number }[],
) {
  return lines.reduce(
    (acc, l) => ({
      subtotalAed: acc.subtotalAed + l.subtotalAed,
      vatAed: acc.vatAed + l.vatAed,
      totalAed: acc.totalAed + l.totalAed,
    }),
    { subtotalAed: 0, vatAed: 0, totalAed: 0 },
  );
}

// ---------------------------------------------------------------------------
// Zod schemas (matching apps/api/src/pos/pos.service.ts)
// ---------------------------------------------------------------------------
const lineSchema = z.object({
  kind: z.nativeEnum(SaleLineKind),
  refId: z.string().optional(),
  nameSnapshot: z.string().min(1).optional(),
  quantity: z.number().int().positive().default(1),
  unitPriceAed: z.number().int().nonnegative().optional(),
  vatRate: z.number().int().min(0).max(100).optional(),
});

const createSaleSchema = z.object({
  type: z.nativeEnum(SaleType),
  memberId: z.string().optional(),
  leadId: z.string().optional(),
  staffId: z.string().optional(),
  notes: z.string().max(500).optional(),
  lines: z.array(lineSchema).min(1),
});

// ---------------------------------------------------------------------------
// GET /api/pos/sales
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await requireServerUser();

  const qs = req.nextUrl.searchParams;
  const memberId = qs.get('memberId') ?? undefined;
  const staffId = qs.get('staffId') ?? undefined;
  const from = qs.get('from') ? new Date(qs.get('from')!) : undefined;
  const to = qs.get('to') ? new Date(qs.get('to')!) : undefined;
  const take = Math.min(
    Math.max(parseInt(qs.get('take') ?? '100') || 100, 1),
    500,
  );
  const skip = Math.max(parseInt(qs.get('skip') ?? '0') || 0, 0);

  const sales = await prisma.sale.findMany({
    where: {
      tenantId: user.tenantId,
      ...(memberId ? { memberId } : {}),
      ...(staffId ? { staffId } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    include: {
      lines: true,
      member: {
        select: { id: true, fullName: true, email: true, phone: true },
      },
      staff: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take,
    skip,
  });

  return NextResponse.json(sales);
}

// ---------------------------------------------------------------------------
// POST /api/pos/sales
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireServerUser();
  const body = await req.json();

  const parsed = createSaleSchema.parse(body);

  // ── Enrich lines with resolved pricing matching NestJS PosService.create ──
  const enrichedLines: Array<{
    kind: SaleLineKind;
    refId?: string;
    nameSnapshot: string;
    quantity: number;
    unitPriceAed: number;
    vatRate: number;
    vatAed: number;
    totalAed: number;
  }> = [];

  for (const l of parsed.lines) {
    let unit = l.unitPriceAed;
    let vatRate = l.vatRate ?? 5;
    let name = l.nameSnapshot;

    if (l.kind === SaleLineKind.PRODUCT) {
      if (!l.refId) {
        return NextResponse.json(
          { message: 'PRODUCT line requires refId' },
          { status: 400 },
        );
      }
      const p = await prisma.product.findFirst({
        where: { id: l.refId, tenantId: user.tenantId, active: true },
      });
      if (!p) {
        return NextResponse.json(
          { message: `Product ${l.refId} not available` },
          { status: 400 },
        );
      }
      unit = unit ?? p.priceAed;
      vatRate = l.vatRate ?? p.vatRate;
      name = name ?? p.nameEn;
    } else if (l.kind === SaleLineKind.MEMBERSHIP) {
      if (!l.refId) {
        return NextResponse.json(
          { message: 'MEMBERSHIP line requires refId' },
          { status: 400 },
        );
      }
      const plan = await prisma.membershipPlan.findFirst({
        where: { id: l.refId, tenantId: user.tenantId, active: true },
      });
      if (!plan) {
        return NextResponse.json(
          { message: `Plan ${l.refId} not available` },
          { status: 400 },
        );
      }
      unit = unit ?? plan.priceAed;
      name = name ?? plan.nameEn;
    } else if (l.kind === SaleLineKind.CLASS_DROPIN) {
      if (!l.refId) {
        return NextResponse.json(
          { message: 'CLASS_DROPIN line requires refId' },
          { status: 400 },
        );
      }
      const ct = await prisma.classType.findFirst({
        where: { id: l.refId, tenantId: user.tenantId },
      });
      if (!ct) {
        return NextResponse.json(
          { message: `Class ${l.refId} not found` },
          { status: 400 },
        );
      }
      if (!ct.dropInPriceAed) {
        return NextResponse.json(
          { message: 'Class has no drop-in price' },
          { status: 400 },
        );
      }
      unit = unit ?? ct.dropInPriceAed;
      name = name ?? `Drop-in: ${ct.nameEn}`;
    } else if (l.kind === SaleLineKind.DAY_PASS) {
      if (unit == null) {
        return NextResponse.json(
          { message: 'DAY_PASS line requires unitPriceAed' },
          { status: 400 },
        );
      }
      name = name ?? 'Day pass';
    }

    if (unit == null) {
      return NextResponse.json(
        { message: 'unitPriceAed could not be resolved' },
        { status: 400 },
      );
    }
    if (!name) {
      return NextResponse.json(
        { message: 'nameSnapshot could not be resolved' },
        { status: 400 },
      );
    }

    const v = computeLineVat({
      unitPriceAed: unit,
      quantity: l.quantity,
      vatRate,
    });
    enrichedLines.push({
      kind: l.kind,
      refId: l.refId,
      nameSnapshot: name,
      quantity: l.quantity,
      unitPriceAed: unit,
      vatRate,
      vatAed: v.vatAed,
      totalAed: v.totalAed,
    });
  }

  const totals = sumLines(
    enrichedLines.map((l) => ({
      subtotalAed: l.unitPriceAed * l.quantity,
      vatAed: l.vatAed,
      totalAed: l.totalAed,
    })),
  );

  // Validate references
  if (parsed.memberId) {
    const m = await prisma.member.findFirst({
      where: { id: parsed.memberId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!m) {
      return NextResponse.json({ message: 'Member not found' }, { status: 400 });
    }
  }
  if (parsed.leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: parsed.leadId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!lead) {
      return NextResponse.json({ message: 'Lead not found' }, { status: 400 });
    }
  }
  if (parsed.staffId) {
    const staff = await prisma.staff.findFirst({
      where: { id: parsed.staffId, tenantId: user.tenantId, active: true },
      select: { id: true },
    });
    if (!staff) {
      return NextResponse.json(
        { message: 'Staff not found or inactive' },
        { status: 400 },
      );
    }
  }

  const sale = await prisma.sale.create({
    data: {
      tenantId: user.tenantId,
      type: parsed.type,
      memberId: parsed.memberId ?? null,
      leadId: parsed.leadId ?? null,
      staffId: parsed.staffId ?? null,
      notes: parsed.notes ?? null,
      subtotalAed: totals.subtotalAed,
      vatAed: totals.vatAed,
      totalAed: totals.totalAed,
      lines: {
        create: enrichedLines.map((l) => ({
          tenantId: user.tenantId,
          kind: l.kind,
          refId: l.refId ?? null,
          nameSnapshot: l.nameSnapshot,
          quantity: l.quantity,
          unitPriceAed: l.unitPriceAed,
          vatRate: l.vatRate,
          vatAed: l.vatAed,
          totalAed: l.totalAed,
        })),
      },
    },
    include: { lines: true },
  });

  return NextResponse.json(sale, { status: 201 });
}
