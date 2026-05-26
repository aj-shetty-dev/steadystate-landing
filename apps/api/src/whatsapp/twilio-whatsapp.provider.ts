import { Inject, Injectable, Logger } from '@nestjs/common';
import twilio, { type Twilio } from 'twilio';
import type { WhatsappSendRequest, WhatsappSendResult } from '@steady-state/shared-types';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import type { WhatsappProvider } from './whatsapp.provider';

@Injectable()
export class TwilioWhatsappProvider implements WhatsappProvider {
  private readonly logger = new Logger(TwilioWhatsappProvider.name);
  private client: Twilio | null = null;

  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

  private getClient(): Twilio {
    if (!this.client) {
      this.client = twilio(this.env.TWILIO_ACCOUNT_SID, this.env.TWILIO_AUTH_TOKEN);
    }
    return this.client;
  }

  async send(request: WhatsappSendRequest): Promise<WhatsappSendResult> {
    const message = await this.getClient().messages.create({
      from: this.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${request.to}`,
      body: request.body,
    });
    this.logger.log(`Twilio WhatsApp → ${request.to} sid=${message.sid}`);
    return {
      messageId: message.sid,
      status: 'queued',
      to: request.to,
      sentAt: new Date(),
    };
  }
}
