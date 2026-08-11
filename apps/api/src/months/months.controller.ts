import { Controller, Get, UseGuards } from '@nestjs/common';
import type { MonthInfo } from '@suivi/shared';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { MonthsService } from './months.service';

@Controller('months')
@UseGuards(JwtAuthGuard)
export class MonthsController {
  constructor(private readonly months: MonthsService) {}

  @Get()
  async list(): Promise<MonthInfo[]> {
    return this.months.list();
  }
}
