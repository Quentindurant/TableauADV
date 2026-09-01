import { Module } from '@nestjs/common';
import { MeLayoutController } from './me-layout.controller';
import { MeLayoutService } from './me-layout.service';

@Module({
  controllers: [MeLayoutController],
  providers: [MeLayoutService],
})
export class MeLayoutModule {}
