import { Module } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { ShiftsController, StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  controllers: [StaffController, ShiftsController],
  providers: [StaffService, ShiftsService],
  exports: [StaffService, ShiftsService],
})
export class StaffModule {}
