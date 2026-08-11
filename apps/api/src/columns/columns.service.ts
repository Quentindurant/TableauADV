import { Injectable } from '@nestjs/common';
import type { ColumnDTO, ColumnType } from '@suivi/shared';
import { notFound } from '../common/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { toColumnDTO } from './mappers';
import { slugify, uniqueKey } from './slugify';

export interface CreateColumnInput {
  label: string;
  type: ColumnType;
}

export interface UpdateColumnInput {
  label?: string;
  type?: ColumnType;
  position?: number;
  width?: number;
  visible?: boolean;
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

  async update(id: string, input: UpdateColumnInput): Promise<ColumnDTO> {
    const existing = await this.prisma.column.findUnique({ where: { id } });
    if (!existing) {
      throw notFound('Colonne introuvable.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let targetPosition: number | undefined;

      if (input.position !== undefined && input.position !== existing.position) {
        const total = await tx.column.count();
        const from = existing.position;
        const to = Math.min(Math.max(input.position, 0), total - 1);

        if (to < from) {
          // Decalage vers la droite des colonnes situees entre la cible et l'ancienne place.
          await tx.column.updateMany({
            where: { id: { not: id }, position: { gte: to, lt: from } },
            data: { position: { increment: 1 } },
          });
        } else if (to > from) {
          // Decalage vers la gauche des colonnes situees entre l'ancienne place et la cible.
          await tx.column.updateMany({
            where: { id: { not: id }, position: { gt: from, lte: to } },
            data: { position: { decrement: 1 } },
          });
        }
        targetPosition = to;
      }

      return tx.column.update({
        where: { id },
        data: {
          // La cle n'est jamais recalculee : les valeurs des lignes sont indexees par `key`.
          ...(input.label !== undefined ? { label: input.label.trim() } : {}),
          // Le type est toujours modifiable : on persiste le nouveau type sans
          // convertir les valeurs deja stockees (elles restent telles quelles et
          // sont reinterpretees par le nouveau type a l'affichage).
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.width !== undefined ? { width: input.width } : {}),
          ...(input.visible !== undefined ? { visible: input.visible } : {}),
          ...(targetPosition !== undefined ? { position: targetPosition } : {}),
        },
        include: { choices: { orderBy: { position: 'asc' } } },
      });
    });

    return toColumnDTO(updated);
  }
}
