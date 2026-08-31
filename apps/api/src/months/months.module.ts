import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { RowsModule } from '../rows/rows.module';
import { MonthsController } from './months.controller';
import { MonthsService } from './months.service';

@Module({
  imports: [EventsModule, RowsModule],
  controllers: [MonthsController],
  providers: [MonthsService],
  exports: [MonthsService],
})
export class MonthsModule {}
