import { Module } from '@nestjs/common';
import { ENV_TOKEN } from '../config/config.module';
import type { Env } from '../config/env.config';
import { MockWhatsappProvider } from './mock-whatsapp.provider';
import { TwilioWhatsappProvider } from './twilio-whatsapp.provider';
import { WhatsappMessagesController } from './whatsapp-messages.controller';
import { WHATSAPP_PROVIDER } from './whatsapp.provider';
import { WhatsappService } from './whatsapp.service';

@Module({
  controllers: [WhatsappMessagesController],
  providers: [
    MockWhatsappProvider,
    TwilioWhatsappProvider,
    {
      provide: WHATSAPP_PROVIDER,
      inject: [ENV_TOKEN, MockWhatsappProvider, TwilioWhatsappProvider],
      useFactory: (
        env: Env,
        mock: MockWhatsappProvider,
        live: TwilioWhatsappProvider,
      ) => (env.TWILIO_MODE === 'live' ? live : mock),
    },
    WhatsappService,
  ],
  exports: [WhatsappService, WHATSAPP_PROVIDER, MockWhatsappProvider],
})
export class WhatsappModule {}
