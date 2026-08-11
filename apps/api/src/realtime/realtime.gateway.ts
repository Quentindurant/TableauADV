import { Logger, type OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { UserDTO } from '@suivi/shared';
import { tokenFromHandshake, type WsJwtPayload } from '../auth/ws-jwt.util';
import { PrismaService } from '../prisma/prisma.service';
import { LocksService } from './locks.service';
import { PresenceService } from './presence.service';
import { RealtimeEmitter } from './realtime.emitter';

/** Rooms autorisees par les contrats : `archives` ou `month:YYYY-MM`. */
const ROOM_PATTERN = /^(archives|month:\d{4}-\d{2})$/;

/** Periode de balayage des verrous expires. */
export const SWEEP_INTERVAL_MS = 5_000;

// CORS aligné sur l'API HTTP (app.setup.ts) : même origine autorisée, credentials
// (cookie httpOnly `token`) inclus. Pas de wildcard "origin: true".
@WebSocketGateway({
  path: '/socket.io',
  cors: { origin: process.env.APP_URL ?? 'http://localhost:3000', credentials: true },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly locks: LocksService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  afterInit(server: Server): void {
    this.emitter.setServer(server);

    // Authentification AVANT l evenement `connection` : un socket non
    // authentifie ne rejoint jamais la passerelle (connect_error cote client).
    server.use((socket, next) => {
      void this.authenticate(socket)
        .then((user) => {
          if (user === null) {
            next(new Error('AUTH_REQUIRED'));
            return;
          }
          socket.data.user = user;
          next();
        })
        .catch(() => next(new Error('AUTH_REQUIRED')));
    });

    this.sweepTimer = setInterval(() => this.sweepExpiredLocks(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer !== null) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Verifie le cookie `token` du handshake et recharge l utilisateur. */
  private async authenticate(socket: Socket): Promise<UserDTO | null> {
    const token = tokenFromHandshake(socket.handshake);
    if (token === null) {
      return null;
    }
    let payload: WsJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<WsJwtPayload>(token);
    } catch {
      return null;
    }
    if (typeof payload?.sub !== 'string' || payload.sub.length === 0) {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, displayName: true, cursorColor: true },
    });
    return user ?? null;
  }

  handleConnection(client: Socket): void {
    const user = client.data.user as UserDTO | undefined;
    if (user === undefined) {
      client.disconnect(true);
      return;
    }
    this.presence.add(client.id, user);
  }

  handleDisconnect(client: Socket): void {
    for (const lock of this.locks.releaseAllForSocket(client.id)) {
      this.server.to(lock.room).emit('cell.unlock', { rowId: lock.rowId, colKey: lock.colKey });
    }
    const entry = this.presence.remove(client.id);
    if (entry !== null && entry.room !== null) {
      this.emitPresence(entry.room);
    }
  }

  @SubscribeMessage('room.join')
  async handleRoomJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { room?: unknown },
  ): Promise<void> {
    const room = typeof body?.room === 'string' ? body.room : '';
    if (!ROOM_PATTERN.test(room)) {
      this.logger.warn(`room.join refuse : room "${room}" hors contrat`);
      return;
    }
    const previous = this.presence.getRoom(client.id);
    if (previous === room) {
      this.emitPresence(room);
      return;
    }
    if (previous !== null) {
      await client.leave(previous);
    }
    await client.join(room);
    this.presence.setRoom(client.id, room);
    if (previous !== null) {
      this.emitPresence(previous);
    }
    this.emitPresence(room);
  }

  @SubscribeMessage('cell.focus')
  handleCellFocus(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { rowId?: unknown; colKey?: unknown },
  ): void {
    const user = client.data.user as UserDTO | undefined;
    const room = this.presence.getRoom(client.id);
    if (user === undefined || room === null) {
      return;
    }
    const rowId = typeof body?.rowId === 'string' ? body.rowId : null;
    const colKey = typeof body?.colKey === 'string' ? body.colKey : null;
    client.to(room).emit('cell.focus', {
      userId: user.id,
      rowId,
      colKey: rowId === null ? null : colKey,
    });
  }

  /** Balaye les verrous expires et previent les rooms concernees. */
  sweepExpiredLocks(now: number = Date.now()): void {
    for (const lock of this.locks.sweep(now)) {
      this.server.to(lock.room).emit('cell.unlock', { rowId: lock.rowId, colKey: lock.colKey });
    }
  }

  private emitPresence(room: string): void {
    this.server.to(room).emit('presence', { users: this.presence.listRoom(room) });
  }
}
