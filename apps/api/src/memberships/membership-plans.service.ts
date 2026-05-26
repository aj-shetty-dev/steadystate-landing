import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

export const planInputSchema = z.object({
  nameEn: z.string().min(1).max(160),
  nameAr: z.string().max(160).optional(),
  description: z.string().max(2000).optional(),
  durationDays: z.number().int().positive().max(3650),
  priceAed: z.number().int().nonnegative(),
  vatRate: z.number().int().min(0).max(100).default(5),
  includesClasses: z.boolean().default(false),
  maxFreezeDays: z.number().int().min(0).max(365).default(0),
  active: z.boolean().default(true),
});

export type PlanInput = z.infer<typeof planInputSchema>;

@Injectable()
export class MembershipPlansService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, activeOnly = false) {
    return this.prisma.membershipPlan.findMany({
      where: { tenantId, ...(activeOnly ? { active: true } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, input: unknown) {
    const parsed = planInputSchema.parse(input);
    return this.prisma.membershipPlan.create({
      data: {
        tenantId,
        nameEn: parsed.nameEn,
        nameAr: parsed.nameAr ?? null,
        description: parsed.description ?? null,
        durationDays: parsed.durationDays,
        priceAed: parsed.priceAed,
        vatRate: parsed.vatRate,
        includesClasses: parsed.includesClasses,
        maxFreezeDays: parsed.maxFreezeDays,
        active: parsed.active,
      },
    });
  }

  async update(tenantId: string, planId: string, input: unknown) {
    const parsed = planInputSchema.partial().parse(input);
    const existing = await this.prisma.membershipPlan.findFirst({
      where: { id: planId, tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Plan not found');
    return this.prisma.membershipPlan.update({ where: { id: planId }, data: parsed });
  }

  async archive(tenantId: string, planId: string) {
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id: planId, tenantId },
      select: { id: true },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    const activeMembers = await this.prisma.membership.count({
      where: { tenantId, planId, status: { in: ['ACTIVE', 'PENDING_PAYMENT', 'FROZEN'] } },
    });
    if (activeMembers > 0) {
      throw new BadRequestException(`Cannot archive: ${activeMembers} active memberships on this plan`);
    }
    return this.prisma.membershipPlan.update({ where: { id: planId }, data: { active: false } });
  }
}
