import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { CheckInModule } from '../checkin/checkin.module';
import { MemberPortalController } from './member-portal.controller';

@Module({
  imports: [ClassesModule, CheckInModule],
  controllers: [MemberPortalController],
})
export class MemberPortalModule {}
