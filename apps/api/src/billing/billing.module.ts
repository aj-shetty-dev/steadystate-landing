import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { BillingController } from './billing.controller';
import { BillingQueue } from './billing.queue';
import { BillingService } from './billing.service';

@Module({
  imports: [WhatsappModule],
  controllers: [BillingController],
  providers: [BillingService, BillingQueue],
  exports: [BillingService, BillingQueue],
})
export class BillingModule {}
