import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type Row } from '@prisma/client';
import type { CellFormat, CellValue, RowDTO, RowEventDTO } from '@suivi/shared';
import { ApiException, notFound } from '../common/api.exception';
import { RowEventsService } from '../events/row-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import {
  buildDiff,
  changedKeysOf,
  conflictKeys,
  mergeData,
  mergeFormats,
  versionOfPayload,
  type FormatsPatch,
  type RowData,
  type RowFormats,
} from './merge';
import { toRowDTO } from './rows.mapper';

export interface CreateRowInput {
  month: string;
  position?: number;
}

export interface PatchRowInput {
  expectedVersion: number;
  patch?: Record<string, CellValue>;
  formats?: Record<string, CellFormat | null>;
}

export interface MoveRowInput {
  month?: string;
  position?: number;
}

/**
 * Fenêtre d'événements relus pour la détection de conflit. Un client ne peut
 * pas détenir une version antérieure à 200 éditions (toute reconnexion
 * resynchronise la ligne entière), la fenêtre est donc largement suffisante.
 */
const CONFLICT_SCAN_LIMIT = 200;
/** Nombre de rejeux d'une transaction sérialisable interrompue par un concurrent. */
const SERIALIZATION_RETRIES = 3;
/** Plafond de résultats de la recherche globale (contrat : max 200). */
const SEARCH_LIMIT = 200;

/** PostgreSQL 40001 / Prisma P2034 : la transaction doit être rejouée. */
function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034';
  }
  // Une erreur métier volontaire (ApiException : 404/409...) n'est jamais un
  // échec de sérialisation : elle doit remonter telle quelle, sans rejeu.
  if (error instanceof HttpException) {
    return false;
  }
  const message = error instanceof Error ? error.message : '';
  return message.includes('40001') || message.includes('could not serialize');
}

