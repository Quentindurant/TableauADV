import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import {
  reportMonthSchema,
  type MonthInfo,
  type ReportPreviewDTO,
  type ReportResultDTO,
} from '@suivi/shared';
import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { parseOrThrow } from '../common/api-error';
import { MonthsService } from './months.service';

@Controller('months')
@UseGuards(JwtAuthGuard)
export class MonthsController {
  constructor(private readonly months: MonthsService) {}

  @Get()
  async list(): Promise<MonthInfo[]> {
    return this.months.list();
  }

  @Get('report-preview')
  async reportPreview(@Query() query: unknown): Promise<ReportPreviewDTO> {
    const { to } = parseOrThrow(reportMonthSchema, query);
    return this.months.reportPreview(to);
  }

  @Post('report')
  @HttpCode(201)
  async report(@Body() body: unknown, @CurrentUserId() userId: string): Promise<ReportResultDTO> {
    const { to } = parseOrThrow(reportMonthSchema, body);
    return this.months.report(to, userId);
  }
}
