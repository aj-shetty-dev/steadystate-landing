import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { WhatsappSendRequest, WhatsappSendResult } from '@steady-state/shared-types';
import type { WhatsappProvider } from './whatsapp.provider';

@Injectable()
export class MockWhatsappProvider implements WhatsappProvider {
  private readonly logger = new Logger(MockWhatsappProvider.name);
  private readonly sentMessages: Array<{ request: WhatsappSendRequest; sentAt: Date }> = [];

  async send(request: WhatsappSendRequest): Promise<WhatsappSendResult> {
    const sentAt = new Date();
    this.sentMessages.push({ request, sentAt });
    this.logger.log(
      `[MOCK] WhatsApp → ${request.to} (${request.locale}) ${request.body.slice(0, 60)}…`,
    );
    return {
      messageId: `mock_${randomUUID()}`,
      status: 'queued',
      to: request.to,
      sentAt,
    };
  }

  getSentMessages(): ReadonlyArray<{ request: WhatsappSendRequest; sentAt: Date }> {
    return this.sentMessages;
  }

  reset(): void {
    this.sentMessages.length = 0;
  }
}
