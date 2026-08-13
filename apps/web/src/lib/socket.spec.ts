import { beforeEach, describe, expect, it, vi } from 'vitest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import {
  __resetSocketForTests,
  emitCellFocus,
  getSocket,
  joinRoom,
  onConnectionChange,
  onEvent,
  onReconnect,
  releaseCellLock,
  requestCellLock,
} from './socket';

vi.mock('socket.io-client');

type Handler = (...args: unknown[]) => void;

function createFakeSocket() {
  const handlers = new Map<string, Handler[]>();
  const emitWithAck = vi.fn().mockResolvedValue({ granted: true });
  const fake = {
    connected: false,
    emit: vi.fn(),
    emitWithAck,
    timeout: vi.fn(() => ({ emitWithAck })),
    disconnect: vi.fn(),
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return fake;
    }),
    off: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, (handlers.get(event) ?? []).filter((h) => h !== handler));
      return fake;
    }),
    trigger(event: string, ...args: unknown[]) {
      for (const handler of [...(handlers.get(event) ?? [])]) {
        handler(...args);
      }
    },
  };
  return fake;
}

let fakeSocket: ReturnType<typeof createFakeSocket>;

beforeEach(() => {
  __resetSocketForTests();
  fakeSocket = createFakeSocket();
  vi.mocked(io).mockReturnValue(fakeSocket as unknown as Socket);
});

describe('getSocket', () => {
  it('ouvre une seule connexion, path /socket.io et withCredentials', () => {
    const first = getSocket();
    const second = getSocket();
    expect(first).toBe(second);
    expect(io).toHaveBeenCalledTimes(1);
    const options = vi.mocked(io).mock.calls[0].at(-1) as Record<string, unknown>;
    expect(options).toMatchObject({
      path: '/socket.io',
      withCredentials: true,
      reconnection: true,
    });
  });
});

describe('joinRoom', () => {
  it("n'émet rien tant que le socket n'est pas connecté, puis rejoint à la connexion", () => {
    joinRoom('month:2026-08');
    expect(fakeSocket.emit).not.toHaveBeenCalledWith('room.join', expect.anything());

    fakeSocket.connected = true;
    fakeSocket.trigger('connect');
    expect(fakeSocket.emit).toHaveBeenCalledWith('room.join', { room: 'month:2026-08' });
  });

  it('émet immédiatement quand le socket est déjà connecté', () => {
    getSocket();
    fakeSocket.connected = true;
    joinRoom('archives');
    expect(fakeSocket.emit).toHaveBeenCalledWith('room.join', { room: 'archives' });
  });

  it('re-rejoint automatiquement la dernière room à chaque reconnexion', () => {
    joinRoom('month:2026-08');
    fakeSocket.connected = true;
    fakeSocket.trigger('connect');
    fakeSocket.connected = false;
    fakeSocket.trigger('disconnect', 'transport close');
    fakeSocket.emit.mockClear();
    fakeSocket.connected = true;
    fakeSocket.trigger('connect');
    expect(fakeSocket.emit).toHaveBeenCalledWith('room.join', { room: 'month:2026-08' });
  });
});

describe('onConnectionChange / onReconnect', () => {
  it('signale les transitions connecté / déconnecté', () => {
    const seen: boolean[] = [];
    const off = onConnectionChange((connected) => seen.push(connected));
    fakeSocket.trigger('connect');
    fakeSocket.trigger('disconnect', 'transport close');
    fakeSocket.trigger('connect');
    expect(seen).toEqual([true, false, true]);
    off();
    fakeSocket.trigger('disconnect', 'transport close');
    expect(seen).toEqual([true, false, true]);
  });

  it('ne déclenche onReconnect qu’à partir de la DEUXIÈME connexion', () => {
    const handler = vi.fn();
    onReconnect(handler);
    fakeSocket.trigger('connect');
    expect(handler).not.toHaveBeenCalled();
    fakeSocket.trigger('disconnect', 'transport close');
    fakeSocket.trigger('connect');
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('onEvent', () => {
  it('abonne un handler typé et rend une fonction de désabonnement', () => {
    const handler = vi.fn();
    const off = onEvent('row.updated', handler);
    fakeSocket.trigger('row.updated', { row: { id: 'r1' }, changedKeys: ['client'], byUserId: 'u1' });
    expect(handler).toHaveBeenCalledWith({
      row: { id: 'r1' },
      changedKeys: ['client'],
      byUserId: 'u1',
    });
    off();
    fakeSocket.trigger('row.updated', { row: { id: 'r2' }, changedKeys: [], byUserId: 'u1' });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('cell.focus et verrous', () => {
  it('émet cell.focus avec la cellule pointée puis le blur', () => {
    getSocket();
    fakeSocket.connected = true;
    emitCellFocus({ rowId: 'r1', colKey: 'client' });
    emitCellFocus({ rowId: null });
    expect(fakeSocket.emit).toHaveBeenCalledWith('cell.focus', { rowId: 'r1', colKey: 'client' });
    expect(fakeSocket.emit).toHaveBeenCalledWith('cell.focus', { rowId: null });
  });

  it('demande un verrou et rend l’ack du serveur', async () => {
    getSocket();
    fakeSocket.connected = true;
    const holder = { id: 'u2', email: 'b@test.fr', displayName: 'Bob', cursorColor: '#00FF00' };
    fakeSocket.emitWithAck.mockResolvedValueOnce({ granted: false, holder });
    await expect(requestCellLock('r1', 'client')).resolves.toEqual({ granted: false, holder });
    expect(fakeSocket.emitWithAck).toHaveBeenCalledWith('cell.lock.request', {
      rowId: 'r1',
      colKey: 'client',
    });
  });

  it('refuse le verrou (granted: false) si le socket est déconnecté', async () => {
    getSocket();
    fakeSocket.connected = false;
    await expect(requestCellLock('r1', 'client')).resolves.toEqual({ granted: false });
    expect(fakeSocket.emitWithAck).not.toHaveBeenCalled();
  });

  it('refuse le verrou quand l’ack expire (timeout serveur)', async () => {
    getSocket();
    fakeSocket.connected = true;
    fakeSocket.emitWithAck.mockRejectedValueOnce(new Error('operation has timed out'));
    await expect(requestCellLock('r1', 'client')).resolves.toEqual({ granted: false });
  });

  it('libère le verrou', () => {
    getSocket();
    fakeSocket.connected = true;
    releaseCellLock('r1', 'client');
    expect(fakeSocket.emit).toHaveBeenCalledWith('cell.lock.release', {
      rowId: 'r1',
      colKey: 'client',
    });
  });
});
