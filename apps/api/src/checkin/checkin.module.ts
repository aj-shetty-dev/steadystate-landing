import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { CheckInController } from './checkin.controller';
import { CheckInService } from './checkin.service';
import { KioskController } from './kiosk.controller';
import { QrTokenService } from './qr-token.service';

@Module({
  imports: [StaffModule],
  controllers: [CheckInController, KioskController],
  providers: [CheckInService, QrTokenService],
  exports: [CheckInService, QrTokenService],
})
export class CheckInModule {}
