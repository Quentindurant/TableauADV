import { Injectable } from '@nestjs/common';
import type { ChoiceDTO } from '@suivi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { notFound, validationFailed } from '../common/api.exception';
import { toChoiceDTO } from '../columns/mappers';

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
  constructor(private readonly prisma: PrismaService) {}

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
    const duplicate = await this.prisma.choice.findFirst({ where: { columnId, label } });
    if (duplicate) {
      throw validationFailed(`La valeur « ${label} » existe déjà dans cette liste.`);
    }

    const aggregate = await this.prisma.choice.aggregate({
      where: { columnId },
      _max: { position: true },
    });

    const position = (aggregate._max.position ?? -1) + 1;

    const bold = input.bold ?? false;

    const created = await this.prisma.choice.create({
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

    return toChoiceDTO(created);
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

    return toChoiceDTO(updated);
  }
}
