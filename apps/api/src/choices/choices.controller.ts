import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { updateChoiceSchema, type ChoiceDTO } from '@suivi/shared';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { parseOrThrow } from '../common/api-error';
import { ChoicesService } from './choices.service';

@Controller('choices')
@UseGuards(JwtAuthGuard)
export class ChoicesController {
  constructor(private readonly choices: ChoicesService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<ChoiceDTO> {
    return this.choices.update(id, parseOrThrow(updateChoiceSchema, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.choices.remove(id);
  }
}
