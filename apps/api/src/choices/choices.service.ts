import { Injectable, HttpStatus } from '@nestjs/common';
import { ApiException } from '../common/api.exception';
import type { ChoiceDTO } from '@suivi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { notFound, validationFailed } from '../common/api.exception';
import { isUniqueConstraintViolation } from '../common/prisma-errors';
import { toChoiceDTO } from '../columns/mappers';
import { RealtimeEmitter } from '../realtime/realtime.emitter';

export interface CreateChoiceInput {
  label: string;
  bgColor?: string;
  textColor?: string;
  bold?: boolean;
}

export interface UpdateChoiceInput {
  label?: string;
  bgColor?: string | null;
  textColor?: string | null;
  bold?: boolean;
  position?: number;
  archived?: boolean;
}

@Injectable()
export class ChoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  async create(columnId: string, input: CreateChoiceInput): Promise<ChoiceDTO> {
    const column = await this.prisma.column.findUnique({ where: { id: columnId } });
    if (!column) {
      throw notFound('Colonne introuvable.');
    }
    if (column.type !== 'SELECT') {
      throw validationFailed(
        `La colonne « ${column.label} » n'est pas une liste déroulante : impossible d'y ajouter une valeur.`,
      );
    }

    const label = input.label.trim();
    const bold = input.bold ?? false;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const duplicate = await tx.choice.findFirst({ where: { columnId, label } });
        if (duplicate) {
          throw validationFailed(`La valeur « ${label} » existe déjà dans cette liste.`);
        }

        const aggregate = await tx.choice.aggregate({
          where: { columnId },
          _max: { position: true },
        });

        const position = (aggregate._max.position ?? -1) + 1;

        return tx.choice.create({
          data: {
            columnId,
            label,
            bgColor: input.bgColor ?? null,
            textColor: input.textColor ?? null,
            bold,
            position,
            archived: false,
          },
        });
      });

      const dto = toChoiceDTO(created);
      this.emitter.emitConfigChanged('choices');
      return dto;
    } catch (error) {
      // Course entre deux créations concurrentes du même libellé : le
      // pré-check ci-dessus laisse une fenêtre entre deux requêtes
      // simultanées sur la contrainte unique (columnId, label).
      if (isUniqueConstraintViolation(error)) {
        throw validationFailed(`La valeur « ${label} » existe déjà dans cette liste.`);
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateChoiceInput): Promise<ChoiceDTO> {
    const existing = await this.prisma.choice.findUnique({
      where: { id },
      include: { column: true },
    });
    if (!existing) {
      throw notFound('Valeur de liste introuvable.');
    }

    const newLabel = input.label === undefined ? undefined : input.label.trim();
    const isRename = newLabel !== undefined && newLabel !== existing.label;

    if (isRename) {
      const duplicate = await this.prisma.choice.findFirst({
        where: { columnId: existing.columnId, label: newLabel, id: { not: id } },
      });
      if (duplicate) {
        throw validationFailed(`La valeur « ${newLabel} » existe déjà dans cette liste.`);
      }
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        let targetPosition: number | undefined;

        if (input.position !== undefined && input.position !== existing.position) {
          const total = await tx.choice.count({ where: { columnId: existing.columnId } });
          const from = existing.position;
          const to = Math.min(Math.max(input.position, 0), total - 1);

          if (to < from) {
            await tx.choice.updateMany({
              where: { columnId: existing.columnId, id: { not: id }, position: { gte: to, lt: from } },
              data: { position: { increment: 1 } },
            });
          } else if (to > from) {
            await tx.choice.updateMany({
              where: { columnId: existing.columnId, id: { not: id }, position: { gt: from, lte: to } },
              data: { position: { decrement: 1 } },
            });
          }
          targetPosition = to;
        }

        const choice = await tx.choice.update({
          where: { id },
          data: {
            ...(newLabel !== undefined ? { label: newLabel } : {}),
            ...(input.bgColor !== undefined ? { bgColor: input.bgColor } : {}),
            ...(input.textColor !== undefined ? { textColor: input.textColor } : {}),
            ...(input.bold !== undefined ? { bold: input.bold } : {}),
            ...(input.archived !== undefined ? { archived: input.archived } : {}),
            ...(targetPosition !== undefined ? { position: targetPosition } : {}),
          },
        });

        if (isRename) {
          // Les lignes stockent le LIBELLÉ du choix dans le JSONB : propagation en masse.
          // jsonb_set(data, ARRAY['<clé>'], to_jsonb('<nouveau>'), false) : ne crée jamais
          // la clé sur les lignes qui ne l'avaient pas.
          await tx.$executeRaw`
            UPDATE "Row"
            SET "data" = jsonb_set(
              "data",
              ARRAY[${existing.column.key}::text],
              to_jsonb(${newLabel as string}::text),
              false
            )
            WHERE "data" ->> ${existing.column.key}::text = ${existing.label}::text
          `;
        }

        return choice;
      });

      const dto = toChoiceDTO(updated);
      this.emitter.emitConfigChanged('choices');
      return dto;
    } catch (error) {
      // Course entre deux renommages concurrents vers le même libellé : le
      // pré-check ci-dessus laisse une fenêtre entre deux requêtes
      // simultanées sur la contrainte unique (columnId, label).
      if (isUniqueConstraintViolation(error)) {
        const label = newLabel ?? existing.label;
        throw validationFailed(`La valeur « ${label} » existe déjà dans cette liste.`);
      }
      throw error;
    }
  }

  /** Nombre de lignes dont la colonne `key` vaut exactement `label`. */
  async countRowsUsingChoice(key: string, label: string): Promise<number> {
    const result = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM "Row"
      WHERE "data" ->> ${key}::text = ${label}::text
    `;
    return result[0]?.count ?? 0;
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.choice.findUnique({
      where: { id },
      include: { column: true },
    });
    if (!existing) {
      throw notFound('Valeur de liste introuvable.');
    }

    const rowCount = await this.countRowsUsingChoice(existing.column.key, existing.label);
    if (rowCount > 0) {
      throw new ApiException(
        'CHOICE_IN_USE',
        `La valeur « ${existing.label} » est utilisée par ${rowCount} ligne(s). Archivez-la plutôt que de la supprimer : les lignes existantes la conservent et elle ne sera plus proposée à la saisie.`,
        HttpStatus.CONFLICT,
        { rowCount },
      );
    }

    await this.prisma.choice.delete({ where: { id } });
    this.emitter.emitConfigChanged('choices');
  }
}
