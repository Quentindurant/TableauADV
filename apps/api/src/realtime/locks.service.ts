import { Injectable } from '@nestjs/common';

/** Duree de vie d un verrou de cellule (contrat : 30 s, renouvelable). */
export const LOCK_TTL_MS = 30_000;

export interface Lock {
  rowId: string;
  colKey: string;
  userId: string;
  socketId: string;
  /** Room Socket.IO dans laquelle diffuser `cell.lock` / `cell.unlock`. */
  room: string;
  expiresAt: number;
}

export interface AcquireInput {
  rowId: string;
  colKey: string;
  userId: string;
  socketId: string;
  room: string;
}

export interface AcquireResult {
  granted: boolean;
  holderUserId?: string;
}

/**
 * Verrous de cellule en memoire du process API (un seul process : pas de Redis).
 * Cle : `${rowId}:${colKey}`.
 */
@Injectable()
export class LocksService {
  private readonly locks = new Map<string, Lock>();

  static key(rowId: string, colKey: string): string {
    return `${rowId}:${colKey}`;
  }

  /**
   * Accorde le verrou si la cellule est libre, expiree, ou deja detenue par
   * le meme socket (renouvellement pendant la frappe). Sinon refus + detenteur.
   */
  acquire(input: AcquireInput, now: number = Date.now()): AcquireResult {
    const key = LocksService.key(input.rowId, input.colKey);
    const current = this.locks.get(key);
    if (current && current.socketId !== input.socketId && current.expiresAt > now) {
      return { granted: false, holderUserId: current.userId };
    }
    this.locks.set(key, { ...input, expiresAt: now + LOCK_TTL_MS });
    return { granted: true };
  }

  /** Libere le verrou uniquement si le socket demandeur en est le detenteur. */
  release(input: { rowId: string; colKey: string; socketId: string }): Lock | null {
    const key = LocksService.key(input.rowId, input.colKey);
    const current = this.locks.get(key);
    if (!current || current.socketId !== input.socketId) {
      return null;
    }
    this.locks.delete(key);
    return current;
  }

  /** Libere tous les verrous d un socket (deconnexion) et les retourne. */
  releaseAllForSocket(socketId: string): Lock[] {
    const released: Lock[] = [];
    for (const [key, lock] of this.locks) {
      if (lock.socketId === socketId) {
        released.push(lock);
        this.locks.delete(key);
      }
    }
    return released;
  }

  /** Retire les verrous expires et les retourne (balayage periodique). */
  sweep(now: number = Date.now()): Lock[] {
    const expired: Lock[] = [];
    for (const [key, lock] of this.locks) {
      if (lock.expiresAt <= now) {
        expired.push(lock);
        this.locks.delete(key);
      }
    }
    return expired;
  }

  peek(rowId: string, colKey: string): Lock | null {
    return this.locks.get(LocksService.key(rowId, colKey)) ?? null;
  }

  size(): number {
    return this.locks.size;
  }
}
