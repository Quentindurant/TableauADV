import { Injectable } from '@nestjs/common';
import type { UserDTO } from '@suivi/shared';

export interface PresenceEntry {
  socketId: string;
  /** `null` tant que le socket n a pas fait `room.join`. */
  room: string | null;
  user: UserDTO;
}

/**
 * Annuaire en memoire des sockets authentifies et de leur room courante.
 * Un meme utilisateur peut avoir plusieurs sockets (plusieurs onglets).
 */
@Injectable()
export class PresenceService {
  private readonly sockets = new Map<string, PresenceEntry>();

  add(socketId: string, user: UserDTO): void {
    this.sockets.set(socketId, { socketId, room: null, user });
  }

  remove(socketId: string): PresenceEntry | null {
    const entry = this.sockets.get(socketId) ?? null;
    this.sockets.delete(socketId);
    return entry;
  }

  setRoom(socketId: string, room: string | null): void {
    const entry = this.sockets.get(socketId);
    if (entry) {
      entry.room = room;
    }
  }

  getRoom(socketId: string): string | null {
    return this.sockets.get(socketId)?.room ?? null;
  }

  getUser(socketId: string): UserDTO | null {
    return this.sockets.get(socketId)?.user ?? null;
  }

  findUserById(userId: string): UserDTO | undefined {
    for (const entry of this.sockets.values()) {
      if (entry.user.id === userId) {
        return entry.user;
      }
    }
    return undefined;
  }

  /** Liste de presence de la room, au format contractuel `UserDTO & {socketId}`. */
  listRoom(room: string): (UserDTO & { socketId: string })[] {
    const users: (UserDTO & { socketId: string })[] = [];
    for (const entry of this.sockets.values()) {
      if (entry.room === room) {
        users.push({ ...entry.user, socketId: entry.socketId });
      }
    }
    return users;
  }

  size(): number {
    return this.sockets.size;
  }
}
