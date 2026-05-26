import { Injectable, Logger } from '@nestjs/common';
import { Locale, MembershipStatus } from '@prisma/client';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_REMINDER_WINDOW_DAYS = 3;

@Injectable()
export class MembershipRenewalService {
  private readonly logger = new Logger(MembershipRenewalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationDispatcher,
  ) {}

  /**
   * Finds ACTIVE memberships that will expire within `windowDays`.
   * No PENDING_PAYMENT renewal for the same member+plan already exists after current endDate.
   */
  async findAutoRenewDue(now: Date = new Date(), windowDays: number = DEFAULT_WINDOW_DAYS) {
    const cutoff = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
    return this.prisma.membership.findMany({
      where: {
        status: MembershipStatus.ACTIVE,
        endDate: { gte: now, lte: cutoff },
      },
      include: {
        plan: { select: { id: true, nameEn: true, nameAr: true, durationDays: true } },
        member: { select: { id: true, tenantId: true, fullName: true, phone: true, preferredLocale: true } },
      },
    });
  }

  /**
   * For each membership in the renewal window:
   * 1. Skip if a PENDING_PAYMENT renewal already exists for this member+plan after current endDate.
   * 2. Create a new PENDING_PAYMENT membership starting on current endDate.
   * 3. Send a WhatsApp renewal reminder to the member.
   */
  async processAutoRenewals(now: Date = new Date(), windowDays: number = DEFAULT_WINDOW_DAYS) {
    const due = await this.findAutoRenewDue(now, windowDays);
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const m of due) {
      try {
        const tenantId = m.member.tenantId;
        // Dedup: skip if a renewal is already queued for this member starting after current endDate
        const existing = await this.prisma.membership.findFirst({
          where: {
            tenantId,
            memberId: m.memberId,
            planId: m.planId,
            status: MembershipStatus.PENDING_PAYMENT,
            startDate: { gte: m.endDate },
          },
          select: { id: true },
        });
        if (existing) {
          skipped++;
          continue;
        }

        const newStart = m.endDate;
        const newEnd = new Date(newStart.getTime() + m.plan.durationDays * 24 * 60 * 60 * 1000);

        await this.prisma.membership.create({
          data: {
            tenantId,
            memberId: m.memberId,
            planId: m.planId,
            startDate: newStart,
            endDate: newEnd,
            status: MembershipStatus.PENDING_PAYMENT,
            cancelAtPeriodEnd: false,
          },
        });
        created++;

        if (m.member.phone) {
          const planEn = m.plan.nameEn;
          const planAr = m.plan.nameAr ?? m.plan.nameEn;
          const dateStr = m.endDate.toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });
          try {
            await this.notifications.dispatch({
              tenantId,
              memberId: m.memberId,
              to: m.member.phone,
              body: `Hi ${m.member.fullName}, your ${planEn} membership renews on ${dateStr}. Please settle your payment to stay active.`,
              bodyAr: `مرحباً ${m.member.fullName}، اشتراكك في ${planAr} سيتجدد بتاريخ ${dateStr}. يرجى سداد الدفعة للاستمرار.`,
              templateName: 'membership_renewal_reminder',
              category: 'membership_renewal_reminder',
              locale: (m.member.preferredLocale as Locale) ?? Locale.EN,
            });
          } catch (err) {
            this.logger.warn(`Renewal notify failed for membership ${m.id}: ${(err as Error).message}`);
          }
        }
      } catch (err) {
        failed++;
        this.logger.error(`Failed to process renewal for membership ${m.id}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Auto-renewal sweep: due=${due.length} created=${created} skipped=${skipped} failed=${failed}`);
    return { due: due.length, created, skipped, failed };
  }

  /**
   * Sends a final reminder to members whose renewal is in `windowDays` (default 3)
   * and already has a PENDING_PAYMENT renewal but hasn't paid yet.
   */
  async sendPendingRenewalReminders(now: Date = new Date(), windowDays: number = DEFAULT_REMINDER_WINDOW_DAYS) {
    const cutoff = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
    const pending = await this.prisma.membership.findMany({
      where: {
        status: MembershipStatus.PENDING_PAYMENT,
        startDate: { gte: now, lte: cutoff },
        lastReminderSentAt: null,
      },
      include: {
        plan: { select: { nameEn: true, nameAr: true } },
        member: { select: { id: true, tenantId: true, fullName: true, phone: true, preferredLocale: true } },
      },
    });

    let sent = 0;
    for (const m of pending) {
      if (!m.member.phone) continue;
      const tenantId = m.member.tenantId;
      const dateStr = m.startDate.toLocaleDateString('en-AE', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' });
      try {
        await this.notifications.dispatch({
          tenantId,
          memberId: m.memberId,
          to: m.member.phone,
          body: `Reminder: your ${m.plan.nameEn} renewal starts ${dateStr}. Please pay now to avoid interruption.`,
          bodyAr: `تذكير: تجديد اشتراكك في ${m.plan.nameAr ?? m.plan.nameEn} يبدأ ${dateStr}. يرجى الدفع لتجنب الانقطاع.`,
          templateName: 'membership_renewal_final_reminder',
          category: 'membership_renewal_final_reminder',
          locale: (m.member.preferredLocale as Locale) ?? Locale.EN,
        });
        await this.prisma.membership.update({
          where: { id: m.id },
          data: { lastReminderSentAt: now },
        });
        sent++;
      } catch (err) {
        this.logger.warn(`Final renewal reminder failed for membership ${m.id}: ${(err as Error).message}`);
      }
    }
    this.logger.log(`Pending renewal reminders: found=${pending.length} sent=${sent}`);
    return { found: pending.length, sent };
  }
}
