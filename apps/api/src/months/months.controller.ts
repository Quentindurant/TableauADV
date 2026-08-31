import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  monthParamSchema,
  reportMonthSchema,
  type MonthCorbeilleDTO,
  type MonthDeleteResultDTO,
  type MonthInfo,
  type MonthRestoreResultDTO,
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

  // Déclaré AVANT toute route GET paramétrée éventuelle (`:month`) : Nest
  // apparie les routes dans l'ordre de déclaration, « corbeille » ne doit
  // jamais être avalé par un paramètre de chemin.
  @Get('corbeille')
  async corbeille(): Promise<MonthCorbeilleDTO[]> {
    return this.months.corbeille();
  }

  @Post('report')
  @HttpCode(201)
  async report(@Body() body: unknown, @CurrentUserId() userId: string): Promise<ReportResultDTO> {
    const { to } = parseOrThrow(reportMonthSchema, body);
    return this.months.report(to, userId);
  }

  @Delete(':month')
  @HttpCode(HttpStatus.OK)
  async deleteMonth(@Param() params: unknown): Promise<MonthDeleteResultDTO> {
    const { month } = parseOrThrow(monthParamSchema, params);
    return this.months.deleteMonth(month);
  }

  @Post(':month/restore')
  @HttpCode(HttpStatus.OK)
  async restore(
    @Param() params: unknown,
    @CurrentUserId() userId: string,
  ): Promise<MonthRestoreResultDTO> {
    const { month } = parseOrThrow(monthParamSchema, params);
    return this.months.restoreMonth(month, userId);
  }
}
