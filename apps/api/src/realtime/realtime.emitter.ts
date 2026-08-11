import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Point d emission unique des evenements serveur -> clients.
 * La passerelle lui injecte le serveur Socket.IO dans `afterInit` ; les
 * services REST (rows, columns, choices, users) l injectent et appellent ses
 * methodes APRES commit en base. Les emissions arrivent en Task 5.6.
 */
@Injectable()
export class RealtimeEmitter {
  protected readonly logger = new Logger(RealtimeEmitter.name);
  protected server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }
}
