import { Module } from '@nestjs/common';
import { RowEventsService } from './row-events.service';

@Module({
  providers: [RowEventsService],
  exports: [RowEventsService],
})
export class EventsModule {}
