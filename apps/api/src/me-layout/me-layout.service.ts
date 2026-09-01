import { Injectable } from '@nestjs/common';
import type { UserColumnLayoutDTO } from '@suivi/shared';
import { notFound } from '../common/api.exception';
import { PrismaService } from '../prisma/prisma.service';

export interface UpdateUserColumnLayoutInput {
  width?: number;
  position?: number;
  hidden?: boolean;
}

interface UserColumnLayoutRecord {
  columnId: string;
  width: number | null;
  position: number | null;
  hidden: boolean;
}

function toUserColumnLayoutDTO(entry: UserColumnLayoutRecord): UserColumnLayoutDTO {
  return {
    columnId: entry.columnId,
    width: entry.width,
    position: entry.position,
    hidden: entry.hidden,
  };
}

/**
 * Disposition personnelle des colonnes (largeur, ordre, masquage) : chaque
 * compte garde sa propre vue, le réglage standard de la table `Column`
 * (écran admin Paramètres > Colonnes) reste intact. Aucune émission temps
 * réel ici : préférence strictement personnelle, les autres postes n'ont
 * rien à rafraîchir.
 */
@Injectable()
export class MeLayoutService {
  constructor(private readonly prisma: PrismaService) {}

  /** Entrées existantes de l'utilisateur courant, dans l'ordre standard des colonnes. */
  async list(userId: string): Promise<UserColumnLayoutDTO[]> {
    const entries = await this.prisma.userColumnLayout.findMany({
      where: { userId },
      orderBy: { column: { position: 'asc' } },
    });
    return entries.map(toUserColumnLayoutDTO);
  }

  /**
   * Upsert de l'entrée (userId, columnId) : les champs absents du body
   * restent inchangés, une première écriture partielle part des valeurs
   * « hérite du standard » (null / non masquée).
   */
  async upsert(
    userId: string,
    columnId: string,
    input: UpdateUserColumnLayoutInput,
  ): Promise<UserColumnLayoutDTO> {
    const entry = await this.prisma.$transaction(async (tx) => {
      const column = await tx.column.findUnique({ where: { id: columnId }, select: { id: true } });
      if (!column) {
        throw notFound('Colonne introuvable.');
      }
      return tx.userColumnLayout.upsert({
        where: { userId_columnId: { userId, columnId } },
        update: {
          ...(input.width !== undefined ? { width: input.width } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
          ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
        },
        create: {
          userId,
          columnId,
          width: input.width ?? null,
          position: input.position ?? null,
          hidden: input.hidden ?? false,
        },
      });
    });
    return toUserColumnLayoutDTO(entry);
  }

  /** Réinitialisation : purge toutes les entrées de l'utilisateur courant. */
  async reset(userId: string): Promise<{ deleted: number }> {
    const result = await this.prisma.userColumnLayout.deleteMany({ where: { userId } });
    return { deleted: result.count };
  }
}
