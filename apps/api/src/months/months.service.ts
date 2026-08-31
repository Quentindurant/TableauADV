import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type Row } from '@prisma/client';
import type {
  MonthCorbeilleDTO,
  MonthDeleteResultDTO,
  MonthInfo,
  MonthRestoreResultDTO,
  ReportPreviewDTO,
  ReportResultDTO,
} from '@suivi/shared';
import { ApiException, notFound } from '../common/api.exception';
import { RowEventsService } from '../events/row-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { toRowDTO } from '../rows/rows.mapper';
import { RowsService } from '../rows/rows.service';

/** Statuts terminaux : dossiers terminés, jamais repris au mois suivant. */
const STATUTS_TERMINES = new Set(['CLOTUREE', 'ANNULEE']);

/**
 * Ligne telle que figée dans l'instantané `MonthTrash.rows` : la restauration
 * réinsère À L'IDENTIQUE ids, positions, data, formats, version, createdBy et
 * createdAt (ISO). `archived` est toujours false (seules les lignes actives
 * sont supprimées) mais figure dans l'instantané par fidélité au contrat.
 */
interface LigneCorbeille {
  id: string;
  month: string;
  position: number;
  data: Prisma.JsonValue;
  formats: Prisma.JsonValue;
  version: number;
  archived: boolean;
  createdBy: string | null;
  createdAt: string;
}

/**
 * Ligne candidate au report vers `to` : non clôturée/annulée ET dont la date
 * d'installation (`data.date`, ISO AAAA-MM-JJ) tombe dans le mois cible OU est
 * vide/absente (dossier non planifié). Filtre en mémoire : un mois compte
 * ~300 lignes, un findMany + filtre JS est plus sûr qu'une requête JSONB brute.
 */
function estCandidate(row: Row, to: string): boolean {
  const data = toRowDTO(row).data;
  const statut = data['statut'];
  if (typeof statut === 'string' && STATUTS_TERMINES.has(statut)) {
    return false;
  }
  const date = data['date'];
  if (date === undefined || date === null || String(date).trim() === '') {
    return true;
  }
  return String(date).startsWith(to);
}

