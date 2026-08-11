import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { createChoiceSchema, type ChoiceDTO } from '@suivi/shared';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { parseOrThrow } from '../common/api-error';
import { ChoicesService } from './choices.service';

@Controller('columns/:columnId/choices')
@UseGuards(JwtAuthGuard)
export class ColumnChoicesController {
  constructor(private readonly choices: ChoicesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Param('columnId') columnId: string, @Body() body: unknown): Promise<ChoiceDTO> {
    return this.choices.create(columnId, parseOrThrow(createChoiceSchema, body));
  }
}
