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
}
