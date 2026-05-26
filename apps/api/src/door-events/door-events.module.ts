import { Module } from '@nestjs/common';
import { DoorEventController } from './door-event.controller';
import { DoorEventService } from './door-event.service';

@Module({
  controllers: [DoorEventController],
  providers: [DoorEventService],
  exports: [DoorEventService],
})
export class DoorEventsModule {}
