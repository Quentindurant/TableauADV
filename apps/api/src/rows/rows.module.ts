import { Module } from '@nestjs/common';
import { RowsController } from './rows.controller';
import { RowsService } from './rows.service';

@Module({
  controllers: [RowsController],
  providers: [RowsService],
  exports: [RowsService],
})
export class RowsModule {}
