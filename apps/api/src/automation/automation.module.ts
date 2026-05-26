import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AutomationController } from './automation.controller';
import { ChurnDetectorService } from './churn-detector.service';
import { ChurnEngineService } from './churn-engine.service';
import { ChurnNudgeService } from './churn-nudge.service';
import { ChurnQueue } from './churn.queue';
import { RamadanGuard } from './ramadan.guard';

@Module({
  imports: [WhatsappModule],
  controllers: [AutomationController],
  providers: [
    ChurnDetectorService,
    ChurnNudgeService,
    ChurnEngineService,
    ChurnQueue,
    RamadanGuard,
  ],
  exports: [ChurnEngineService, ChurnQueue],
})
export class AutomationModule {}
