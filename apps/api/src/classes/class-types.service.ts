import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

export const classTypeSchema = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().optional(),
  description: z.string().optional(),
  durationMin: z.number().int().positive(),
  capacity: z.number().int().positive(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  requiresEquipment: z.boolean().optional(),
  dropInPriceAed: z.number().int().nonnegative().optional(),
});

@Injectable()
export class ClassTypesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, activeOnly = true) {
    return this.prisma.classType.findMany({
      where: { tenantId, ...(activeOnly ? { active: true } : {}) },
      orderBy: { nameEn: 'asc' },
    });
  }

  async get(tenantId: string, id: string) {
    const ct = await this.prisma.classType.findFirst({ where: { id, tenantId } });
    if (!ct) throw new NotFoundException('Class type not found');
    return ct;
  }

  async create(tenantId: string, input: unknown) {
    const parsed = classTypeSchema.parse(input);
    return this.prisma.classType.create({ data: { tenantId, ...parsed } });
  }

  async update(tenantId: string, id: string, input: unknown) {
    await this.get(tenantId, id);
    const parsed = classTypeSchema.partial().parse(input);
    return this.prisma.classType.update({ where: { id }, data: parsed });
  }

  async archive(tenantId: string, id: string) {
    await this.get(tenantId, id);
    const sessions = await this.prisma.classSession.count({
      where: { tenantId, classTypeId: id, status: 'SCHEDULED', startsAt: { gte: new Date() } },
    });
    if (sessions > 0) {
      throw new BadRequestException(`Cannot archive: ${sessions} upcoming sessions scheduled`);
    }
    return this.prisma.classType.update({ where: { id }, data: { active: false } });
  }
}
