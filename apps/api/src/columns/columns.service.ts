import { HttpStatus, Injectable } from '@nestjs/common';
import type { ColumnDTO, ColumnType } from '@suivi/shared';
import { ApiException, notFound, validationFailed } from '../common/api.exception';
import { isUniqueConstraintViolation } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  async findAll(): Promise<ColumnDTO[]> {
    const columns = await this.prisma.column.findMany({
      orderBy: { position: 'asc' },
      include: { choices: { orderBy: { position: 'asc' } } },
    });
    return columns.map(toColumnDTO);
  }

  async create(input: CreateColumnInput): Promise<ColumnDTO> {
    const label = input.label.trim();

    try {
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

      const dto = toColumnDTO(created);
      this.emitter.emitConfigChanged('columns');
      return dto;
    } catch (error) {
      // Course entre deux créations concurrentes du même libellé : la clé
      // slugifiée calculée dans la transaction peut collisionner avec un
      // insert concurrent sur la contrainte unique de `key`.
      if (isUniqueConstraintViolation(error)) {
        throw validationFailed('Une colonne portant ce nom existe déjà.');
      }
      throw error;
    }
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

    const dto = toColumnDTO(updated);
    this.emitter.emitConfigChanged('columns');
    return dto;
  }

  /** Nombre de lignes dont la colonne porte une valeur non vide. */
  async countRowsWithValue(key: string): Promise<number> {
    const result = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM "Row"
      WHERE "data" ->> ${key}::text IS NOT NULL
        AND "data" ->> ${key}::text <> ''
    `;
    return result[0]?.count ?? 0;
  }

  async remove(id: string, force: boolean): Promise<void> {
    const existing = await this.prisma.column.findUnique({ where: { id } });
    if (!existing) {
      throw notFound('Colonne introuvable.');
    }

    if (!force) {
      const rowCount = await this.countRowsWithValue(existing.key);
      if (rowCount > 0) {
        throw new ApiException(
          'COLUMN_HAS_DATA',
          `La colonne « ${existing.label} » contient des données sur ${rowCount} ligne(s). Confirmez la suppression pour effacer aussi ces valeurs.`,
          HttpStatus.CONFLICT,
          { rowCount },
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // Opérateur jsonb "-" : retire la clé de l'objet `data` de chaque ligne.
      await tx.$executeRaw`
        UPDATE "Row"
        SET "data" = "data" - ${existing.key}::text
      `;
      await tx.column.delete({ where: { id } });
    });

    this.emitter.emitConfigChanged('columns');
  }
}
