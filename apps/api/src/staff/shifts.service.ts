import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

export const shiftInputSchema = z.object({
  staffId: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  role: z.nativeEnum(StaffRole).optional(),
  notes: z.string().max(500).optional(),
});

export const bulkShiftSchema = z.object({
  staffId: z.string().min(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weeks: z.number().int().min(1).max(52),
  fromDate: z.string().datetime(),
  role: z.nativeEnum(StaffRole).optional(),
});

function setTime(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date.getTime());
  d.setUTCHours(h, m, 0, 0);
  return d;
}

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, opts: { staffId?: string; from?: Date; to?: Date } = {}) {
    return this.prisma.shift.findMany({
      where: {
        tenantId,
        ...(opts.staffId ? { staffId: opts.staffId } : {}),
        ...(opts.from || opts.to
          ? { startsAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
          : {}),
      },
      orderBy: { startsAt: 'asc' },
      include: { staff: { select: { id: true, fullName: true, color: true } } },
    });
  }

  async detectConflicts(tenantId: string, staffId: string, startsAt: Date, endsAt: Date, excludeId?: string) {
    return this.prisma.shift.findMany({
      where: {
        tenantId,
        staffId,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true, startsAt: true, endsAt: true },
    });
  }

  async create(tenantId: string, input: unknown) {
    const parsed = shiftInputSchema.parse(input);
    const startsAt = new Date(parsed.startsAt);
    const endsAt = new Date(parsed.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('endsAt must be after startsAt');
    const staff = await this.prisma.staff.findFirst({
      where: { id: parsed.staffId, tenantId, active: true },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    const conflicts = await this.detectConflicts(tenantId, parsed.staffId, startsAt, endsAt);
    if (conflicts.length > 0) {
      throw new BadRequestException('Shift overlaps with an existing shift for this staff');
    }
    return this.prisma.shift.create({
      data: {
        tenantId,
        staffId: parsed.staffId,
        startsAt,
        endsAt,
        role: parsed.role,
        notes: parsed.notes,
      },
    });
  }

  async update(tenantId: string, id: string, input: unknown) {
    const existing = await this.prisma.shift.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Shift not found');
    const parsed = shiftInputSchema.partial().parse(input);
    const data: Record<string, unknown> = {};
    const startsAt = parsed.startsAt ? new Date(parsed.startsAt) : existing.startsAt;
    const endsAt = parsed.endsAt ? new Date(parsed.endsAt) : existing.endsAt;
    if (endsAt <= startsAt) throw new BadRequestException('endsAt must be after startsAt');
    if (parsed.startsAt) data.startsAt = startsAt;
    if (parsed.endsAt) data.endsAt = endsAt;
    if (parsed.role !== undefined) data.role = parsed.role;
    if (parsed.notes !== undefined) data.notes = parsed.notes;
    if (parsed.startsAt || parsed.endsAt) {
      const conflicts = await this.detectConflicts(tenantId, existing.staffId, startsAt, endsAt, id);
      if (conflicts.length > 0) {
        throw new BadRequestException('Shift overlaps with an existing shift for this staff');
      }
    }
    return this.prisma.shift.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.shift.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Shift not found');
    return this.prisma.shift.delete({ where: { id } });
  }

  async createBulk(tenantId: string, input: unknown) {
    const parsed = bulkShiftSchema.parse(input);
    const staff = await this.prisma.staff.findFirst({
      where: { id: parsed.staffId, tenantId, active: true },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    const from = new Date(parsed.fromDate);
    const created: Array<{ startsAt: Date; endsAt: Date }> = [];
    for (let w = 0; w < parsed.weeks; w++) {
      for (const dow of parsed.daysOfWeek) {
        const day = new Date(from.getTime());
        day.setUTCDate(day.getUTCDate() + w * 7 + ((dow - day.getUTCDay() + 7) % 7));
        const startsAt = setTime(day, parsed.startTime);
        const endsAt = setTime(day, parsed.endTime);
        if (endsAt > startsAt) created.push({ startsAt, endsAt });
      }
    }
    if (created.length === 0) return { created: 0 };
    await this.prisma.shift.createMany({
      data: created.map((c) => ({
        tenantId,
        staffId: parsed.staffId,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        role: parsed.role,
      })),
    });
    return { created: created.length };
  }
}
