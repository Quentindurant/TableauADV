import { Injectable } from '@nestjs/common';
import type { ColumnDTO, ColumnType } from '@suivi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toColumnDTO } from './mappers';
import { slugify, uniqueKey } from './slugify';

export interface CreateColumnInput {
  label: string;
  type: ColumnType;
}

const DEFAULT_WIDTH = 150;

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

  async create(input: CreateColumnInput): Promise<ColumnDTO> {
    const label = input.label.trim();

    const created = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.column.findMany({ select: { key: true } });
      const key = uniqueKey(
        slugify(label),
        existing.map((column) => column.key),
      );
      const aggregate = await tx.column.aggregate({ _max: { position: true } });
      const position = (aggregate._max.position ?? -1) + 1;

      return tx.column.create({
        data: {
          key,
          label,
          type: input.type,
          position,
          width: DEFAULT_WIDTH,
          visible: true,
        },
        include: { choices: { orderBy: { position: 'asc' } } },
      });
    });

    return toColumnDTO(created);
  }
}
