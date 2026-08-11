import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { createRowSchema, moveRowSchema, patchRowSchema, type RowDTO } from '@suivi/shared';
import { z } from 'zod';
import { CurrentUserId } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { parseOrThrow } from '../common/api-error';
import { RowsService } from './rows.service';

/** Filtre obligatoire de GET /api/rows : soit ?month=YYYY-MM, soit ?archived=true. */
const listRowsQuerySchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois attendu au format AAAA-MM')
      .optional(),
    archived: z.literal('true').optional(),
  })
  .refine((query) => query.month !== undefined || query.archived === 'true', {
    message: 'Filtre requis : month=AAAA-MM ou archived=true.',
  });

@Controller('rows')
@UseGuards(JwtAuthGuard)
export class RowsController {
  constructor(private readonly rows: RowsService) {}

  @Get()
  async list(@Query() query: unknown): Promise<RowDTO[]> {
    const filter = parseOrThrow(listRowsQuerySchema, query);
    if (filter.month !== undefined) {
      return this.rows.findByMonth(filter.month);
    }
    return this.rows.findArchived();
  }

  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown, @CurrentUserId() userId: string): Promise<RowDTO> {
    return this.rows.create(parseOrThrow(createRowSchema, body), userId);
  }

  @Patch(':id')
  async patch(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUserId() userId: string,
  ): Promise<RowDTO> {
    return this.rows.patch(id, parseOrThrow(patchRowSchema, body), userId);
  }

  @Post(':id/move')
  @HttpCode(200)
  async move(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUserId() userId: string,
  ): Promise<RowDTO> {
    return this.rows.move(id, parseOrThrow(moveRowSchema, body), userId);
  }
}
