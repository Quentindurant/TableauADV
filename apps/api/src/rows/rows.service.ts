import { Injectable } from '@nestjs/common';
import type { RowDTO } from '@suivi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toRowDTO } from './rows.mapper';

@Injectable()
export class RowsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lignes actives d'un mois, dans l'ordre manuel. */
  async findByMonth(month: string): Promise<RowDTO[]> {
    const rows = await this.prisma.row.findMany({
      where: { month, archived: false },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toRowDTO);
  }

  /** Vue Archives : toutes les lignes archivées, tous mois confondus. */
  async findArchived(): Promise<RowDTO[]> {
    const rows = await this.prisma.row.findMany({
      where: { archived: true },
      orderBy: [{ month: 'asc' }, { position: 'asc' }],
    });
    return rows.map(toRowDTO);
  }
}