@Injectable()
export class RowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: RowEventsService,
    private readonly emitter: RealtimeEmitter,
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

    const row = toRowDTO(created);
    this.emitter.emitRowCreated(row);
    return row;
  }

  /**
   * Fusion clé par clé d'une ligne (cœur de la co-édition).
   * Transaction sérialisable + verrou de ligne `FOR UPDATE` : deux PATCH
   * concurrents sur la même ligne sont appliqués l'un après l'autre.
   * Conflit (409) UNIQUEMENT si `expectedVersion < version` ET qu'une clé du
   * patch a été modifiée par un événement postérieur à `expectedVersion`.
   */
  async patch(id: string, dto: PatchRowInput, userId: string): Promise<RowDTO> {
    const patch: RowData = dto.patch ?? {};
    const formatsPatch: FormatsPatch = dto.formats ?? {};
    const keys = changedKeysOf(patch, formatsPatch);

    const updated = await this.runSerialized(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Row" WHERE "id" = ${id} FOR UPDATE
      `;
      if (locked.length === 0) {
        throw notFound('Ligne introuvable.');
      }
      const row = await tx.row.findUniqueOrThrow({ where: { id } });

      if (dto.expectedVersion < row.version) {
        const recent = await tx.rowEvent.findMany({
          where: { rowId: id, type: { in: ['update', 'format'] } },
          orderBy: [{ at: 'desc' }, { id: 'desc' }],
          take: CONFLICT_SCAN_LIMIT,
          select: { payload: true },
        });
        // Un événement sans version explicite est considéré postérieur (prudence).
        const posterior = recent.filter((event) => {
          const version = versionOfPayload(event.payload);
          return version === null || version > dto.expectedVersion;
        });
        const conflicts = conflictKeys(posterior, keys);
        if (conflicts.length > 0) {
          throw new ApiException(
            'VERSION_CONFLICT',
            'Cette ligne a été modifiée entre-temps.',
            HttpStatus.CONFLICT,
            { current: toRowDTO(row), conflictKeys: conflicts },
          );
        }
      }

      const currentDto = toRowDTO(row);
      const currentData: RowData = currentDto.data;
      const currentFormats: RowFormats = currentDto.formats;
      const nextVersion = row.version + 1;

      const saved = await tx.row.update({
        where: { id },
        data: {
          data: mergeData(currentData, patch) as Prisma.InputJsonObject,
          formats: mergeFormats(currentFormats, formatsPatch) as Prisma.InputJsonObject,
          version: nextVersion,
        },
      });
      await this.events.record(tx, {
        rowId: id,
        userId,
        type: 'update',
        payload: {
          version: nextVersion,
          changedKeys: keys,
          diff: buildDiff(currentData, patch),
        },
      });
      return saved;
    });

    const row = toRowDTO(updated);
    this.emitter.emitRowUpdated(row, keys, userId);
    return row;
  }

  /**
   * Déplace une ligne dans son mois ou vers un autre mois.
   * L'ordre cible est reconstruit explicitement (liste d'ids + splice) puis
   * réécrit en 0..n-1 ; le mois source est renuméroté à son tour.
   */
  async move(id: string, dto: MoveRowInput, userId: string): Promise<RowDTO> {
    const existing = await this.prisma.row.findUnique({ where: { id } });
    if (existing === null) {
      throw notFound('Ligne introuvable.');
    }
    const targetMonth = dto.month ?? existing.month;

    const moved = await this.prisma.$transaction(async (tx) => {
      const others = await tx.row.findMany({
        where: { month: targetMonth, archived: false, id: { not: id } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      const ids = others.map((row) => row.id);
      const target = Math.min(Math.max(dto.position ?? ids.length, 0), ids.length);
      ids.splice(target, 0, id);

      for (let index = 0; index < ids.length; index += 1) {
        await tx.row.update({
          where: { id: ids[index] },
          data:
            ids[index] === id ? { month: targetMonth, position: index } : { position: index },
        });
      }

      if (existing.month !== targetMonth) {
        await this.renumberMonth(tx, existing.month);
      }

      await this.events.record(tx, {
        rowId: id,
        userId,
        type: 'move',
        payload: {
          fromMonth: existing.month,
          toMonth: targetMonth,
          fromPosition: existing.position,
          toPosition: target,
        },
      });

      return tx.row.findUniqueOrThrow({ where: { id } });
    });

    const row = toRowDTO(moved);
    this.emitter.emitRowMoved(row, existing.month);
    return row;
  }

  /**
   * Archive ou désarchive une ligne. À l'archivage, le mois est renuméroté ;
   * au désarchivage, la ligne revient en fin de son mois d'origine.
   */
  async archive(id: string, archived: boolean, userId: string): Promise<RowDTO> {
    const existing = await this.prisma.row.findUnique({ where: { id } });
    if (existing === null) {
      throw notFound('Ligne introuvable.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (archived) {
        await tx.row.update({ where: { id }, data: { archived: true } });
      } else {
        const active = await tx.row.count({ where: { month: existing.month, archived: false } });
        await tx.row.update({ where: { id }, data: { archived: false, position: active } });
      }
      await this.renumberMonth(tx, existing.month);
      await this.events.record(tx, { rowId: id, userId, type: 'archive', payload: { archived } });
      return tx.row.findUniqueOrThrow({ where: { id } });
    });

    const row = toRowDTO(updated);
    this.emitter.emitRowDeleted(row.id, row.month, existing.archived);
    this.emitter.emitRowCreated(row);
    return row;
  }

  /**
   * Supprime définitivement une ligne et renumérote son mois.
   * Aucun RowEvent 'delete' n'est consigné : RowEvent.rowId est en cascade,
   * l'événement serait effacé par la suppression dans la même transaction.
   */
  async remove(id: string): Promise<void> {
    const existing = await this.prisma.row.findUnique({ where: { id } });
    if (existing === null) {
      throw notFound('Ligne introuvable.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.row.delete({ where: { id } });
      await this.renumberMonth(tx, existing.month);
    });

    this.emitter.emitRowDeleted(id, existing.month, existing.archived);
  }

  /** Réécrit les positions actives d'un mois en 0..n-1 sans changer l'ordre. */
  private async renumberMonth(tx: Prisma.TransactionClient, month: string): Promise<void> {
    const rows = await tx.row.findMany({
      where: { month, archived: false },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, position: true },
    });
    for (let index = 0; index < rows.length; index += 1) {
      if (rows[index].position !== index) {
        await tx.row.update({ where: { id: rows[index].id }, data: { position: index } });
      }
    }
  }

  /** Transaction sérialisable, rejouée si un concurrent l'a fait échouer. */
  private async runSerialized<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    let lastError: unknown = new Error('Transaction non exécutée.');
    for (let attempt = 0; attempt < SERIALIZATION_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 15000,
        });
      } catch (error) {
        if (!isSerializationFailure(error)) {
          throw error;
        }
        lastError = error;
      }
    }
    throw lastError;
  }

  /** Historique d'une ligne (404 si la ligne n'existe pas). */
  async listEvents(id: string): Promise<RowEventDTO[]> {
    const existing = await this.prisma.row.findUnique({ where: { id }, select: { id: true } });
    if (existing === null) {
      throw notFound('Ligne introuvable.');
    }
    return this.events.listForRow(id);
  }

  /**
   * Recherche plein texte simple sur les valeurs de la ligne : `data::text`
   * comparé en ILIKE, tous mois confondus, archives incluses.
   * Le terme est passé en paramètre lié ; les jokers % et _ y sont échappés
   * pour être cherchés littéralement.
   */
  async search(q: string): Promise<RowDTO[]> {
    const term = q.trim();
    if (term.length === 0) {
      return [];
    }
    const pattern = `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT * FROM "Row"
      WHERE "data"::text ILIKE ${pattern}
      ORDER BY "month" DESC, "position" ASC
      LIMIT ${SEARCH_LIMIT}
    `;
    return rows.map(toRowDTO);
  }
}
