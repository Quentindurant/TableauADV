import type { Server } from 'socket.io';
import type { RowDTO } from '@suivi/shared';
import { RealtimeEmitter } from './realtime.emitter';

interface Emission {
  room: string | null;
  event: string;
  payload: unknown;
}

function fakeServer(emissions: Emission[]): Server {
  return {
    to(room: string) {
      return {
        emit(event: string, payload: unknown): void {
          emissions.push({ room, event, payload });
        },
      };
    },
    emit(event: string, payload: unknown): void {
      emissions.push({ room: null, event, payload });
    },
  } as unknown as Server;
}

const row: RowDTO = {
  id: 'row-1',
  month: '2026-08',
  position: 1,
  data: { client: 'ARCADIA' },
  formats: {},
  version: 3,
  archived: false,
  updatedAt: '2026-08-10T09:00:00.000Z',
};

describe('RealtimeEmitter', () => {
  let emissions: Emission[];
  let emitter: RealtimeEmitter;

  beforeEach(() => {
    emissions = [];
    emitter = new RealtimeEmitter();
    emitter.setServer(fakeServer(emissions));
  });

  it('cible la room du mois pour une ligne non archivee', () => {
    expect(RealtimeEmitter.roomFor({ month: '2026-08', archived: false })).toBe('month:2026-08');
  });

  it('cible la room archives pour une ligne archivee', () => {
    expect(RealtimeEmitter.roomFor({ month: '2026-08', archived: true })).toBe('archives');
  });

  it('emet row.created dans la room du mois', () => {
    emitter.emitRowCreated(row);
    expect(emissions).toEqual([
      { room: 'month:2026-08', event: 'row.created', payload: { row } },
    ]);
  });

  it('emet row.created dans archives pour une ligne archivee', () => {
    const archivee: RowDTO = { ...row, archived: true };
    emitter.emitRowCreated(archivee);
    expect(emissions[0].room).toBe('archives');
  });

  it('emet row.updated avec changedKeys et byUserId', () => {
    emitter.emitRowUpdated(row, ['client', 'statut'], 'userA');
    expect(emissions).toEqual([
      {
        room: 'month:2026-08',
        event: 'row.updated',
        payload: { row, changedKeys: ['client', 'statut'], byUserId: 'userA' },
      },
    ]);
  });

  it('emet row.deleted dans la room deduite du mois et du drapeau archived', () => {
    emitter.emitRowDeleted('row-1', '2026-08', false);
    emitter.emitRowDeleted('row-2', '2026-08', true);
    expect(emissions).toEqual([
      { room: 'month:2026-08', event: 'row.deleted', payload: { rowId: 'row-1' } },
      { room: 'archives', event: 'row.deleted', payload: { rowId: 'row-2' } },
    ]);
  });

  it('emet row.moved dans la room d arrivee ET dans celle de depart', () => {
    emitter.emitRowMoved(row, '2026-07');
    expect(emissions.map((e) => e.room).sort()).toEqual(['month:2026-07', 'month:2026-08']);
    expect(emissions[0].payload).toEqual({ row, fromMonth: '2026-07' });
  });

  it('n emet row.moved qu une fois quand le mois ne change pas', () => {
    emitter.emitRowMoved(row, '2026-08');
    expect(emissions).toHaveLength(1);
    expect(emissions[0].room).toBe('month:2026-08');
  });

  it('emet config.changed a toutes les rooms (server.emit)', () => {
    emitter.emitConfigChanged('columns');
    emitter.emitConfigChanged('choices');
    emitter.emitConfigChanged('users');
    expect(emissions).toEqual([
      { room: null, event: 'config.changed', payload: { scope: 'columns' } },
      { room: null, event: 'config.changed', payload: { scope: 'choices' } },
      { room: null, event: 'config.changed', payload: { scope: 'users' } },
    ]);
  });

  it('ne jette pas quand le serveur Socket.IO n est pas encore initialise', () => {
    const orphelin = new RealtimeEmitter();
    expect(() => orphelin.emitRowCreated(row)).not.toThrow();
    expect(() => orphelin.emitConfigChanged('columns')).not.toThrow();
  });
});
