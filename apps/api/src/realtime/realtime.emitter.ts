import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { RowDTO } from '@suivi/shared';

/** Portees de `config.changed` (contrat). */
export type ConfigScope = 'columns' | 'choices' | 'users';

/**
 * Point d emission unique des evenements serveur -> clients.
 * `RealtimeGateway.afterInit` lui injecte le serveur Socket.IO ; les services
 * REST appellent ses methodes APRES commit en base.
 *
 * Room ciblee pour une ligne : `archives` si `row.archived`, sinon
 * `month:<row.month>`. `config.changed` part sur toutes les rooms.
 */
@Injectable()
export class RealtimeEmitter {
  private readonly logger = new Logger(RealtimeEmitter.name);
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  static roomFor(row: { month: string; archived: boolean }): string {
    return row.archived ? 'archives' : `month:${row.month}`;
  }

  emitRowCreated(row: RowDTO): void {
    this.toRoom(RealtimeEmitter.roomFor(row), 'row.created', { row });
  }

  emitRowUpdated(row: RowDTO, changedKeys: string[], byUserId: string): void {
    this.toRoom(RealtimeEmitter.roomFor(row), 'row.updated', { row, changedKeys, byUserId });
  }

  emitRowDeleted(rowId: string, month: string, archived: boolean): void {
    this.toRoom(RealtimeEmitter.roomFor({ month, archived }), 'row.deleted', { rowId });
  }

  /** Diffuse dans la room d arrivee ET dans celle de depart (dedoublonnees). */
  emitRowMoved(row: RowDTO, fromMonth: string): void {
    const rooms = new Set<string>([RealtimeEmitter.roomFor(row), `month:${fromMonth}`]);
    for (const room of rooms) {
      this.toRoom(room, 'row.moved', { row, fromMonth });
    }
  }

  emitConfigChanged(scope: ConfigScope): void {
    if (this.server === null) {
      this.logger.warn('config.changed ignore : serveur Socket.IO non initialise');
      return;
    }
    this.server.emit('config.changed', { scope });
  }

  private toRoom(room: string, event: string, payload: unknown): void {
    if (this.server === null) {
      this.logger.warn(`${event} ignore : serveur Socket.IO non initialise`);
      return;
    }
    this.server.to(room).emit(event, payload);
  }
}
