import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { createColumnSchema, type ColumnDTO } from '@suivi/shared';
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
}
