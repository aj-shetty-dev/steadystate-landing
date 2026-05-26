import { Injectable, Logger } from '@nestjs/common';
import { ChurnSignalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { firstNameFromFullName, renderChurnNudgeBody } from './churn-nudge.template';
import { RamadanGuard } from './ramadan.guard';

export interface NudgeDispatchResult {
  pending: number;
  sent: number;
  skipped: number;
  failed: number;
  suppressed: boolean;
}

@Injectable()
export class ChurnNudgeService {
  private readonly logger = new Logger(ChurnNudgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly ramadan: RamadanGuard,
  ) {}

  async dispatchPending(tenantId: string, now: Date = new Date()): Promise<NudgeDispatchResult> {
    if (this.ramadan.shouldSuppressNow(now)) {
      this.logger.log(`Ramadan suppression active — skipping nudge dispatch for tenant=${tenantId}`);
      return { pending: 0, sent: 0, skipped: 0, failed: 0, suppressed: true };
    }

    const pending = await this.prisma.churnSignal.findMany({
      where: { tenantId, status: ChurnSignalStatus.PENDING },
      include: { member: { select: { id: true, fullName: true, phone: true, preferredLocale: true } } },
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const signal of pending) {
      const phone = signal.member.phone;
      if (!phone) {
        await this.prisma.churnSignal.update({
          where: { id: signal.id },
          data: { status: ChurnSignalStatus.DISMISSED, errorMessage: 'member has no phone on file' },
        });
        skipped++;
        continue;
      }

      const locale: 'en' | 'ar' = signal.member.preferredLocale === 'AR' ? 'ar' : 'en';
      const body = renderChurnNudgeBody({
        firstName: firstNameFromFullName(signal.member.fullName),
        daysSinceLastCheckin: signal.daysSinceLastCheckin,
        locale,
      });

      try {
        const result = await this.whatsapp.send({
          tenantId,
          request: { to: phone, body, locale },
        });
        const record = await this.prisma.whatsappMessage.findFirst({
          where: { tenantId, providerMessageId: result.messageId },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        });
        await this.prisma.churnSignal.update({
          where: { id: signal.id },
          data: {
            status: ChurnSignalStatus.NUDGED,
            nudgedAt: result.sentAt,
            whatsappMessageId: record?.id ?? null,
          },
        });
        sent++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        await this.prisma.churnSignal.update({
          where: { id: signal.id },
          data: { status: ChurnSignalStatus.FAILED, errorMessage: message },
        });
        failed++;
      }
    }

    this.logger.log(
      `Churn nudge tenant=${tenantId} pending=${pending.length} sent=${sent} skipped=${skipped} failed=${failed}`,
    );
    return { pending: pending.length, sent, skipped, failed, suppressed: false };
  }
}
