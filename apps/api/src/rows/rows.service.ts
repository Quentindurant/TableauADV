import { Injectable } from '@nestjs/common';
import type { RowDTO } from '@suivi/shared';
import { RowEventsService } from '../events/row-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { toRowDTO } from './rows.mapper';

export interface CreateRowInput {
  month: string;
  position?: number;
}

@Injectable()
export class RowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: RowEventsService,
  ) {}

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

  /**
   * Crée une ligne vide. Sans `position`, la ligne est ajoutée en fin de mois ;
   * avec `position`, les lignes actives de rang >= position sont décalées de +1.
   */
  async create(dto: CreateRowInput, userId: string): Promise<RowDTO> {
    const created = await this.prisma.$transaction(async (tx) => {
      const siblings = await tx.row.count({ where: { month: dto.month, archived: false } });
      const position =
        dto.position === undefined ? siblings : Math.min(Math.max(dto.position, 0), siblings);

      if (position < siblings) {
        await tx.row.updateMany({
          where: { month: dto.month, archived: false, position: { gte: position } },
          data: { position: { increment: 1 } },
        });
      }

      const row = await tx.row.create({
        data: { month: dto.month, position, createdBy: userId },
      });
      await this.events.record(tx, {
        rowId: row.id,
        userId,
        type: 'create',
        payload: { month: dto.month, position },
      });
      return row;
    });

    return toRowDTO(created);
  }
}
