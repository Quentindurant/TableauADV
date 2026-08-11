import { Module } from '@nestjs/common';
import { ChoicesService } from './choices.service';
import { ColumnChoicesController } from './choices.controller';

@Module({
  controllers: [ColumnChoicesController],
  providers: [ChoicesService],
})
export class ChoicesModule {}
