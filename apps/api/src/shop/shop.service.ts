import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { computeLineVat, sumLines } from './vat';

export const productInputSchema = z.object({
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

export const orderInputSchema = z.object({
  memberId: z.string().min(1),
  lines: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
  })).min(1),
});

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  listProducts(tenantId: string, activeOnly: boolean) {
    return this.prisma.product.findMany({
      where: { tenantId, ...(activeOnly ? { active: true } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createProduct(tenantId: string, input: unknown) {
    const parsed = productInputSchema.parse(input);
    const existing = await this.prisma.product.findUnique({
      where: { tenantId_sku: { tenantId, sku: parsed.sku } },
    });
    if (existing) throw new BadRequestException('SKU already exists');
    return this.prisma.product.create({
      data: {
        tenantId,
        sku: parsed.sku,
        nameEn: parsed.nameEn,
        nameAr: parsed.nameAr ?? null,
        descriptionEn: parsed.descriptionEn ?? null,
        descriptionAr: parsed.descriptionAr ?? null,
        priceAed: parsed.priceAed,
        vatRate: parsed.vatRate,
        imageUrl: parsed.imageUrl ?? null,
        active: parsed.active,
      },
    });
  }

  async updateProduct(tenantId: string, productId: string, input: unknown) {
    const parsed = productInputSchema.partial().parse(input);
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) throw new NotFoundException('Product not found');
    if (parsed.sku && parsed.sku !== product.sku) {
      const collision = await this.prisma.product.findUnique({
        where: { tenantId_sku: { tenantId, sku: parsed.sku } },
      });
      if (collision) throw new BadRequestException('SKU already exists');
    }
    return this.prisma.product.update({
      where: { id: productId },
      data: parsed,
    });
  }

  async placeOrder(tenantId: string, input: unknown) {
    const parsed = orderInputSchema.parse(input);
    const productIds = parsed.lines.map((l) => l.productId);
    const products = await this.prisma.product.findMany({
      where: { tenantId, id: { in: productIds }, active: true },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products are unavailable');
    }
    const member = await this.prisma.member.findFirst({ where: { id: parsed.memberId, tenantId } });
    if (!member) throw new NotFoundException('Member not found');

    const lineComputations = parsed.lines.map((l) => {
      const product = products.find((p) => p.id === l.productId)!;
      const vat = computeLineVat({
        unitPriceAed: product.priceAed,
        quantity: l.quantity,
        vatRate: product.vatRate,
      });
      return { ...l, unitPriceAed: product.priceAed, vat };
    });
    const totals = sumLines(lineComputations.map((c) => c.vat));

    return this.prisma.order.create({
      data: {
        tenantId,
        memberId: parsed.memberId,
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
  }

  listOrders(tenantId: string, page: number, pageSize: number) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    return this.prisma.$transaction([
      this.prisma.order.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          member: { select: { id: true, fullName: true } },
          lines: true,
        },
      }),
      this.prisma.order.count({ where: { tenantId } }),
    ]).then(([items, total]) => ({ items, total, page: Math.max(page, 1), pageSize: take }));
  }

  async markOrderPaid(tenantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, tenantId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(`Order is ${order.status}; only PENDING orders can be marked PAID`);
    }
    return this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.PAID } });
  }
}
