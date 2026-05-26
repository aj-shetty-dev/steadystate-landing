import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SaleLineKind, SaleType } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { computeLineVat, sumLines } from '../shop/vat';

const lineSchema = z.object({
  kind: z.nativeEnum(SaleLineKind),
  refId: z.string().optional(),
  nameSnapshot: z.string().min(1).optional(),
  quantity: z.number().int().positive().default(1),
  unitPriceAed: z.number().int().nonnegative().optional(),
  vatRate: z.number().int().min(0).max(100).optional(),
});

export const createSaleSchema = z.object({
  type: z.nativeEnum(SaleType),
  memberId: z.string().optional(),
  leadId: z.string().optional(),
  staffId: z.string().optional(),
  notes: z.string().max(500).optional(),
  lines: z.array(lineSchema).min(1),
});

@Injectable()
export class PosService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, opts: { memberId?: string; staffId?: string; from?: Date; to?: Date; take?: number; skip?: number } = {}) {
    const take = Math.min(Math.max(opts.take ?? 100, 1), 500);
    const skip = Math.max(opts.skip ?? 0, 0);
    return this.prisma.sale.findMany({
      where: {
        tenantId,
        ...(opts.memberId ? { memberId: opts.memberId } : {}),
        ...(opts.staffId ? { staffId: opts.staffId } : {}),
        ...(opts.from || opts.to
          ? { createdAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
          : {}),
      },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }

  async get(tenantId: string, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  async create(tenantId: string, input: unknown) {
    const parsed = createSaleSchema.parse(input);

    const enrichedLines: Array<{ kind: SaleLineKind; refId?: string; nameSnapshot: string; quantity: number; unitPriceAed: number; vatRate: number; vatAed: number; totalAed: number }> = [];

    for (const l of parsed.lines) {
      let unit = l.unitPriceAed;
      let vatRate = l.vatRate ?? 5;
      let name = l.nameSnapshot;

      if (l.kind === SaleLineKind.PRODUCT) {
        if (!l.refId) throw new BadRequestException('PRODUCT line requires refId');
        const p = await this.prisma.product.findFirst({ where: { id: l.refId, tenantId, active: true } });
        if (!p) throw new BadRequestException(`Product ${l.refId} not available`);
        unit = unit ?? p.priceAed;
        vatRate = l.vatRate ?? p.vatRate;
        name = name ?? p.nameEn;
      } else if (l.kind === SaleLineKind.MEMBERSHIP) {
        if (!l.refId) throw new BadRequestException('MEMBERSHIP line requires refId');
        const plan = await this.prisma.membershipPlan.findFirst({ where: { id: l.refId, tenantId, active: true } });
        if (!plan) throw new BadRequestException(`Plan ${l.refId} not available`);
        unit = unit ?? plan.priceAed;
        name = name ?? plan.nameEn;
      } else if (l.kind === SaleLineKind.CLASS_DROPIN) {
        if (!l.refId) throw new BadRequestException('CLASS_DROPIN line requires refId');
        const ct = await this.prisma.classType.findFirst({ where: { id: l.refId, tenantId } });
        if (!ct) throw new BadRequestException(`Class ${l.refId} not found`);
        if (!ct.dropInPriceAed) throw new BadRequestException('Class has no drop-in price');
        unit = unit ?? ct.dropInPriceAed;
        name = name ?? `Drop-in: ${ct.nameEn}`;
      } else if (l.kind === SaleLineKind.DAY_PASS) {
        if (unit == null) throw new BadRequestException('DAY_PASS line requires unitPriceAed');
        name = name ?? 'Day pass';
      }

      if (unit == null) throw new BadRequestException('unitPriceAed could not be resolved');
      if (!name) throw new BadRequestException('nameSnapshot could not be resolved');

      const v = computeLineVat({ unitPriceAed: unit, quantity: l.quantity, vatRate });
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
      enrichedLines.map((l) => ({ subtotalAed: l.unitPriceAed * l.quantity, vatAed: l.vatAed, totalAed: l.totalAed })),
    );

    if (parsed.memberId) {
      const m = await this.prisma.member.findFirst({ where: { id: parsed.memberId, tenantId }, select: { id: true } });
      if (!m) throw new BadRequestException('Member not found');
    }
    if (parsed.leadId) {
      const lead = await this.prisma.lead.findFirst({ where: { id: parsed.leadId, tenantId }, select: { id: true } });
      if (!lead) throw new BadRequestException('Lead not found');
    }
    if (parsed.staffId) {
      const staff = await this.prisma.staff.findFirst({
        where: { id: parsed.staffId, tenantId, active: true },
        select: { id: true },
      });
      if (!staff) throw new BadRequestException('Staff not found or inactive');
    }

    return this.prisma.sale.create({
      data: {
        tenantId,
        type: parsed.type,
        memberId: parsed.memberId,
        leadId: parsed.leadId,
        staffId: parsed.staffId,
        notes: parsed.notes,
        subtotalAed: totals.subtotalAed,
        vatAed: totals.vatAed,
        totalAed: totals.totalAed,
        lines: {
          create: enrichedLines.map((l) => ({
            tenantId,
            kind: l.kind,
            refId: l.refId,
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
    } satisfies Prisma.SaleCreateArgs);
  }

  dailyTotals(tenantId: string, date: Date) {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 1);
    return this.prisma.sale.aggregate({
      where: { tenantId, createdAt: { gte: start, lt: end }, paymentStatus: 'PAID' },
      _sum: { subtotalAed: true, vatAed: true, totalAed: true },
      _count: { _all: true },
    });
  }
}
