import { Body, ConflictException, Controller, DefaultValuePipe, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CrmProvider, Gender, Locale, MemberSource, MembershipStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone must be E.164 format (e.g. +971501234567)')
  .optional()
  .nullable();

export const createMemberSchema = z.object({
  fullName: z.string().min(1).max(200).trim(),
  phone: phoneSchema,
  email: z.string().email().optional().nullable(),
  membershipStatus: z.nativeEnum(MembershipStatus).default(MembershipStatus.ACTIVE),
  joinedAt: z.string().date().optional(),
  preferredLocale: z.nativeEnum(Locale).default(Locale.EN),
  gender: z.nativeEnum(Gender).optional().nullable(),
  dateOfBirth: z.string().date().optional().nullable(),
  medicalNotes: z.string().max(1000).optional().nullable(),
});

export const updateMemberSchema = createMemberSchema.partial().extend({
  membershipExpiresAt: z.string().date().optional().nullable(),
});

@Controller('members')
@UseGuards(ClerkAuthGuard)
export class MembersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(25), ParseIntPipe) pageSize: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const q = search?.trim();
    const validStatuses = Object.values(MembershipStatus) as string[];
    const statusFilter = status && validStatuses.includes(status) ? (status as MembershipStatus) : undefined;

    const where: Prisma.MemberWhereInput = {
      tenantId: user.tenantId,
      ...(statusFilter ? { membershipStatus: statusFilter } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { email: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        orderBy: { lastCheckinAt: { sort: 'desc', nulls: 'last' } },
        skip,
        take,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          membershipStatus: true,
          provider: true,
          lastCheckinAt: true,
          joinedAt: true,
        },
      }),
      this.prisma.member.count({ where }),
    ]);

    const activePlanByMember = await this.loadActivePlanNames(user.tenantId, items.map((m) => m.id));
    const enriched = items.map((m) => ({ ...m, activePlanNames: activePlanByMember.get(m.id) ?? [] }));

    return { items: enriched, total, page: Math.max(page, 1), pageSize: take };
  }

  private async loadActivePlanNames(tenantId: string, memberIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (memberIds.length === 0) return map;
    const memberships = await this.prisma.membership.findMany({
      where: {
        tenantId,
        memberId: { in: memberIds },
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.FROZEN] },
      },
      select: { memberId: true, plan: { select: { nameEn: true } } },
      orderBy: { startDate: 'desc' },
    });
    for (const m of memberships) {
      const existing = map.get(m.memberId);
      if (existing) existing.push(m.plan.nameEn);
      else map.set(m.memberId, [m.plan.nameEn]);
    }
    return map;
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const member = await this.prisma.member.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        membershipStatus: true,
        membershipExpiresAt: true,
        provider: true,
        lastCheckinAt: true,
        joinedAt: true,
        externalId: true,
        preferredLocale: true,
        medicalNotes: true,
        dateOfBirth: true,
        gender: true,
        source: true,
      },
    });
    if (!member) throw new NotFoundException('Member not found');
    const activePlanByMember = await this.loadActivePlanNames(user.tenantId, [member.id]);
    return { ...member, activePlanNames: activePlanByMember.get(member.id) ?? [] };
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = createMemberSchema.parse(body);
    if (parsed.phone) {
      const dup = await this.prisma.member.findFirst({
        where: { tenantId: user.tenantId, phone: parsed.phone },
        select: { id: true },
      });
      if (dup) throw new ConflictException('A member with this phone number already exists');
    }
    return this.prisma.member.create({
      data: {
        tenantId: user.tenantId,
        externalId: randomUUID(),
        provider: CrmProvider.NATIVE,
        source: MemberSource.MANUAL,
        fullName: parsed.fullName,
        phone: parsed.phone ?? null,
        email: parsed.email ?? null,
        membershipStatus: parsed.membershipStatus,
        joinedAt: parsed.joinedAt ? new Date(parsed.joinedAt) : new Date(),
        preferredLocale: parsed.preferredLocale,
        gender: parsed.gender ?? null,
        dateOfBirth: parsed.dateOfBirth ? new Date(parsed.dateOfBirth) : null,
        medicalNotes: parsed.medicalNotes ?? null,
        raw: {},
      },
    });
  }

  @Patch(':id')
  async update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    const existing = await this.prisma.member.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) throw new NotFoundException('Member not found');

    const parsed = updateMemberSchema.parse(body);
    if (parsed.phone && parsed.phone !== existing.phone) {
      const dup = await this.prisma.member.findFirst({
        where: { tenantId: user.tenantId, phone: parsed.phone, NOT: { id } },
        select: { id: true },
      });
      if (dup) throw new ConflictException('A member with this phone number already exists');
    }
    return this.prisma.member.update({
      where: { id },
      data: {
        ...parsed,
        joinedAt: parsed.joinedAt ? new Date(parsed.joinedAt) : undefined,
        dateOfBirth: parsed.dateOfBirth === null ? null : parsed.dateOfBirth ? new Date(parsed.dateOfBirth) : undefined,
        membershipExpiresAt:
          parsed.membershipExpiresAt === null
            ? null
            : parsed.membershipExpiresAt
              ? new Date(parsed.membershipExpiresAt)
              : undefined,
      },
    });
  }

  @Patch(':id/deactivate')
  async deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const existing = await this.prisma.member.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) throw new NotFoundException('Member not found');
    return this.prisma.$transaction(async (tx) => {
      await tx.membership.updateMany({
        where: {
          tenantId: user.tenantId,
          memberId: id,
          status: { in: [MembershipStatus.ACTIVE, MembershipStatus.FROZEN, MembershipStatus.PENDING_PAYMENT] },
        },
        data: { status: MembershipStatus.CANCELLED, cancellationReason: 'Member deactivated', cancelAtPeriodEnd: false },
      });
      // Cancel any forward-looking bookings so the member doesn't appear on rosters.
      await tx.booking.updateMany({
        where: {
          tenantId: user.tenantId,
          memberId: id,
          status: { in: ['BOOKED', 'WAITLISTED'] },
          session: { startsAt: { gt: new Date() } },
        },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      return tx.member.update({
        where: { id },
        data: { membershipStatus: MembershipStatus.CANCELLED },
      });
    });
  }
}
