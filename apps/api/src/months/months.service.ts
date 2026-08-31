import { Injectable } from '@nestjs/common';
import { Prisma, type Row } from '@prisma/client';
import type { MonthInfo, ReportPreviewDTO, ReportResultDTO } from '@suivi/shared';
import { RowEventsService } from '../events/row-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { toRowDTO } from '../rows/rows.mapper';
import { RowsService } from '../rows/rows.service';

/** Statuts terminaux : dossiers terminés, jamais repris au mois suivant. */
const STATUTS_TERMINES = new Set(['CLOTUREE', 'ANNULEE']);

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
