import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { RowsController } from './rows.controller';
import { RowsService } from './rows.service';

@Module({
  imports: [EventsModule],
  controllers: [RowsController],
  providers: [RowsService],
  exports: [RowsService],
})
export class RowsModule {}
