import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  whatsappSendRequestSchema,
  type WhatsappSendRequest,
  type WhatsappSendResult,
} from '@steady-state/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { WHATSAPP_PROVIDER, type WhatsappProvider } from './whatsapp.provider';

export interface SendWhatsappParams {
  tenantId: string;
  request: WhatsappSendRequest;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsappProvider,
    private readonly prisma: PrismaService,
  ) {}

  async send({ tenantId, request }: SendWhatsappParams): Promise<WhatsappSendResult> {
    const validated = whatsappSendRequestSchema.parse(request);

    const record = await this.prisma.whatsappMessage.create({
      data: {
        tenantId,
        to: validated.to,
        body: validated.body,
        templateName: validated.templateName ?? null,
        status: 'QUEUED',
      },
    });

    try {
      const result = await this.provider.send(validated);
      await this.prisma.whatsappMessage.update({
        where: { id: record.id },
        data: {
          status: 'SENT',
          providerMessageId: result.messageId,
          sentAt: result.sentAt,
        },
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(`WhatsApp send failed for tenant=${tenantId}: ${message}`);
      await this.prisma.whatsappMessage.update({
        where: { id: record.id },
        data: { status: 'FAILED', errorMessage: message },
      });
      throw err;
    }
  }
}
