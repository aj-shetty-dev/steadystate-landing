import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, PaymentAttemptOutcome, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { loadBillingConfig } from './billing.config';
import { nextSalaryWindow, scheduledInstantFor, type SalaryWindowConfig } from './salary-scheduler';

export interface ScheduleResult {
  eligible: number;
  scheduled: number;
  alreadyScheduled: number;
}

export interface ProcessResult {
  processed: number;
  notified: number;
  failed: number;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly defaults = loadBillingConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async getWindow(tenantId: string): Promise<SalaryWindowConfig> {
    const row = await this.prisma.salaryWindow.findUnique({ where: { tenantId } });
    return {
      startDay: row?.startDay ?? this.defaults.BILLING_DEFAULT_WINDOW_START,
      endDay: row?.endDay ?? this.defaults.BILLING_DEFAULT_WINDOW_END,
      timezone: row?.timezone ?? this.defaults.BILLING_DEFAULT_TIMEZONE,
      jitterMinutes: row?.jitterMinutes ?? this.defaults.BILLING_JITTER_MINUTES,
    };
  }

  async scheduleRetries(tenantId: string, now: Date = new Date()): Promise<ScheduleResult> {
    const window = await this.getWindow(tenantId);
    const span = nextSalaryWindow(now, window);

    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, status: InvoiceStatus.FAILED },
      include: { attempts: { where: { outcome: PaymentAttemptOutcome.PENDING } } },
    });

    let scheduled = 0;
    let alreadyScheduled = 0;
    for (const invoice of invoices) {
      if (invoice.attempts.length > 0) {
        alreadyScheduled++;
        continue;
      }
      const at = scheduledInstantFor(invoice.id, span, window);
      await this.prisma.$transaction([
        this.prisma.paymentAttempt.create({
          data: {
            tenantId,
            invoiceId: invoice.id,
            scheduledFor: at,
            outcome: PaymentAttemptOutcome.PENDING,
          },
        }),
        this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: InvoiceStatus.RETRY_SCHEDULED },
        }),
      ]);
      scheduled++;
    }

    this.logger.log(
      `Schedule retries tenant=${tenantId} eligible=${invoices.length} scheduled=${scheduled} already=${alreadyScheduled}`,
    );
    return { eligible: invoices.length, scheduled, alreadyScheduled };
  }

  async processDueRetries(tenantId: string, now: Date = new Date()): Promise<ProcessResult> {
    const due = await this.prisma.paymentAttempt.findMany({
      where: { tenantId, outcome: PaymentAttemptOutcome.PENDING, scheduledFor: { lte: now } },
      include: {
        invoice: { include: { member: { select: { id: true, fullName: true, phone: true, preferredLocale: true } } } },
      },
    });

    let notified = 0;
    let failed = 0;
    for (const attempt of due) {
      const phone = attempt.invoice.member.phone;
      if (!phone) {
        await this.prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: { outcome: PaymentAttemptOutcome.SKIPPED, attemptedAt: now },
        });
        continue;
      }
      const body = renderBillingReminder({
        firstName: attempt.invoice.member.fullName.split(' ')[0] ?? 'there',
        amountAed: (attempt.invoice.amountAed + attempt.invoice.vatAed) / 100,
        locale: attempt.invoice.member.preferredLocale,
      });
      try {
        await this.whatsapp.send({
          tenantId,
          request: { to: phone, body, locale: attempt.invoice.member.preferredLocale === 'AR' ? 'ar' : 'en' },
        });
        // TODO(human): trigger real card retry via Stripe/Telr here.
        await this.prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: { outcome: PaymentAttemptOutcome.SKIPPED, attemptedAt: now },
        });
        notified++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        await this.prisma.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            outcome: PaymentAttemptOutcome.FAILED,
            attemptedAt: now,
            providerResponse: { error: message },
          },
        });
        failed++;
      }
    }
    this.logger.log(
      `Process due tenant=${tenantId} processed=${due.length} notified=${notified} failed=${failed}`,
    );
    return { processed: due.length, notified, failed };
  }

  async listInvoices(tenantId: string, page: number, pageSize: number, memberId?: string, status?: string, search?: string) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const where: Prisma.InvoiceWhereInput = { tenantId };
    if (memberId) where.memberId = memberId;
    if (status) where.status = status as InvoiceStatus;
    if (search) {
      where.member = { fullName: { contains: search, mode: 'insensitive' } };
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        orderBy: { dueDate: 'desc' },
        skip,
        take,
        include: { member: { select: { id: true, fullName: true, phone: true } } },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items, total, page: Math.max(page, 1), pageSize: take };
  }

  async markInvoiceFailed(tenantId: string, invoiceId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    await this.prisma.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.FAILED } });
  }
}

interface ReminderInput {
  firstName: string;
  amountAed: number;
  locale: 'EN' | 'AR';
}

export function renderBillingReminder({ firstName, amountAed, locale }: ReminderInput): string {
  const fmt = amountAed.toFixed(2);
  if (locale === 'AR') {
    return `مرحباً ${firstName}، تجديد عضويتك مستحق بقيمة ${fmt} درهم. يرجى تحديث طريقة الدفع.`;
  }
  return `Hi ${firstName}, your membership renewal of AED ${fmt} is due. Tap the link in your gym app to update your payment method.`;
}
