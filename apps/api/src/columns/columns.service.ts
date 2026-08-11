import { Injectable } from '@nestjs/common';
import type { ColumnDTO } from '@suivi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toColumnDTO } from './mappers';

@Injectable()
export class ColumnsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<ColumnDTO[]> {
    const columns = await this.prisma.column.findMany({
      orderBy: { position: 'asc' },
      include: { choices: { orderBy: { position: 'asc' } } },
    });
    return columns.map(toColumnDTO);
  }
}
