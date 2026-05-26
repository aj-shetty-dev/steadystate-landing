import { Global, Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { NotificationDispatcher } from './notification-dispatcher.service';

@Global()
@Module({
  imports: [WhatsappModule],
  providers: [NotificationDispatcher],
  exports: [NotificationDispatcher],
})
export class NotificationsModule {}
