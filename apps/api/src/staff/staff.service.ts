import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

export const createStaffSchema = z.object({
  fullName: z.string().min(1),
  role: z.nativeEnum(StaffRole),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  hourlyRateAed: z.number().int().nonnegative().optional(),
  commissionPercent: z.number().int().min(0).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  pin: z.string().regex(/^\d{4,8}$/).optional(),
  userId: z.string().optional(),
});

export const updateStaffSchema = createStaffSchema.partial();

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, activeOnly = true) {
    return this.prisma.staff.findMany({
      where: { tenantId, ...(activeOnly ? { active: true } : {}) },
      orderBy: { fullName: 'asc' },
    });
  }

  async get(tenantId: string, id: string) {
    const s = await this.prisma.staff.findFirst({ where: { id, tenantId } });
    if (!s) throw new NotFoundException('Staff not found');
    return s;
  }

  async create(tenantId: string, input: unknown) {
    const parsed = createStaffSchema.parse(input);
    if (parsed.pin) await this.assertPinUnique(tenantId, parsed.pin);
    const pinHash = parsed.pin ? await bcrypt.hash(parsed.pin, 10) : null;
    const { pin: _pin, ...rest } = parsed;
    return this.prisma.staff.create({
      data: { tenantId, ...rest, pinHash },
    });
  }

  async update(tenantId: string, id: string, input: unknown) {
    await this.get(tenantId, id);
    const parsed = updateStaffSchema.parse(input);
    const data: Record<string, unknown> = { ...parsed };
    if (parsed.pin) {
      await this.assertPinUnique(tenantId, parsed.pin, id);
      data.pinHash = await bcrypt.hash(parsed.pin, 10);
      delete data.pin;
    } else {
      delete data.pin;
    }
    return this.prisma.staff.update({ where: { id }, data });
  }

  private async assertPinUnique(tenantId: string, pin: string, excludeStaffId?: string) {
    const existing = await this.prisma.staff.findMany({
      where: {
        tenantId,
        active: true,
        pinHash: { not: null },
        ...(excludeStaffId ? { NOT: { id: excludeStaffId } } : {}),
      },
      select: { id: true, pinHash: true },
    });
    for (const s of existing) {
      if (s.pinHash && (await bcrypt.compare(pin, s.pinHash))) {
        throw new BadRequestException('PIN already in use by another staff member');
      }
    }
  }

  async terminate(tenantId: string, id: string) {
    await this.get(tenantId, id);
    return this.prisma.staff.update({
      where: { id },
      data: { active: false, terminatedAt: new Date() },
    });
  }

  async reactivate(tenantId: string, id: string) {
    await this.get(tenantId, id);
    return this.prisma.staff.update({
      where: { id },
      data: { active: true, terminatedAt: null },
    });
  }

  async verifyPin(tenantId: string, staffId: string, pin: string): Promise<boolean> {
    const s = await this.prisma.staff.findFirst({
      where: { id: staffId, tenantId, active: true },
      select: { pinHash: true },
    });
    if (!s?.pinHash) return false;
    return bcrypt.compare(pin, s.pinHash);
  }

  async findActiveByPin(tenantId: string, pin: string) {
    if (!/^\d{4,8}$/.test(pin)) throw new BadRequestException('Invalid PIN format');
    const staffWithPins = await this.prisma.staff.findMany({
      where: { tenantId, active: true, pinHash: { not: null } },
      select: { id: true, fullName: true, role: true, pinHash: true },
    });
    for (const s of staffWithPins) {
      if (s.pinHash && (await bcrypt.compare(pin, s.pinHash))) {
        return { id: s.id, fullName: s.fullName, role: s.role };
      }
    }
    return null;
  }
}
