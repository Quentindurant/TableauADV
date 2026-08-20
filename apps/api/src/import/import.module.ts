import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { ImportFusionService } from './fusion.service';
import { ImportController } from './import.controller';

/**
 * Import fusion depuis le site (POST /api/import). `RealtimeEmitter` est
 * fourni par le module global RealtimeModule, comme pour RowsModule.
 */
@Module({
  imports: [EventsModule],
  controllers: [ImportController],
  providers: [ImportFusionService],
})
export class ImportModule {}
