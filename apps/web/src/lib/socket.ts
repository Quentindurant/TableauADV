'use client';

import { io, type Socket } from 'socket.io-client';
import type { RowDTO, UserDTO } from '@suivi/shared';

/** Ack du serveur à cell.lock.request (contrats Feature 5). */
export interface LockAck {
  granted: boolean;
  holder?: UserDTO;
}

/** Charges utiles serveur → client, strictement conformes aux contrats. */
export interface ServerEvents {
  presence: { users: (UserDTO & { socketId: string })[] };
  'cell.focus': { userId: string; rowId: string | null; colKey: string | null };
  'cell.lock': { rowId: string; colKey: string; user: UserDTO };
  'cell.unlock': { rowId: string; colKey: string };
  'row.created': { row: RowDTO };
  'row.updated': { row: RowDTO; changedKeys: string[]; byUserId: string };
  'row.deleted': { rowId: string };
  'row.moved': { row: RowDTO; fromMonth: string };
  'config.changed': { scope: 'columns' | 'choices' | 'users' };
}

/** Délai maximal d'attente de l'ack d'un verrou (ms). */
export const LOCK_ACK_TIMEOUT_MS = 3_000;

let socket: Socket | null = null;
let currentRoom: string | null = null;
let hasConnectedOnce = false;
const connectionHandlers = new Set<(connected: boolean) => void>();
const reconnectHandlers = new Set<() => void>();

/**
 * Ouvre (ou réutilise) l'unique connexion Socket.IO.
 * Même hôte que l'API : en production NEXT_PUBLIC_API_URL est vide et le
 * socket tape la même origine, proxyfiée par Apache sur /socket.io.
 */
export function getSocket(): Socket {
  if (socket) {
    return socket;
  }
  const options: Parameters<typeof io>[1] = {
    path: '/socket.io',
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 5_000,
  };
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  socket = baseUrl ? io(baseUrl, options) : io(options);

  socket.on('connect', () => {
    if (currentRoom) {
      socket?.emit('room.join', { room: currentRoom });
    }
    const isReconnect = hasConnectedOnce;
    hasConnectedOnce = true;
    for (const handler of [...connectionHandlers]) {
      handler(true);
    }
    if (isReconnect) {
      for (const handler of [...reconnectHandlers]) {
        handler();
      }
    }
  });

  socket.on('disconnect', () => {
    for (const handler of [...connectionHandlers]) {
      handler(false);
    }
  });

  return socket;
}

/** Mémorise la room de la vue et la rejoint (maintenant ou à la connexion). */
export function joinRoom(room: string): void {
  currentRoom = room;
  const current = getSocket();
  if (current.connected) {
    current.emit('room.join', { room });
  }
}

/** Abonnement typé à un événement serveur ; rend la fonction de désabonnement. */
export function onEvent<E extends keyof ServerEvents>(
  event: E,
  handler: (payload: ServerEvents[E]) => void,
): () => void {
  const current = getSocket();
  const listener = handler as (...args: unknown[]) => void;
  current.on(event as string, listener);
  return () => {
    current.off(event as string, listener);
  };
}

/** Notifie chaque transition connecté (true) / déconnecté (false). */
export function onConnectionChange(handler: (connected: boolean) => void): () => void {
  getSocket();
  connectionHandlers.add(handler);
  return () => {
    connectionHandlers.delete(handler);
  };
}

/** Notifie chaque RE-connexion (jamais la première connexion). */
export function onReconnect(handler: () => void): () => void {
  getSocket();
  reconnectHandlers.add(handler);
  return () => {
    reconnectHandlers.delete(handler);
  };
}

/** Signale la cellule focalisée (ou son abandon) aux collègues de la room. */
export function emitCellFocus(payload: { rowId: string; colKey: string } | { rowId: null }): void {
  const current = getSocket();
  if (current.connected) {
    current.emit('cell.focus', payload);
  }
}

/**
 * Demande le verrou d'une cellule. Toute impossibilité (socket coupé, ack
 * expiré) vaut refus : on ne laisse jamais éditer sans verrou accordé.
 */
export async function requestCellLock(rowId: string, colKey: string): Promise<LockAck> {
  const current = getSocket();
  if (!current.connected) {
    return { granted: false };
  }
  try {
    const ack = (await current
      .timeout(LOCK_ACK_TIMEOUT_MS)
      .emitWithAck('cell.lock.request', { rowId, colKey })) as LockAck;
    return ack;
  } catch {
    return { granted: false };
  }
}

/** Libère le verrou d'une cellule (fin d'édition, annulation). */
export function releaseCellLock(rowId: string, colKey: string): void {
  const current = getSocket();
  if (current.connected) {
    current.emit('cell.lock.release', { rowId, colKey });
  }
}

/** Ferme la connexion (déconnexion applicative / logout). */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  currentRoom = null;
  hasConnectedOnce = false;
}

/** Réinitialise l'état de module — usage strictement réservé aux tests. */
export function __resetSocketForTests(): void {
  socket = null;
  currentRoom = null;
  hasConnectedOnce = false;
  connectionHandlers.clear();
  reconnectHandlers.clear();
}
