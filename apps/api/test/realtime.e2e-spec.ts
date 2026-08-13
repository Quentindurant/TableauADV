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

  /**
   * Collecte les `count` prochaines occurrences de `event` (contrairement à
   * `once`, l'écouteur est posé AVANT le déclenchement de l'action et
   * n'en rate donc aucune même si plusieurs partent dans le même tick).
   */
  function several<T>(socket: Socket, event: string, count: number, timeoutMs = 5_000): Promise<T[]> {
    return new Promise<T[]>((resolve, reject) => {
      const results: T[] = [];
      const timer = setTimeout(
        () =>
          reject(
            new Error(`Seulement ${results.length}/${count} "${event}" reçu(s) en ${timeoutMs} ms`),
          ),
        timeoutMs,
      );
      function handler(payload: T): void {
        results.push(payload);
        if (results.length === count) {
          clearTimeout(timer);
          socket.off(event, handler);
          resolve(results);
        }
      }
      socket.on(event, handler);
    });
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

  describe('diffusion des mutations REST', () => {
    interface RowPayload {
      row: { id: string; month: string; version: number; data: Record<string, unknown> };
      changedKeys: string[];
      byUserId: string;
    }

    async function clientDansLaRoom(room: string): Promise<Socket> {
      const socket = await connect(cookieBob);
      socket.emit('room.join', { room });
      await once<PresencePayload>(socket, 'presence');
      return socket;
    }

    it('diffuse row.updated dans la room du mois apres un PATCH /api/rows/:id', async () => {
      const created = await prisma.row.create({
        data: { month: '2026-08', position: 1, data: { client: 'ARCADIA' }, formats: {} },
      });
      const socketB = await clientDansLaRoom('month:2026-08');

      const recu = once<RowPayload>(socketB, 'row.updated');
      await request(app.getHttpServer())
        .patch(`/api/rows/${created.id}`)
        .set('Cookie', cookieAlice)
        .send({ expectedVersion: created.version, patch: { client: 'BETA SARL' } })
        .expect(200);

      const payload = await recu;
      expect(payload.row.id).toBe(created.id);
      expect(payload.row.data.client).toBe('BETA SARL');
      expect(payload.row.version).toBe(created.version + 1);
      expect(payload.changedKeys).toEqual(['client']);
      expect(payload.byUserId).toBe(alice.id);
    });

    it('diffuse row.created dans la room du mois apres un POST /api/rows', async () => {
      const socketB = await clientDansLaRoom('month:2026-09');

      const recu = once<{ row: { month: string } }>(socketB, 'row.created');
      await request(app.getHttpServer())
        .post('/api/rows')
        .set('Cookie', cookieAlice)
        .send({ month: '2026-09' })
        .expect(201);

      expect((await recu).row.month).toBe('2026-09');
    });

    it('diffuse row.deleted dans la room du mois apres un DELETE /api/rows/:id', async () => {
      const created = await prisma.row.create({
        data: { month: '2026-08', position: 1, data: {}, formats: {} },
      });
      const socketB = await clientDansLaRoom('month:2026-08');

      const recu = once<{ rowId: string }>(socketB, 'row.deleted');
      await request(app.getHttpServer())
        .delete(`/api/rows/${created.id}`)
        .set('Cookie', cookieAlice)
        .expect(204);

      expect(await recu).toEqual({ rowId: created.id });
    });

    it('diffuse row.moved dans la room de depart apres un POST /api/rows/:id/move', async () => {
      const created = await prisma.row.create({
        data: { month: '2026-08', position: 1, data: {}, formats: {} },
      });
      const socketB = await clientDansLaRoom('month:2026-08');

      const recu = once<{ row: { month: string }; fromMonth: string }>(socketB, 'row.moved');
      await request(app.getHttpServer())
        .post(`/api/rows/${created.id}/move`)
        .set('Cookie', cookieAlice)
        .send({ month: '2026-09' })
        .expect(200);

      const payload = await recu;
      expect(payload.fromMonth).toBe('2026-08');
      expect(payload.row.month).toBe('2026-09');
    });

    it('diffuse row.deleted puis row.created lors d un archivage', async () => {
      const created = await prisma.row.create({
        data: { month: '2026-08', position: 1, data: {}, formats: {} },
      });
      const socketMois = await clientDansLaRoom('month:2026-08');
      const socketArchives = await connect(cookieAlice);
      socketArchives.emit('room.join', { room: 'archives' });
      await once<PresencePayload>(socketArchives, 'presence');

      const disparition = once<{ rowId: string }>(socketMois, 'row.deleted');
      const apparition = once<{ row: { id: string; archived: boolean } }>(
        socketArchives,
        'row.created',
      );
      await request(app.getHttpServer())
        .post(`/api/rows/${created.id}/archive`)
        .set('Cookie', cookieAlice)
        .send({ archived: true })
        .expect(200);

      expect(await disparition).toEqual({ rowId: created.id });
      expect((await apparition).row.archived).toBe(true);
    });

    it('utilise la bonne room lors d un archivage no-op (idempotent)', async () => {
      // Crée et archive une ligne
      const created = await prisma.row.create({
        data: { month: '2026-08', position: 1, data: {}, formats: {} },
      });
      await request(app.getHttpServer())
        .post(`/api/rows/${created.id}/archive`)
        .set('Cookie', cookieAlice)
        .send({ archived: true })
        .expect(200);

      // Prépare les sockets : une dans archives, une dans le mois
      const socketArchives = await connect(cookieAlice);
      socketArchives.emit('room.join', { room: 'archives' });
      await once<PresencePayload>(socketArchives, 'presence');

      const socketMois = await clientDansLaRoom('month:2026-08');

      // Essaie d'archiver à nouveau (no-op : la ligne est déjà archivée)
      // Les événements devraient partir à la room archives, pas à month:2026-08
      const deletedInArchives = once<{ rowId: string }>(socketArchives, 'row.deleted', 1000);
      const deletedInMonth = once<{ rowId: string }>(socketMois, 'row.deleted', 1000);

      await request(app.getHttpServer())
        .post(`/api/rows/${created.id}/archive`)
        .set('Cookie', cookieAlice)
        .send({ archived: true })
        .expect(200);

      // Vérifie que row.deleted arrive BIEN dans la room archives
      expect(await deletedInArchives).toEqual({ rowId: created.id });

      // Vérifie qu'aucun événement n'arrive dans la room du mois
      await expect(deletedInMonth).rejects.toThrow(
        new RegExp('Aucun evenement.*recu en 1000 ms'),
      );
    });

    it('diffuse config.changed a toutes les rooms apres POST /api/columns', async () => {
      const socketB = await clientDansLaRoom('archives');

      const recu = once<{ scope: string }>(socketB, 'config.changed');
      await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookieAlice)
        .send({ label: 'CLIENT', type: 'TEXT' })
        .expect(201);

      expect(await recu).toEqual({ scope: 'columns' });
    });

    it('diffuse config.changed scope choices apres POST /api/columns/:id/choices', async () => {
      const column = await prisma.column.create({
        data: { key: 'statut', label: 'INSTALLATION', type: 'SELECT', position: 1 },
      });
      const socketB = await clientDansLaRoom('month:2026-08');

      const recu = once<{ scope: string }>(socketB, 'config.changed');
      await request(app.getHttpServer())
        .post(`/api/columns/${column.id}/choices`)
        .set('Cookie', cookieAlice)
        .send({ label: 'NEW', bgColor: '#FFFF00', textColor: '#FF0000', bold: true })
        .expect(201);

      expect(await recu).toEqual({ scope: 'choices' });
    });

    it('diffuse config.changed scope users apres POST /api/users', async () => {
      const socketB = await clientDansLaRoom('month:2026-08');

      const recu = once<{ scope: string }>(socketB, 'config.changed');
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Cookie', cookieAlice)
        .send({
          email: 'carole@suivi.local',
          displayName: 'Carole',
          password: 'motdepasse',
          cursorColor: '#00AA00',
        })
        .expect(201);

      expect(await recu).toEqual({ scope: 'users' });
    });

    // R2 : une renumérotation (create/move/archive/remove) déplace d'autres
    // lignes que celle qui agit ; ces lignes doivent aussi être diffusées
    // (sinon les collègues gardent un ordre périmé jusqu'au prochain reload).
    describe('diffusion des lignes renumérotées (autres que la ligne agissante)', () => {
      interface RenumberedPayload {
        row: { id: string; position: number };
        changedKeys: string[];
        byUserId: string;
      }

      it('diffuse row.updated pour les lignes déplacées par un POST /api/rows/:id/move dans le même mois', async () => {
        const a = await prisma.row.create({
          data: { month: '2026-08', position: 0, data: { client: 'A' }, formats: {} },
        });
        const b = await prisma.row.create({
          data: { month: '2026-08', position: 1, data: { client: 'B' }, formats: {} },
        });
        const c = await prisma.row.create({
          data: { month: '2026-08', position: 2, data: { client: 'C' }, formats: {} },
        });
        const socketB = await clientDansLaRoom('month:2026-08');

        const renumbered = several<RenumberedPayload>(socketB, 'row.updated', 2);
        await request(app.getHttpServer())
          .post(`/api/rows/${c.id}/move`)
          .set('Cookie', cookieAlice)
          .send({ position: 0 })
          .expect(200);

        const payloads = await renumbered;
        expect(payloads.map((p) => p.row.id).sort()).toEqual([a.id, b.id].sort());
        for (const payload of payloads) {
          expect(payload.changedKeys).toEqual([]);
          expect(payload.byUserId).toBe(alice.id);
        }
        const positions = new Map(payloads.map((p) => [p.row.id, p.row.position]));
        expect(positions.get(a.id)).toBe(1);
        expect(positions.get(b.id)).toBe(2);
      });

      it('ne diffuse aucun row.updated superflu quand un déplacement ne change la position de personne d autre', async () => {
        const a = await prisma.row.create({
          data: { month: '2026-08', position: 0, data: { client: 'A' }, formats: {} },
        });
        await prisma.row.create({
          data: { month: '2026-08', position: 1, data: { client: 'B' }, formats: {} },
        });
        const socketB = await clientDansLaRoom('month:2026-08');

        const inattendu = once<RenumberedPayload>(socketB, 'row.updated', 1000);
        await request(app.getHttpServer())
          .post(`/api/rows/${a.id}/move`)
          .set('Cookie', cookieAlice)
          .send({ position: 0 })
          .expect(200);

        await expect(inattendu).rejects.toThrow(new RegExp('Aucun evenement.*recu en 1000 ms'));
      });

      it('diffuse row.updated pour les lignes restantes renumérotées par un archivage', async () => {
        const a = await prisma.row.create({
          data: { month: '2026-08', position: 0, data: { client: 'A' }, formats: {} },
        });
        const b = await prisma.row.create({
          data: { month: '2026-08', position: 1, data: { client: 'B' }, formats: {} },
        });
        const c = await prisma.row.create({
          data: { month: '2026-08', position: 2, data: { client: 'C' }, formats: {} },
        });
        const socketB = await clientDansLaRoom('month:2026-08');

        const renumbered = several<RenumberedPayload>(socketB, 'row.updated', 2);
        await request(app.getHttpServer())
          .post(`/api/rows/${a.id}/archive`)
          .set('Cookie', cookieAlice)
          .send({ archived: true })
          .expect(200);

        const payloads = await renumbered;
        expect(payloads.map((p) => p.row.id).sort()).toEqual([b.id, c.id].sort());
        const positions = new Map(payloads.map((p) => [p.row.id, p.row.position]));
        expect(positions.get(b.id)).toBe(0);
        expect(positions.get(c.id)).toBe(1);
      });

      it('diffuse row.updated pour les lignes restantes renumérotées par un DELETE', async () => {
        const a = await prisma.row.create({
          data: { month: '2026-08', position: 0, data: { client: 'A' }, formats: {} },
        });
        const b = await prisma.row.create({
          data: { month: '2026-08', position: 1, data: { client: 'B' }, formats: {} },
        });
        const c = await prisma.row.create({
          data: { month: '2026-08', position: 2, data: { client: 'C' }, formats: {} },
        });
        const socketB = await clientDansLaRoom('month:2026-08');

        const renumbered = several<RenumberedPayload>(socketB, 'row.updated', 2);
        await request(app.getHttpServer())
          .delete(`/api/rows/${a.id}`)
          .set('Cookie', cookieAlice)
          .expect(204);

        const payloads = await renumbered;
        expect(payloads.map((p) => p.row.id).sort()).toEqual([b.id, c.id].sort());
        expect(payloads.every((p) => p.byUserId === alice.id)).toBe(true);
      });

      it('diffuse row.updated pour les lignes décalées par une création à une position intermédiaire', async () => {
        const a = await prisma.row.create({
          data: { month: '2026-08', position: 0, data: { client: 'A' }, formats: {} },
        });
        const b = await prisma.row.create({
          data: { month: '2026-08', position: 1, data: { client: 'B' }, formats: {} },
        });
        const socketB = await clientDansLaRoom('month:2026-08');

        const renumbered = several<RenumberedPayload>(socketB, 'row.updated', 2);
        await request(app.getHttpServer())
          .post('/api/rows')
          .set('Cookie', cookieAlice)
          .send({ month: '2026-08', position: 0 })
          .expect(201);

        const payloads = await renumbered;
        expect(payloads.map((p) => p.row.id).sort()).toEqual([a.id, b.id].sort());
        const positions = new Map(payloads.map((p) => [p.row.id, p.row.position]));
        expect(positions.get(a.id)).toBe(1);
        expect(positions.get(b.id)).toBe(2);
      });
    });
  });
});
