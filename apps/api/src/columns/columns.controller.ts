import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { createColumnSchema, updateColumnSchema, type ColumnDTO } from '@suivi/shared';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { parseOrThrow } from '../common/api-error';
import { ColumnsService } from './columns.service';

@Controller('columns')
@UseGuards(JwtAuthGuard)
export class ColumnsController {
  constructor(private readonly columns: ColumnsService) {}

  @Get()
  findAll(): Promise<ColumnDTO[]> {
    return this.columns.findAll();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<ColumnDTO> {
    return this.columns.create(parseOrThrow(createColumnSchema, body));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<ColumnDTO> {
    return this.columns.update(id, parseOrThrow(updateColumnSchema, body));
  }
}
