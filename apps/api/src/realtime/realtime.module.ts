import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LocksService } from './locks.service';
import { PresenceService } from './presence.service';
import { RealtimeEmitter } from './realtime.emitter';
import { RealtimeGateway } from './realtime.gateway';

/**
 * `@Global()` : `RealtimeEmitter` est injectable dans RowsService,
 * ColumnsService, ChoicesService et UsersService sans reimporter le module.
 */
@Global()
@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway, LocksService, PresenceService, RealtimeEmitter],
  exports: [RealtimeEmitter, LocksService, PresenceService],
})
export class RealtimeModule {}