@Injectable()
export class MonthsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rows: RowsService,
    private readonly events: RowEventsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  /**
   * Onglets de mois : mois possédant au moins une ligne active, avec le
   * nombre de lignes. "AAAA-MM" se trie lexicographiquement = chronologiquement.
   */
  async list(): Promise<MonthInfo[]> {
    const groups = await this.prisma.row.groupBy({
      by: ['month'],
      where: { archived: false },
      _count: { _all: true },
      orderBy: { month: 'asc' },
    });
    return groups.map((group) => ({ month: group.month, count: group._count._all }));
  }

  /**
   * Aperçu du report vers `to` : dernier mois actif antérieur et nombre de
   * dossiers qui seraient repris. Ne modifie rien.
   */
  async reportPreview(to: string): Promise<ReportPreviewDTO> {
    const from = await this.dernierMoisActifAvant(this.prisma, to);
    if (from === null) {
      return { from: null, count: 0 };
    }
    const candidates = await this.candidates(this.prisma, from, to);
    return { from, count: candidates.length };
  }

  /**
   * Report des dossiers du dernier mois actif vers `to`, en UNE transaction
   * (pas d'état partiel) : copie intégrale de `data` et `formats`, version 0,
   * positions 0..n-1 en tête du mois cible dans l'ordre relatif du mois
   * source, qui reste intact. Sans candidate, une ligne vide matérialise le
   * mois (comportement historique du « + »).
   */
  async report(to: string, userId: string): Promise<ReportResultDTO> {
    const { from, createdRows, shiftedIds } = await this.prisma.$transaction(async (tx) => {
      const source = await this.dernierMoisActifAvant(tx, to);
      const candidates = source === null ? [] : await this.candidates(tx, source, to);
      if (candidates.length === 0) {
        return { from: source, createdRows: [] as Row[], shiftedIds: [] as string[] };
      }

      // Le mois cible est en principe neuf ; si des lignes actives y existent
      // déjà, elles sont décalées pour insérer le report en tête (même geste
      // que RowsService.create).
      const existing = await tx.row.findMany({
        where: { month: to, archived: false },
        select: { id: true },
      });
      if (existing.length > 0) {
        await tx.row.updateMany({
          where: { month: to, archived: false },
          data: { position: { increment: candidates.length } },
        });
      }

      const copies: Row[] = [];
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const row = await tx.row.create({
          data: {
            month: to,
            position: index,
            data: candidate.data as Prisma.InputJsonValue,
            formats: candidate.formats as Prisma.InputJsonValue,
            version: 0,
            archived: false,
            createdBy: userId,
          },
        });
        await this.events.record(tx, {
          rowId: row.id,
          userId,
          type: 'create',
          payload: { reportFrom: candidate.id, sourceMonth: source },
        });
        copies.push(row);
      }
      return { from: source, createdRows: copies, shiftedIds: existing.map((row) => row.id) };
    });

    if (createdRows.length === 0) {
      // Comportement historique : le nouveau mois existe via une ligne vide.
      await this.rows.create({ month: to }, userId);
      return { from, created: 0 };
    }

    for (const row of createdRows) {
      this.emitter.emitRowCreated(toRowDTO(row));
    }
    await this.emitShifted(shiftedIds, userId);
    return { from, created: createdRows.length };
  }

  /**
   * Supprime les lignes ACTIVES d'un mois (les archivées restent : elles
   * vivent dans la vue Archives) et fige, dans la MÊME transaction, un
   * instantané de corbeille — une seule entrée par mois, écrasée à chaque
   * nouvelle suppression. La suppression des lignes efface leurs RowEvent en
   * cascade : l'historique n'est PAS restauré. Mois sans ligne active :
   * { deleted: 0 } sans toucher à un éventuel instantané existant.
   */
  async deleteMonth(month: string): Promise<MonthDeleteResultDTO> {
    const deletedRows = await this.prisma.$transaction(async (tx) => {
      const actives = await tx.row.findMany({
        where: { month, archived: false },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
      if (actives.length === 0) {
        return [] as Row[];
      }

      const instantane: LigneCorbeille[] = actives.map((row) => ({
        id: row.id,
        month: row.month,
        position: row.position,
        data: row.data,
        formats: row.formats,
        version: row.version,
        archived: row.archived,
        createdBy: row.createdBy,
        createdAt: row.createdAt.toISOString(),
      }));
      const rows = instantane as unknown as Prisma.InputJsonValue;
      await tx.monthTrash.upsert({
        where: { month },
        create: { month, count: actives.length, rows },
        update: { deletedAt: new Date(), count: actives.length, rows },
      });
      await tx.row.deleteMany({ where: { id: { in: actives.map((row) => row.id) } } });
      return actives;
    });

    // APRÈS commit (contrat temps réel) : chaque grille ouverte sur le mois
    // retire les lignes une à une via row.deleted, mécanisme déjà appliqué
    // par le store front (applyRowDeleted).
    for (const row of deletedRows) {
      this.emitter.emitRowDeleted(row.id, month, false);
    }
    return { deleted: deletedRows.length };
  }

  /** Corbeille des mois supprimés, du plus récent au plus ancien. */
  async corbeille(): Promise<MonthCorbeilleDTO[]> {
    const entries = await this.prisma.monthTrash.findMany({
      orderBy: { deletedAt: 'desc' },
    });
    return entries.map((entry) => ({
      month: entry.month,
      deletedAt: entry.deletedAt.toISOString(),
      count: entry.count,
    }));
  }

  /**
   * Restaure un mois depuis son instantané de corbeille, en UNE transaction :
   * réinsertion à l'identique (ids, positions, data, formats, version,
   * createdBy, createdAt), un RowEvent 'create' par ligne attribué à
   * l'utilisateur courant (l'historique d'origine a été effacé en cascade à
   * la suppression), puis retrait de l'entrée de corbeille. Si le mois
   * contient DÉJÀ des lignes actives : 409 VERSION_CONFLICT, rien n'est
   * modifié. Sans instantané : 404.
   */
  async restoreMonth(month: string, userId: string): Promise<MonthRestoreResultDTO> {
    const restoredRows = await this.prisma.$transaction(async (tx) => {
      const trash = await tx.monthTrash.findUnique({ where: { month } });
      if (trash === null) {
        throw notFound('Aucun instantané de corbeille pour ce mois.');
      }
      const actives = await tx.row.count({ where: { month, archived: false } });
      if (actives > 0) {
        throw new ApiException(
          'VERSION_CONFLICT',
          'Le mois contient déjà des lignes actives : restauration refusée.',
          HttpStatus.CONFLICT,
          { month, activeCount: actives },
        );
      }

      const lignes = trash.rows as unknown as LigneCorbeille[];
      const rows: Row[] = [];
      for (const ligne of lignes) {
        const row = await tx.row.create({
          data: {
            id: ligne.id,
            month: ligne.month,
            position: ligne.position,
            data: ligne.data as Prisma.InputJsonValue,
            formats: ligne.formats as Prisma.InputJsonValue,
            version: ligne.version,
            archived: ligne.archived,
            createdBy: ligne.createdBy,
            createdAt: new Date(ligne.createdAt),
          },
        });
        await this.events.record(tx, {
          rowId: row.id,
          userId,
          type: 'create',
          payload: { restauredDe: 'corbeille', month },
        });
        rows.push(row);
      }
      await tx.monthTrash.delete({ where: { month } });
      return rows;
    });

    // APRÈS commit : les grilles ouvertes sur le mois réaffichent les lignes
    // via row.created (upsert idempotent côté store front).
    for (const row of restoredRows) {
      this.emitter.emitRowCreated(toRowDTO(row));
    }
    return { restored: restoredRows.length };
  }

  /** Dernier mois actif strictement avant `to` (tri lexicographique = chronologique). */
  private async dernierMoisActifAvant(
    db: Prisma.TransactionClient,
    to: string,
  ): Promise<string | null> {
    const last = await db.row.findFirst({
      where: { archived: false, month: { lt: to } },
      orderBy: { month: 'desc' },
      select: { month: true },
    });
    return last?.month ?? null;
  }

  /** Lignes actives de `from` candidates au report vers `to`, dans l'ordre manuel du mois source. */
  private async candidates(
    db: Prisma.TransactionClient,
    from: string,
    to: string,
  ): Promise<Row[]> {
    const rows = await db.row.findMany({
      where: { month: from, archived: false },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.filter((row) => estCandidate(row, to));
  }

  /**
   * Émet row.updated (changedKeys vide) pour les lignes du mois cible dont
   * seule la POSITION a été décalée par l'insertion en tête — même mécanique
   * que RowsService, toujours APRÈS commit (contrat temps réel).
   */
  private async emitShifted(ids: string[], userId: string): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const rows = await this.prisma.row.findMany({ where: { id: { in: ids } } });
    for (const row of rows) {
      this.emitter.emitRowUpdated(toRowDTO(row), [], userId);
    }
  }
}
