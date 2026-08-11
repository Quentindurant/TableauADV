import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RowEventDTO } from '@suivi/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordEventInput {
  rowId: string;
  userId: string;
  type: RowEventDTO['type'];
  payload: unknown;
}

/** Nombre maximal d'événements retournés par l'historique d'une ligne. */
export const EVENTS_PAGE_SIZE = 100;

@Injectable()
export class RowEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Consigne un événement DANS la transaction en cours : l'écriture de la
   * ligne et son journal sont commités ensemble ou pas du tout.
   */
  async record(tx: Prisma.TransactionClient, input: RecordEventInput): Promise<void> {
    await tx.rowEvent.create({
      data: {
        rowId: input.rowId,
        userId: input.userId,
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
  }

  /** Historique d'une ligne : plus récent d'abord, 100 entrées maximum. */
  async listForRow(rowId: string): Promise<RowEventDTO[]> {
    const events = await this.prisma.rowEvent.findMany({
      where: { rowId },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: EVENTS_PAGE_SIZE,
      include: { user: { select: { displayName: true } } },
    });
    return events.map((event) => ({
      id: event.id,
      rowId: event.rowId,
      userId: event.userId,
      userName: event.user.displayName,
      at: event.at.toISOString(),
      type: event.type as RowEventDTO['type'],
      payload: event.payload,
    }));
  }
}
