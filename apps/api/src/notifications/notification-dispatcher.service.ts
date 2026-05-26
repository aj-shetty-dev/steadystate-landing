import { Injectable, Logger } from '@nestjs/common';
import { Locale } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

export type NotificationChannel = 'WHATSAPP' | 'EMAIL' | 'SMS';

export interface NotificationDispatchInput {
  tenantId: string;
  memberId?: string;
  to: string;
  body: string;
  bodyAr?: string;
  templateName?: string;
  channel?: NotificationChannel;
  locale?: Locale;
  category: string;
}

@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly prisma: PrismaService,
  ) {}

  async dispatch(input: NotificationDispatchInput): Promise<{ messageId: string | null; channel: NotificationChannel }> {
    const channel = input.channel ?? 'WHATSAPP';
    const locale = input.locale ?? Locale.EN;
    const body = locale === Locale.AR && input.bodyAr ? input.bodyAr : input.body;

    if (channel !== 'WHATSAPP') {
      this.logger.warn(`Channel ${channel} not yet implemented; dropping ${input.category}`);
      return { messageId: null, channel };
    }

    const result = await this.whatsapp.send({
      tenantId: input.tenantId,
      request: { to: input.to, body, templateName: input.templateName, locale: locale === Locale.AR ? 'ar' : 'en' },
    });
    return { messageId: result.messageId, channel };
  }

  async listForMember(tenantId: string, memberId: string, limit = 50) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, tenantId },
      select: { phone: true },
    });
    if (!member?.phone) return [];
    return this.prisma.whatsappMessage.findMany({
      where: { tenantId, to: member.phone },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
