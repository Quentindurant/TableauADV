import { Controller, Get, UseGuards } from '@nestjs/common';
import type { ColumnDTO } from '@suivi/shared';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { ColumnsService } from './columns.service';

@Controller('columns')
@UseGuards(JwtAuthGuard)
export class ColumnsController {
  constructor(private readonly columns: ColumnsService) {}

  @Get()
  findAll(): Promise<ColumnDTO[]> {
    return this.columns.findAll();
  }
}
