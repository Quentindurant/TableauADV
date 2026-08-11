import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { RowDTO } from '@suivi/shared';
import { z } from 'zod';
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
}
