import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { ClassTypesService } from './class-types.service';
import { ClassesController } from './classes.controller';
import { RecurrenceExpanderService } from './recurrence-expander.service';
import { RecurrenceScheduler } from './recurrence.scheduler';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [ClassesController],
  providers: [ClassTypesService, RecurrenceExpanderService, SessionsService, BookingsService, RecurrenceScheduler],
  exports: [ClassTypesService, RecurrenceExpanderService, SessionsService, BookingsService],
})
export class ClassesModule {}
