import { Module } from '@nestjs/common';
import { ChoicesService } from './choices.service';
import { ColumnChoicesController } from './column-choices.controller';
import { ChoicesController } from './choices.controller';

@Module({
  controllers: [ColumnChoicesController, ChoicesController],
  providers: [ChoicesService],
  exports: [ChoicesService],
})
export class ChoicesModule {}
