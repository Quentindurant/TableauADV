import type { AddressInfo } from 'net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { io, type Socket } from 'socket.io-client';
import type { UserDTO } from '@suivi/shared';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { LOCK_TTL_MS } from '../src/realtime/locks.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';

jest.setTimeout(30_000);

interface PresencePayload {
  users: (UserDTO & { socketId: string })[];
}

describe('Realtime (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let cookieAlice: string;
  let cookieBob: string;
  let alice: UserDTO;
  let bob: UserDTO;
  const opened: Socket[] = [];

  /** Connecte un client socket.io ; rejette sur `connect_error`. */
  function connect(cookie: string | null): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(baseUrl, {
        path: '/socket.io',
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        extraHeaders: cookie === null ? {} : { Cookie: cookie },
      });
      opened.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err: Error) => reject(err));
    });
  }

  /** Attend le prochain evenement `event` sur `socket`. */
  function once<T>(socket: Socket, event: string, timeoutMs = 5_000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Aucun evenement "${event}" recu en ${timeoutMs} ms`)),
        timeoutMs,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  /** Petite attente pour laisser le serveur traiter un message sans ack. */
  function settle(ms = 150): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Envoie un message avec callback d ack (acknowledgement). */
  function ask<T>(socket: Socket, event: string, payload: unknown, timeoutMs = 5_000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Aucun ack pour "${event}" en ${timeoutMs} ms`)),
        timeoutMs,
      );
      socket.emit(event, payload, (response: T) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const setCookie = res.get('Set-Cookie') as unknown as string[];
    return setCookie[0].split(';')[0];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = setupApp(moduleRef.createNestApplication());
    await app.listen(0);
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.rowEvent.deleteMany();
    await prisma.row.deleteMany();
    await prisma.choice.deleteMany();
    await prisma.column.deleteMany();
    await prisma.user.deleteMany();

    const hash = await argon2.hash('motdepasse');
    const createdAlice = await prisma.user.create({
      data: {
        email: 'alice@suivi.local',
        passwordHash: hash,
        displayName: 'Alice',
        cursorColor: '#FF0000',
      },
    });
    const createdBob = await prisma.user.create({
      data: {
        email: 'bob@suivi.local',
        passwordHash: hash,
        displayName: 'Bob',
        cursorColor: '#0000FF',
      },
    });
    alice = {
      id: createdAlice.id,
      email: createdAlice.email,
      displayName: createdAlice.displayName,
      cursorColor: createdAlice.cursorColor,
    };
    bob = {
      id: createdBob.id,
      email: createdBob.email,
      displayName: createdBob.displayName,
      cursorColor: createdBob.cursorColor,
    };
    cookieAlice = await login('alice@suivi.local', 'motdepasse');
    cookieBob = await login('bob@suivi.local', 'motdepasse');
  });

  afterEach(() => {
    while (opened.length > 0) {
      const socket = opened.pop();
      socket?.removeAllListeners();
      socket?.disconnect();
    }
  });

  describe('handshake', () => {
    it('refuse la connexion sans cookie (AUTH_REQUIRED)', async () => {
      await expect(connect(null)).rejects.toThrow('AUTH_REQUIRED');
    });

    it('refuse la connexion avec un cookie token invalide (AUTH_REQUIRED)', async () => {
      await expect(connect('token=pas.un.jwt')).rejects.toThrow('AUTH_REQUIRED');
    });

    it('accepte la connexion avec le cookie pose par POST /api/auth/login', async () => {
      const socket = await connect(cookieAlice);
      expect(socket.connected).toBe(true);
    });
  });

  describe('room.join et presence', () => {
    it('diffuse la presence a deux quand un second utilisateur rejoint la room', async () => {
      const socketA = await connect(cookieAlice);
      socketA.emit('room.join', { room: 'month:2026-08' });
      const seul = await once<PresencePayload>(socketA, 'presence');
      expect(seul.users).toHaveLength(1);
      expect(seul.users[0]).toMatchObject({
        id: alice.id,
        displayName: 'Alice',
        cursorColor: '#FF0000',
      });
      expect(typeof seul.users[0].socketId).toBe('string');

      const socketB = await connect(cookieBob);
      const aDeux = once<PresencePayload>(socketA, 'presence');
      socketB.emit('room.join', { room: 'month:2026-08' });

      const payload = await aDeux;
      expect(payload.users).toHaveLength(2);
      expect(payload.users.map((u) => u.displayName).sort()).toEqual(['Alice', 'Bob']);
    });

    it('isole les rooms : un socket dans archives n apparait pas dans month:2026-08', async () => {
      const socketA = await connect(cookieAlice);
      socketA.emit('room.join', { room: 'month:2026-08' });
      await once<PresencePayload>(socketA, 'presence');

      const socketB = await connect(cookieBob);
      socketB.emit('room.join', { room: 'archives' });
      const presenceB = await once<PresencePayload>(socketB, 'presence');

      expect(presenceB.users).toHaveLength(1);
      expect(presenceB.users[0].displayName).toBe('Bob');
    });

    it('met a jour la presence de l ancienne room quand on change de room', async () => {
      const socketA = await connect(cookieAlice);
      socketA.emit('room.join', { room: 'month:2026-08' });
      await once<PresencePayload>(socketA, 'presence');

      const socketB = await connect(cookieBob);
      const aDeux = once<PresencePayload>(socketA, 'presence');
      socketB.emit('room.join', { room: 'month:2026-08' });
      await aDeux;

      const apresDepart = once<PresencePayload>(socketA, 'presence');
      socketB.emit('room.join', { room: 'archives' });
      const payload = await apresDepart;
      expect(payload.users).toHaveLength(1);
      expect(payload.users[0].displayName).toBe('Alice');
    });

    it('refuse une room hors contrat (ni archives ni month:YYYY-MM)', async () => {
      const socketA = await connect(cookieAlice);
      socketA.emit('room.join', { room: 'n-importe-quoi' });
      await settle();

      socketA.emit('room.join', { room: 'month:2026-08' });
      const payload = await once<PresencePayload>(socketA, 'presence');
      expect(payload.users).toHaveLength(1);
    });
  });

  describe('cell.focus', () => {
    it('relaie le focus d un collegue aux autres membres de la room', async () => {
      const socketA = await connect(cookieAlice);
      socketA.emit('room.join', { room: 'month:2026-08' });
      await once<PresencePayload>(socketA, 'presence');

      const socketB = await connect(cookieBob);
      const aDeux = once<PresencePayload>(socketA, 'presence');
      socketB.emit('room.join', { room: 'month:2026-08' });
      await aDeux;

      const focus = once<{ userId: string; rowId: string | null; colKey: string | null }>(
        socketA,
        'cell.focus',
      );
      socketB.emit('cell.focus', { rowId: 'row-1', colKey: 'client' });

      expect(await focus).toEqual({ userId: bob.id, rowId: 'row-1', colKey: 'client' });
    });

    it('relaie la perte de focus (rowId null)', async () => {
      const socketA = await connect(cookieAlice);
      socketA.emit('room.join', { room: 'month:2026-08' });
      await once<PresencePayload>(socketA, 'presence');

      const socketB = await connect(cookieBob);
      const aDeux = once<PresencePayload>(socketA, 'presence');
      socketB.emit('room.join', { room: 'month:2026-08' });
      await aDeux;

      const focus = once<{ userId: string; rowId: string | null; colKey: string | null }>(
        socketA,
        'cell.focus',
      );
      socketB.emit('cell.focus', { rowId: null });

      expect(await focus).toEqual({ userId: bob.id, rowId: null, colKey: null });
    });
  });

  describe('verrous de cellule', () => {
    interface LockAck {
      granted: boolean;
      holder?: UserDTO;
    }

    async function deuxClientsDansLaMemeRoom(): Promise<[Socket, Socket]> {
      const socketA = await connect(cookieAlice);
      socketA.emit('room.join', { room: 'month:2026-08' });
      await once<PresencePayload>(socketA, 'presence');

      const socketB = await connect(cookieBob);
      const aDeux = once<PresencePayload>(socketA, 'presence');
      socketB.emit('room.join', { room: 'month:2026-08' });
      await aDeux;

      return [socketA, socketB];
    }

    it('accorde le verrou au premier demandeur et diffuse cell.lock a la room', async () => {
      const [socketA, socketB] = await deuxClientsDansLaMemeRoom();

      const diffusion = once<{ rowId: string; colKey: string; user: UserDTO }>(
        socketB,
        'cell.lock',
      );
      const ack = await ask<LockAck>(socketA, 'cell.lock.request', {
        rowId: 'row-1',
        colKey: 'client',
      });

      expect(ack).toEqual({ granted: true });
      expect(await diffusion).toEqual({
        rowId: 'row-1',
        colKey: 'client',
        user: alice,
      });
    });

    it('refuse le verrou a l autre utilisateur et renvoie le detenteur', async () => {
      const [socketA, socketB] = await deuxClientsDansLaMemeRoom();

      await ask<LockAck>(socketA, 'cell.lock.request', { rowId: 'row-1', colKey: 'client' });
      const refus = await ask<LockAck>(socketB, 'cell.lock.request', {
        rowId: 'row-1',
        colKey: 'client',
      });

      expect(refus.granted).toBe(false);
      expect(refus.holder).toEqual(alice);
    });

    it('accorde une autre cellule de la meme ligne au second utilisateur', async () => {
      const [socketA, socketB] = await deuxClientsDansLaMemeRoom();

      await ask<LockAck>(socketA, 'cell.lock.request', { rowId: 'row-1', colKey: 'client' });
      const ack = await ask<LockAck>(socketB, 'cell.lock.request', {
        rowId: 'row-1',
        colKey: 'statut',
      });

      expect(ack).toEqual({ granted: true });
    });

    it('libere le verrou sur cell.lock.release et diffuse cell.unlock', async () => {
      const [socketA, socketB] = await deuxClientsDansLaMemeRoom();

      await ask<LockAck>(socketA, 'cell.lock.request', { rowId: 'row-1', colKey: 'client' });
      const unlock = once<{ rowId: string; colKey: string }>(socketB, 'cell.unlock');
      socketA.emit('cell.lock.release', { rowId: 'row-1', colKey: 'client' });

      expect(await unlock).toEqual({ rowId: 'row-1', colKey: 'client' });

      const ack = await ask<LockAck>(socketB, 'cell.lock.request', {
        rowId: 'row-1',
        colKey: 'client',
      });
      expect(ack).toEqual({ granted: true });
    });

    it('ignore une liberation demandee par un autre socket que le detenteur', async () => {
      const [socketA, socketB] = await deuxClientsDansLaMemeRoom();

      await ask<LockAck>(socketA, 'cell.lock.request', { rowId: 'row-1', colKey: 'client' });
      socketB.emit('cell.lock.release', { rowId: 'row-1', colKey: 'client' });
      await settle();

      const refus = await ask<LockAck>(socketB, 'cell.lock.request', {
        rowId: 'row-1',
        colKey: 'client',
      });
      expect(refus.granted).toBe(false);
      expect(refus.holder).toEqual(alice);
    });

    it('libere les verrous du socket a la deconnexion et diffuse cell.unlock', async () => {
      const [socketA, socketB] = await deuxClientsDansLaMemeRoom();

      await ask<LockAck>(socketA, 'cell.lock.request', { rowId: 'row-1', colKey: 'client' });
      const unlock = once<{ rowId: string; colKey: string }>(socketB, 'cell.unlock');
      socketA.disconnect();

      expect(await unlock).toEqual({ rowId: 'row-1', colKey: 'client' });

      const ack = await ask<LockAck>(socketB, 'cell.lock.request', {
        rowId: 'row-1',
        colKey: 'client',
      });
      expect(ack).toEqual({ granted: true });
    });

    it('balaie les verrous expires et diffuse cell.unlock', async () => {
      const [socketA, socketB] = await deuxClientsDansLaMemeRoom();

      await ask<LockAck>(socketA, 'cell.lock.request', { rowId: 'row-1', colKey: 'client' });
      const unlock = once<{ rowId: string; colKey: string }>(socketB, 'cell.unlock');

      app.get(RealtimeGateway).sweepExpiredLocks(Date.now() + LOCK_TTL_MS + 1);

      expect(await unlock).toEqual({ rowId: 'row-1', colKey: 'client' });
    });

    it('renouvelle le verrou du meme socket sans le perdre', async () => {
      const [socketA, socketB] = await deuxClientsDansLaMemeRoom();

      await ask<LockAck>(socketA, 'cell.lock.request', { rowId: 'row-1', colKey: 'client' });
      const renouvellement = await ask<LockAck>(socketA, 'cell.lock.request', {
        rowId: 'row-1',
        colKey: 'client',
      });
      expect(renouvellement).toEqual({ granted: true });

      const refus = await ask<LockAck>(socketB, 'cell.lock.request', {
        rowId: 'row-1',
        colKey: 'client',
      });
      expect(refus.granted).toBe(false);
    });
  });
});
