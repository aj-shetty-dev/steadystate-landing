import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FreezeStatus, Locale, MembershipStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';

export const createMembershipSchema = z.object({
  memberId: z.string().min(1),
  planId: z.string().min(1),
  startDate: z.string().datetime().optional(),
  status: z.nativeEnum(MembershipStatus).optional(),
});

export const changePlanSchema = z.object({
  newPlanId: z.string().min(1),
  startDate: z.string().datetime().optional(),
});

export const freezeInputSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  reason: z.string().max(500).optional(),
});

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function daysBetween(start: Date, end: Date): number {
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export interface MembershipsPage {
  items: Awaited<ReturnType<MembershipsService['list']>>['items'];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async list(
    tenantId: string,
    status?: MembershipStatus,
    memberId?: string,
    search?: string,
    page = 1,
    pageSize = 25,
  ) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const q = search?.trim();

    const where: Prisma.MembershipWhereInput = {
      tenantId,
      ...(status ? { status } : {}),
      ...(memberId ? { memberId } : {}),
      ...(q
        ? {
            member: {
              OR: [
                { fullName: { contains: q, mode: Prisma.QueryMode.insensitive } },
                { phone: { contains: q } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.membership.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          member: { select: { id: true, fullName: true, phone: true } },
          plan: { select: { id: true, nameEn: true, durationDays: true, priceAed: true } },
        },
      }),
      this.prisma.membership.count({ where }),
    ]);

    return { items, total, page: Math.max(page, 1), pageSize: take };
  }

  async get(tenantId: string, id: string) {
    const m = await this.prisma.membership.findFirst({
      where: { id, tenantId },
      include: {
        member: true,
        plan: true,
        freezes: { orderBy: { startDate: 'desc' } },
      },
    });
    if (!m) throw new NotFoundException('Membership not found');
    return m;
  }

  async create(tenantId: string, input: unknown) {
    const parsed = createMembershipSchema.parse(input);
    const [member, plan] = await Promise.all([
      this.prisma.member.findFirst({ where: { id: parsed.memberId, tenantId }, select: { id: true, fullName: true, phone: true, preferredLocale: true } }),
      this.prisma.membershipPlan.findFirst({ where: { id: parsed.planId, tenantId, active: true } }),
    ]);
    if (!member) throw new NotFoundException('Member not found');
    if (!plan) throw new NotFoundException('Plan not found or inactive');

    const start = parsed.startDate ? new Date(parsed.startDate) : new Date();
    const end = addDays(start, plan.durationDays);
    const status = parsed.status ?? MembershipStatus.PENDING_PAYMENT;

    // Guard CANCELLED/EXPIRED membership activation
    // (separate from activate() path, but this is create())
    const overlapping = await this.prisma.membership.findFirst({
      where: {
        tenantId,
        memberId: parsed.memberId,
        planId: parsed.planId,
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.FROZEN, MembershipStatus.PENDING_PAYMENT] },
        endDate: { gt: start },
        startDate: { lt: end },
      },
      select: { id: true },
    });
    if (overlapping) {
      throw new ConflictException('Member already has an overlapping active or pending membership');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const m = await tx.membership.create({
        data: {
          tenantId,
          memberId: parsed.memberId,
          planId: parsed.planId,
          startDate: start,
          endDate: end,
          status,
        },
      });
      if (status === MembershipStatus.ACTIVE) {
        await tx.member.update({
          where: { id: parsed.memberId },
          data: { membershipStatus: MembershipStatus.ACTIVE, membershipExpiresAt: end },
        });
      }
      return m;
    });

    if (status === MembershipStatus.ACTIVE) {
      await this.notify(tenantId, member, 'membership_started',
        `Welcome ${member.fullName}! Your ${plan.nameEn} membership is now active until ${end.toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' })}. 💪`,
        `مرحباً ${member.fullName}! عضويتك في ${plan.nameAr ?? plan.nameEn} مفعّلة حتى ${end.toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' })}. 💪`,
      );
    }
    return created;
  }

  private async notify(
    tenantId: string,
    member: { id: string; fullName: string; phone: string | null; preferredLocale: Locale | null } | null,
    category: string,
    body: string,
    bodyAr: string,
  ) {
    if (!member?.phone) return;
    try {
      await this.notifications.dispatch({
        tenantId,
        memberId: member.id,
        to: member.phone,
        body,
        bodyAr,
        templateName: category,
        category,
        locale: member.preferredLocale ?? Locale.EN,
      });
    } catch (err) {
      this.logger.error(`Notify ${category} failed for member ${member.id}: ${(err as Error).message}`);
    }
  }

  async activate(tenantId: string, id: string) {
    const m = await this.get(tenantId, id);
    if (m.status === MembershipStatus.ACTIVE) return m;
    if (m.status === MembershipStatus.CANCELLED || m.status === MembershipStatus.EXPIRED) {
      throw new BadRequestException(`Cannot activate a ${m.status} membership`);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.membership.update({
        where: { id },
        data: {
          status: MembershipStatus.ACTIVE,
          signedAt: m.signedAt ?? new Date(),
        },
      });
      await tx.member.update({
        where: { id: m.memberId },
        data: { membershipStatus: MembershipStatus.ACTIVE, membershipExpiresAt: u.endDate },
      });
      return u;
    });
    const when = updated.endDate.toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' });
    await this.notify(tenantId, m.member as never, 'membership_activated',
      `Hi ${m.member.fullName}, your ${m.plan.nameEn} membership is now active until ${when}. 💪`,
      `مرحباً ${m.member.fullName}، عضويتك في ${m.plan.nameAr ?? m.plan.nameEn} مفعّلة حتى ${when}. 💪`,
    );
    return updated;
  }

  async cancel(tenantId: string, id: string, reason?: string) {
    const m = await this.get(tenantId, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.membership.update({
        where: { id },
        data: { status: MembershipStatus.CANCELLED, cancellationReason: reason ?? null, cancelAtPeriodEnd: false },
      });
      await tx.member.update({
        where: { id: m.memberId },
        data: { membershipStatus: MembershipStatus.CANCELLED },
      });
      return u;
    });
    await this.notify(tenantId, m.member as never, 'membership_cancelled',
      `Hi ${m.member.fullName}, your ${m.plan.nameEn} membership has been cancelled. We'd love to have you back anytime.`,
      `مرحباً ${m.member.fullName}، تم إلغاء عضويتك في ${m.plan.nameAr ?? m.plan.nameEn}. نتمنى رؤيتك مرة أخرى قريباً.`,
    );
    return updated;
  }

  async freeze(tenantId: string, membershipId: string, input: unknown, approvedByUserId: string) {
    const parsed = freezeInputSchema.parse(input);
    const startDate = new Date(parsed.startDate);
    const endDate = new Date(parsed.endDate);
    if (endDate <= startDate) throw new BadRequestException('endDate must be after startDate');
    const days = daysBetween(startDate, endDate);

    const m = await this.get(tenantId, membershipId);
    if (m.status === MembershipStatus.CANCELLED || m.status === MembershipStatus.EXPIRED) {
      throw new BadRequestException(`Cannot freeze a ${m.status} membership`);
    }
    const usedDays = m.freezes
      .filter((f) => f.status !== FreezeStatus.CANCELLED)
      .reduce((sum, f) => sum + f.daysUsed, 0);
    if (usedDays + days > m.plan.maxFreezeDays) {
      throw new BadRequestException(
        `Freeze quota exceeded: requested ${days}, used ${usedDays}, allowed ${m.plan.maxFreezeDays}`,
      );
    }

    const overlappingFreeze = await this.prisma.membershipFreeze.findFirst({
      where: {
        membershipId,
        tenantId,
        status: FreezeStatus.ACTIVE,
        startDate: { lt: endDate },
        endDate: { gt: startDate },
      },
    });
    if (overlappingFreeze) {
      throw new ConflictException('A freeze already exists for this period');
    }

    const freeze = await this.prisma.$transaction(async (tx) => {
      const freeze = await tx.membershipFreeze.create({
        data: {
          tenantId,
          membershipId,
          startDate,
          endDate,
          daysUsed: days,
          reason: parsed.reason ?? null,
          approvedByUserId,
          status: FreezeStatus.ACTIVE,
        },
      });
      const newEnd = addDays(m.endDate, days);
      await tx.membership.update({
        where: { id: membershipId },
        data: { status: MembershipStatus.FROZEN, frozenUntil: endDate, endDate: newEnd },
      });
      await tx.member.update({
        where: { id: m.memberId },
        data: { membershipStatus: MembershipStatus.FROZEN, membershipExpiresAt: newEnd },
      });
      return freeze;
    });
    const fromStr = startDate.toLocaleDateString('en-AE', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' });
    const toStr = endDate.toLocaleDateString('en-AE', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' });
    await this.notify(tenantId, m.member as never, 'membership_frozen',
      `Hi ${m.member.fullName}, your ${m.plan.nameEn} membership is paused from ${fromStr} to ${toStr} (${days} days). See you when you're back!`,
      `مرحباً ${m.member.fullName}، تم تجميد عضويتك في ${m.plan.nameAr ?? m.plan.nameEn} من ${fromStr} إلى ${toStr} (${days} يوم).`,
    );
    return freeze;
  }

  async unfreeze(tenantId: string, membershipId: string) {
    const m = await this.get(tenantId, membershipId);
    if (m.status !== MembershipStatus.FROZEN) return m;
    const updated = await this.prisma.$transaction(async (tx) => {
      const active = m.freezes.find((f) => f.status === FreezeStatus.ACTIVE);
      if (active) {
        await tx.membershipFreeze.update({
          where: { id: active.id },
          data: { status: FreezeStatus.COMPLETED },
        });
      }
      const u = await tx.membership.update({
        where: { id: membershipId },
        data: { status: MembershipStatus.ACTIVE, frozenUntil: null },
      });
      await tx.member.update({
        where: { id: m.memberId },
        data: { membershipStatus: MembershipStatus.ACTIVE, membershipExpiresAt: u.endDate },
      });
      return u;
    });
    await this.notify(tenantId, m.member as never, 'membership_unfrozen',
      `Welcome back ${m.member.fullName}! Your ${m.plan.nameEn} membership is active again. 💪`,
      `أهلاً بعودتك ${m.member.fullName}! عضويتك في ${m.plan.nameAr ?? m.plan.nameEn} مفعّلة مجدداً. 💪`,
    );
    return updated;
  }

  async changePlan(tenantId: string, membershipId: string, input: unknown) {
    const { newPlanId, startDate: rawStart } = changePlanSchema.parse(input);
    const current = await this.get(tenantId, membershipId);
    if (
      current.status === MembershipStatus.CANCELLED ||
      current.status === MembershipStatus.EXPIRED ||
      current.status === MembershipStatus.FROZEN
    ) {
      throw new BadRequestException(
        current.status === MembershipStatus.FROZEN
          ? 'Unfreeze the membership before changing plan'
          : `Cannot change plan on a ${current.status} membership`,
      );
    }
    const newPlan = await this.prisma.membershipPlan.findFirst({
      where: { id: newPlanId, tenantId, active: true },
    });
    if (!newPlan) throw new NotFoundException('New plan not found or inactive');

    const start = rawStart ? new Date(rawStart) : new Date();
    const end = addDays(start, newPlan.durationDays);

    const created = await this.prisma.$transaction(async (tx) => {
      // Cancel the current membership
      await tx.membership.update({
        where: { id: membershipId },
        data: { status: MembershipStatus.CANCELLED, cancellationReason: 'Plan changed' },
      });
      // Create a new ACTIVE membership on the new plan
      const created = await tx.membership.create({
        data: {
          tenantId,
          memberId: current.memberId,
          planId: newPlanId,
          startDate: start,
          endDate: end,
          status: MembershipStatus.ACTIVE,
        },
        include: {
          member: { select: { id: true, fullName: true, phone: true } },
          plan: { select: { id: true, nameEn: true, nameAr: true, durationDays: true, priceAed: true } },
        },
      });
      await tx.member.update({
        where: { id: current.memberId },
        data: { membershipStatus: MembershipStatus.ACTIVE, membershipExpiresAt: end },
      });
      return created;
    });
    const when = end.toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' });
    await this.notify(tenantId, current.member as never, 'membership_plan_changed',
      `Hi ${current.member.fullName}, your membership has been changed from ${current.plan.nameEn} to ${newPlan.nameEn}, valid until ${when}.`,
      `مرحباً ${current.member.fullName}، تم تغيير عضويتك من ${current.plan.nameAr ?? current.plan.nameEn} إلى ${newPlan.nameAr ?? newPlan.nameEn}، سارية حتى ${when}.`,
    );
    return created;
  }

  async expireDue(now: Date = new Date()): Promise<{ expired: number }> {
    const due = await this.prisma.membership.findMany({
      where: {
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.FROZEN, MembershipStatus.PENDING_PAYMENT] },
        endDate: { lte: now },
      },
      select: { id: true, tenantId: true, memberId: true },
    });
    if (due.length === 0) return { expired: 0 };
    await this.prisma.$transaction([
      this.prisma.membership.updateMany({
        where: { id: { in: due.map((d) => d.id) } },
        data: { status: MembershipStatus.EXPIRED },
      }),
      ...due.map((d) =>
        this.prisma.member.update({
          where: { id: d.memberId },
          data: { membershipStatus: MembershipStatus.EXPIRED },
        }),
      ),
    ]);
    this.logger.log(`Expired ${due.length} memberships`);
    return { expired: due.length };
  }

  async sendExpiryReminders(now: Date = new Date(), daysAhead = 7): Promise<{ sent: number; skipped: number }> {
    const windowStart = new Date(now);
    const windowEnd = new Date(now);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + daysAhead);

    const expiring = await this.prisma.membership.findMany({
      where: {
        status: MembershipStatus.ACTIVE,
        endDate: { gte: windowStart, lte: windowEnd },
        lastReminderSentAt: null,
      },
      include: {
        member: { select: { id: true, fullName: true, phone: true, preferredLocale: true } },
        plan: { select: { id: true, nameEn: true, nameAr: true } },
      },
    });

    let sent = 0;
    let skipped = 0;

    for (const m of expiring) {
      const phone = m.member.phone;
      if (!phone) { skipped++; continue; }

      const expiryDate = m.endDate.toLocaleDateString('en-AE', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai',
      });
      const planEn = m.plan.nameEn;
      const planAr = m.plan.nameAr ?? m.plan.nameEn;
      const name = m.member.fullName;

      const bodyEn = `Hi ${name}, your ${planEn} membership expires on ${expiryDate}. Contact your gym to renew and keep your streak going! 💪`;
      const bodyAr = `مرحباً ${name}، عضويتك في ${planAr} تنتهي بتاريخ ${expiryDate}. تواصل مع الصالة الرياضية للتجديد والاستمرار في رحلتك! 💪`;

      try {
        await this.notifications.dispatch({
          tenantId: m.tenantId,
          memberId: m.memberId,
          to: phone,
          body: bodyEn,
          bodyAr,
          templateName: 'membership_expiry_reminder',
          category: 'membership_expiry_reminder',
          locale: m.member.preferredLocale,
        });
        await this.prisma.membership.update({
          where: { id: m.id },
          data: { lastReminderSentAt: now },
        });
        sent++;
      } catch (err) {
        this.logger.error(`Expiry reminder failed for membership ${m.id}: ${(err as Error).message}`);
        skipped++;
      }
    }

    this.logger.log(`Expiry reminders: sent=${sent} skipped=${skipped}`);
    return { sent, skipped };
  }

  /** Returns upcoming renewals: PENDING_PAYMENT memberships starting within `windowDays`. */
  async listRenewals(tenantId: string, windowDays = 30) {
    const cutoff = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000);
    return this.prisma.membership.findMany({
      where: {
        tenantId,
        status: MembershipStatus.PENDING_PAYMENT,
        startDate: { lte: cutoff },
      },
      include: {
        member: { select: { id: true, fullName: true, phone: true } },
        plan: { select: { id: true, nameEn: true, priceAed: true, durationDays: true } },
      },
      orderBy: { startDate: 'asc' },
      take: 200,
    });
  }
}
