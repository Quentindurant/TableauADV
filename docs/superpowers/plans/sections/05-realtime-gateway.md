# Section 05 — Passerelle temps réel

> Références obligatoires : `docs/superpowers/specs/2026-08-10-suivi-commandes-design.md`
> et `docs/superpowers/plans/sections/_contracts.md`. Aucun nom (package, route,
> type, fichier, événement) ne doit dévier des contrats.

## Feature 5 — Passerelle temps réel (branche `feature/realtime-gateway`)

**But:** brancher Socket.IO sur le serveur HTTP NestJS (même port, path `/socket.io`) pour offrir l'authentification du socket par cookie JWT, la présence par room, le relais du focus de cellule, la machine à verrous de cellule (TTL 30 s, balayage périodique) et la diffusion des événements `row.*` / `config.changed` émis par les services REST après commit.

**Dépend de:**

- **Feature 0 (socle)** : monorepo pnpm, `apps/api` NestJS 11, `export function setupApp(app: INestApplication): INestApplication` dans `apps/api/src/app.setup.ts` (préfixe global `api` + cookie-parser), `AppModule` dans `apps/api/src/app.module.ts`, scripts `test:unit` (jest sur `src/**/*.spec.ts`) et `test:e2e` (jest sur `test/**/*.e2e-spec.ts`) du package `@suivi/api`, `moduleNameMapper` vers `packages/shared/src/index.ts`.
- **Feature 1 (schéma)** : `PrismaService` (`apps/api/src/prisma/prisma.service.ts`, module `@Global()`), modèles `User` / `Row` / `Column` / `Choice`, types partagés `UserDTO`, `RowDTO` de `@suivi/shared`.
- **Feature 2 (auth/users)** : `POST /api/auth/login` posant le cookie httpOnly `token` (JWT signé avec `JWT_SECRET`, payload `{ sub: <user.id> }`), `AuthModule` (`apps/api/src/auth/auth.module.ts`) important `JwtModule`, `UsersService` (`apps/api/src/users/users.service.ts`), dépendances `@nestjs/jwt` et `argon2` installées.
- **Feature 3 (colonnes/choix)** : `ColumnsService` et `ChoicesService` (`apps/api/src/columns/columns.service.ts`, `apps/api/src/choices/choices.service.ts`) avec les signatures listées en Task 5.6.
- **Feature 4 (lignes)** : `RowsService` (`apps/api/src/rows/rows.service.ts`) et les routes `POST /api/rows`, `PATCH /api/rows/:id`, `POST /api/rows/:id/move`, `POST /api/rows/:id/archive`, `DELETE /api/rows/:id`.

**Périmètre d'erreurs de cette feature :** un seul `ErrorCode` des contrats est produit côté serveur : `AUTH_REQUIRED` (handshake sans cookie `token`, ou token invalide/expiré, ou utilisateur supprimé) — renvoyé comme message de l'erreur `connect_error` Socket.IO. Le refus de verrou n'est **pas** une erreur HTTP : il passe par l'ack contractuel `{ granted: false, holder }` (`ErrorCode 'LOCKED'` est utilisé côté front, Feature 7, pour le message « Cellule en cours d'édition par … »). Les deux cas ont chacun leur test (Task 5.4 pour `AUTH_REQUIRED`, Task 5.5 pour le refus de verrou).

**Rappel des contrats appliqués ici (aucune déviation autorisée) :**

- Rooms : `month:<YYYY-MM>` et `archives`, rien d'autre.
- Client → serveur : `room.join`, `cell.focus`, `cell.lock.request` (avec ack), `cell.lock.release`.
- Serveur → clients : `presence`, `cell.focus`, `cell.lock`, `cell.unlock`, `row.created`, `row.updated`, `row.deleted`, `row.moved`, `config.changed`.
- Payloads exacts : voir `_contracts.md` § « Événements Socket.IO ».

---

### Task 5.1: Branche, dépendances Socket.IO et utilitaire `ws-jwt`

**Files:**
- Create: `apps/api/src/auth/ws-jwt.util.ts`
- Modify: `apps/api/package.json`
- Test: `apps/api/src/auth/ws-jwt.util.spec.ts`

**Interfaces:**
- Consomme :
  - `AuthModule` / cookie `token` posé par `POST /api/auth/login` (Feature 2) ;
  - `JwtService` de `@nestjs/jwt` (Feature 2) — pas encore utilisé dans cette task, seulement le format du payload `{ sub: string }`.
- Produit (consommé par la Task 5.4) :
  - `export const AUTH_COOKIE_NAME = 'token';`
  - `export interface WsJwtPayload { sub: string }`
  - `export function parseCookieHeader(header: string | undefined | null): Record<string, string>`
  - `export interface WsHandshakeLike { headers: { cookie?: string } }`
  - `export function tokenFromHandshake(handshake: WsHandshakeLike): string | null`

- [ ] **Étape 1: créer la branche de feature**

  ```bash
  git checkout develop && git pull && git checkout -b feature/realtime-gateway
  ```

  Résultat attendu : `Switched to a new branch 'feature/realtime-gateway'`.

- [ ] **Étape 2: ajouter les dépendances Socket.IO à `@suivi/api`**

  Dans `apps/api/package.json`, ajouter aux `dependencies` (à côté de `@nestjs/common`, `@nestjs/core`, `@nestjs/jwt`, …) :

  ```json
      "@nestjs/platform-socket.io": "^11.0.0",
      "@nestjs/websockets": "^11.0.0",
      "socket.io": "^4.8.1",
  ```

  et aux `devDependencies` :

  ```json
      "socket.io-client": "^4.8.1",
  ```

  Puis installer :

  ```bash
  pnpm install
  ```

  Résultat attendu : installation en code 0, `apps/api/node_modules/socket.io` et `apps/api/node_modules/socket.io-client` présents.

- [ ] **Étape 3: écrire le test qui échoue**

  Créer `apps/api/src/auth/ws-jwt.util.spec.ts` :

  ```ts
  import {
    AUTH_COOKIE_NAME,
    parseCookieHeader,
    tokenFromHandshake,
  } from './ws-jwt.util';

  describe('ws-jwt.util', () => {
    describe('parseCookieHeader', () => {
      it('retourne un objet vide quand il n y a pas d en-tete Cookie', () => {
        expect(parseCookieHeader(undefined)).toEqual({});
        expect(parseCookieHeader(null)).toEqual({});
        expect(parseCookieHeader('')).toEqual({});
      });

      it('decoupe plusieurs cookies et trim les espaces', () => {
        expect(parseCookieHeader('token=abc.def.ghi; theme=sombre')).toEqual({
          token: 'abc.def.ghi',
          theme: 'sombre',
        });
      });

      it('conserve les "=" internes a la valeur (JWT base64 padde)', () => {
        expect(parseCookieHeader('token=aaa=bbb=')).toEqual({ token: 'aaa=bbb=' });
      });

      it('decode les valeurs percent-encodees', () => {
        expect(parseCookieHeader('token=a%20b')).toEqual({ token: 'a b' });
      });

      it('conserve la valeur brute si le decodage echoue', () => {
        expect(parseCookieHeader('token=100%')).toEqual({ token: '100%' });
      });

      it('ignore les fragments sans "=" et garde le premier cookie en cas de doublon', () => {
        expect(parseCookieHeader('bruit; token=premier; token=second')).toEqual({
          token: 'premier',
        });
      });
    });

    describe('tokenFromHandshake', () => {
      it('nomme le cookie d authentification "token" (contrat REST)', () => {
        expect(AUTH_COOKIE_NAME).toBe('token');
      });

      it('retourne le JWT du cookie token', () => {
        expect(
          tokenFromHandshake({ headers: { cookie: 'autre=1; token=le.jwt.ici' } }),
        ).toBe('le.jwt.ici');
      });

      it('retourne null sans en-tete Cookie', () => {
        expect(tokenFromHandshake({ headers: {} })).toBeNull();
      });

      it('retourne null si le cookie token est absent ou vide', () => {
        expect(tokenFromHandshake({ headers: { cookie: 'theme=sombre' } })).toBeNull();
        expect(tokenFromHandshake({ headers: { cookie: 'token=' } })).toBeNull();
      });
    });
  });
  ```

- [ ] **Étape 4: lancer le test (FAIL)**

  ```bash
  pnpm --filter @suivi/api test:unit -- ws-jwt.util.spec
  ```

  Résultat attendu : **FAIL** — erreur de compilation ts-jest
  `Cannot find module './ws-jwt.util' from 'src/auth/ws-jwt.util.spec.ts'`.

- [ ] **Étape 5: implémenter `ws-jwt.util.ts`**

  Créer `apps/api/src/auth/ws-jwt.util.ts` :

  ```ts
  /**
   * Authentification des sockets (Feature 5).
   *
   * Le handshake Socket.IO ne passe pas par le middleware `cookie-parser` de
   * l'application HTTP : on lit donc l'en-tete `Cookie` brut du handshake et on
   * en extrait le cookie httpOnly `token` pose par `POST /api/auth/login`.
   */

  /** Nom du cookie JWT httpOnly, identique au contrat REST. */
  export const AUTH_COOKIE_NAME = 'token';

  /** Payload minimal du JWT emis par la Feature 2. */
  export interface WsJwtPayload {
    sub: string;
  }

  /** Partie du handshake Socket.IO dont on a besoin (facilite les tests). */
  export interface WsHandshakeLike {
    headers: { cookie?: string };
  }

  /**
   * Parse un en-tete `Cookie` HTTP en dictionnaire nom -> valeur.
   * Premier cookie gagnant en cas de doublon ; valeur rendue telle quelle si
   * `decodeURIComponent` echoue (cookie non encode).
   */
  export function parseCookieHeader(
    header: string | undefined | null,
  ): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!header) {
      return cookies;
    }
    for (const fragment of header.split(';')) {
      const raw = fragment.trim();
      if (raw.length === 0) {
        continue;
      }
      const separator = raw.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const name = raw.slice(0, separator).trim();
      const value = raw.slice(separator + 1).trim();
      if (Object.prototype.hasOwnProperty.call(cookies, name)) {
        continue;
      }
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
    }
    return cookies;
  }

  /** Extrait le JWT du handshake, ou `null` si absent. */
  export function tokenFromHandshake(handshake: WsHandshakeLike): string | null {
    const token: string | undefined = parseCookieHeader(handshake.headers.cookie)[
      AUTH_COOKIE_NAME
    ];
    return token !== undefined && token.length > 0 ? token : null;
  }
  ```

- [ ] **Étape 6: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/api test:unit -- ws-jwt.util.spec
  ```

  Résultat attendu : **PASS** — `Tests: 10 passed, 10 total`.

- [ ] **Étape 7: commit**

  ```bash
  git add apps/api/package.json apps/api/src/auth/ws-jwt.util.ts apps/api/src/auth/ws-jwt.util.spec.ts pnpm-lock.yaml
  git commit -m "feat: dependances socket.io et utilitaire de lecture du cookie JWT du handshake"
  ```

---

### Task 5.2: `LocksService` — machine à verrous de cellule (unitaire)

**Files:**
- Create: `apps/api/src/realtime/locks.service.ts`
- Test: `apps/api/src/realtime/locks.service.spec.ts`

**Interfaces:**
- Consomme : rien (service pur, aucune dépendance Nest hors `@Injectable`).
- Produit (consommé par les Tasks 5.4 et 5.5) :
  - `export const LOCK_TTL_MS = 30_000;`
  - `export interface Lock { rowId: string; colKey: string; userId: string; socketId: string; room: string; expiresAt: number }`
  - `export interface AcquireInput { rowId: string; colKey: string; userId: string; socketId: string; room: string }`
  - `export interface AcquireResult { granted: boolean; holderUserId?: string }`
  - `class LocksService` avec :
    - `static key(rowId: string, colKey: string): string` → `` `${rowId}:${colKey}` ``
    - `acquire(input: AcquireInput, now?: number): AcquireResult`
    - `release(input: { rowId: string; colKey: string; socketId: string }): Lock | null`
    - `releaseAllForSocket(socketId: string): Lock[]`
    - `sweep(now?: number): Lock[]`
    - `peek(rowId: string, colKey: string): Lock | null`
    - `size(): number`

  Le champ `room` s'ajoute au triplet `{userId, socketId, expiresAt}` de la spec : il permet à la passerelle d'émettre `cell.unlock` dans la bonne room lors du balayage ou d'une déconnexion, sans relire la présence.

- [ ] **Étape 1: écrire le test qui échoue**

  Créer `apps/api/src/realtime/locks.service.spec.ts` :

  ```ts
  import { LOCK_TTL_MS, LocksService } from './locks.service';

  const T0 = 1_000_000;

  function input(overrides: Partial<Parameters<LocksService['acquire']>[0]> = {}) {
    return {
      rowId: 'row1',
      colKey: 'client',
      userId: 'userA',
      socketId: 'socketA',
      room: 'month:2026-08',
      ...overrides,
    };
  }

  describe('LocksService', () => {
    let locks: LocksService;

    beforeEach(() => {
      locks = new LocksService();
    });

    it('compose la cle de verrou sous la forme "rowId:colKey"', () => {
      expect(LocksService.key('row1', 'client')).toBe('row1:client');
    });

    it('accorde un verrou sur une cellule libre et pose un TTL de 30 s', () => {
      expect(locks.acquire(input(), T0)).toEqual({ granted: true });
      expect(locks.peek('row1', 'client')).toEqual({
        rowId: 'row1',
        colKey: 'client',
        userId: 'userA',
        socketId: 'socketA',
        room: 'month:2026-08',
        expiresAt: T0 + LOCK_TTL_MS,
      });
      expect(LOCK_TTL_MS).toBe(30_000);
    });

    it('refuse le verrou a un autre socket tant qu il n est pas expire', () => {
      locks.acquire(input(), T0);
      const refus = locks.acquire(
        input({ userId: 'userB', socketId: 'socketB' }),
        T0 + LOCK_TTL_MS - 1,
      );
      expect(refus).toEqual({ granted: false, holderUserId: 'userA' });
      expect(locks.peek('row1', 'client')?.socketId).toBe('socketA');
    });

    it('n interfere pas entre deux cellules differentes de la meme ligne', () => {
      locks.acquire(input(), T0);
      expect(
        locks.acquire(
          input({ colKey: 'statut', userId: 'userB', socketId: 'socketB' }),
          T0,
        ),
      ).toEqual({ granted: true });
      expect(locks.size()).toBe(2);
    });

    it('renouvelle le TTL quand le meme socket redemande le verrou (frappe en cours)', () => {
      locks.acquire(input(), T0);
      expect(locks.acquire(input(), T0 + 20_000)).toEqual({ granted: true });
      expect(locks.peek('row1', 'client')?.expiresAt).toBe(T0 + 20_000 + LOCK_TTL_MS);
      expect(locks.size()).toBe(1);
    });

    it('accorde le verrou a un autre socket une fois le TTL expire', () => {
      locks.acquire(input(), T0);
      const apres = locks.acquire(
        input({ userId: 'userB', socketId: 'socketB' }),
        T0 + LOCK_TTL_MS,
      );
      expect(apres).toEqual({ granted: true });
      expect(locks.peek('row1', 'client')?.userId).toBe('userB');
    });

    it('libere le verrou a la demande de son detenteur', () => {
      locks.acquire(input(), T0);
      const libere = locks.release({ rowId: 'row1', colKey: 'client', socketId: 'socketA' });
      expect(libere?.userId).toBe('userA');
      expect(locks.peek('row1', 'client')).toBeNull();
    });

    it('ignore une liberation demandee par un autre socket', () => {
      locks.acquire(input(), T0);
      expect(
        locks.release({ rowId: 'row1', colKey: 'client', socketId: 'socketB' }),
      ).toBeNull();
      expect(locks.peek('row1', 'client')?.socketId).toBe('socketA');
    });

    it('retourne null pour la liberation d une cellule non verrouillee', () => {
      expect(
        locks.release({ rowId: 'inconnue', colKey: 'client', socketId: 'socketA' }),
      ).toBeNull();
    });

    it('libere tous les verrous d un socket et retourne la liste (deconnexion)', () => {
      locks.acquire(input(), T0);
      locks.acquire(input({ colKey: 'statut' }), T0);
      locks.acquire(input({ rowId: 'row2', colKey: 'tech', room: 'archives' }), T0);
      locks.acquire(input({ rowId: 'row3', userId: 'userB', socketId: 'socketB' }), T0);

      const liberes = locks.releaseAllForSocket('socketA');
      expect(liberes).toHaveLength(3);
      expect(liberes.map((l) => `${l.rowId}:${l.colKey}`).sort()).toEqual([
        'row1:client',
        'row1:statut',
        'row2:tech',
      ]);
      expect(liberes.find((l) => l.rowId === 'row2')?.room).toBe('archives');
      expect(locks.size()).toBe(1);
      expect(locks.peek('row3', 'client')?.socketId).toBe('socketB');
    });

    it('retourne un tableau vide si le socket ne detient aucun verrou', () => {
      expect(locks.releaseAllForSocket('socketZ')).toEqual([]);
    });

    it('sweep retire et retourne uniquement les verrous expires', () => {
      locks.acquire(input(), T0);
      locks.acquire(input({ colKey: 'statut' }), T0 + 10_000);

      const expires = locks.sweep(T0 + LOCK_TTL_MS);
      expect(expires).toHaveLength(1);
      expect(expires[0]).toMatchObject({ rowId: 'row1', colKey: 'client', room: 'month:2026-08' });
      expect(locks.size()).toBe(1);
      expect(locks.peek('row1', 'statut')).not.toBeNull();
    });

    it('sweep ne retourne rien quand aucun verrou n est expire', () => {
      locks.acquire(input(), T0);
      expect(locks.sweep(T0 + 1)).toEqual([]);
      expect(locks.size()).toBe(1);
    });
  });
  ```

- [ ] **Étape 2: lancer le test (FAIL)**

  ```bash
  pnpm --filter @suivi/api test:unit -- locks.service.spec
  ```

  Résultat attendu : **FAIL** — erreur de compilation ts-jest
  `Cannot find module './locks.service' from 'src/realtime/locks.service.spec.ts'`.

- [ ] **Étape 3: implémenter `LocksService`**

  Créer `apps/api/src/realtime/locks.service.ts` :

  ```ts
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
  ```

- [ ] **Étape 4: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/api test:unit -- locks.service.spec
  ```

  Résultat attendu : **PASS** — `Tests: 13 passed, 13 total`.

- [ ] **Étape 5: commit**

  ```bash
  git add apps/api/src/realtime/locks.service.ts apps/api/src/realtime/locks.service.spec.ts
  git commit -m "feat: LocksService (acquisition, refus, TTL 30s, liberation par socket, sweep)"
  ```

---

### Task 5.3: `PresenceService` — annuaire des sockets par room (unitaire)

**Files:**
- Create: `apps/api/src/realtime/presence.service.ts`
- Test: `apps/api/src/realtime/presence.service.spec.ts`

**Interfaces:**
- Consomme : `UserDTO` de `@suivi/shared` (Feature 1).
- Produit (consommé par la Task 5.4) :
  - `export interface PresenceEntry { socketId: string; room: string | null; user: UserDTO }`
  - `class PresenceService` avec :
    - `add(socketId: string, user: UserDTO): void`
    - `remove(socketId: string): PresenceEntry | null`
    - `setRoom(socketId: string, room: string | null): void`
    - `getRoom(socketId: string): string | null`
    - `getUser(socketId: string): UserDTO | null`
    - `findUserById(userId: string): UserDTO | undefined`
    - `listRoom(room: string): (UserDTO & { socketId: string })[]`
    - `size(): number`

- [ ] **Étape 1: écrire le test qui échoue**

  Créer `apps/api/src/realtime/presence.service.spec.ts` :

  ```ts
  import type { UserDTO } from '@suivi/shared';
  import { PresenceService } from './presence.service';

  const alice: UserDTO = {
    id: 'userA',
    email: 'alice@suivi.local',
    displayName: 'Alice',
    cursorColor: '#FF0000',
  };
  const bob: UserDTO = {
    id: 'userB',
    email: 'bob@suivi.local',
    displayName: 'Bob',
    cursorColor: '#0000FF',
  };

  describe('PresenceService', () => {
    let presence: PresenceService;

    beforeEach(() => {
      presence = new PresenceService();
    });

    it('enregistre un socket sans room au depart', () => {
      presence.add('s1', alice);
      expect(presence.size()).toBe(1);
      expect(presence.getRoom('s1')).toBeNull();
      expect(presence.getUser('s1')).toEqual(alice);
    });

    it('ne liste que les sockets de la room demandee, avec leur socketId', () => {
      presence.add('s1', alice);
      presence.add('s2', bob);
      presence.setRoom('s1', 'month:2026-08');
      presence.setRoom('s2', 'archives');

      expect(presence.listRoom('month:2026-08')).toEqual([
        { ...alice, socketId: 's1' },
      ]);
      expect(presence.listRoom('archives')).toEqual([{ ...bob, socketId: 's2' }]);
      expect(presence.listRoom('month:2026-09')).toEqual([]);
    });

    it('liste deux utilisateurs presents dans la meme room', () => {
      presence.add('s1', alice);
      presence.add('s2', bob);
      presence.setRoom('s1', 'month:2026-08');
      presence.setRoom('s2', 'month:2026-08');

      const users = presence.listRoom('month:2026-08');
      expect(users).toHaveLength(2);
      expect(users.map((u) => u.socketId).sort()).toEqual(['s1', 's2']);
      expect(users.map((u) => u.displayName).sort()).toEqual(['Alice', 'Bob']);
    });

    it('deplace un socket d une room a l autre', () => {
      presence.add('s1', alice);
      presence.setRoom('s1', 'month:2026-08');
      presence.setRoom('s1', 'archives');

      expect(presence.listRoom('month:2026-08')).toEqual([]);
      expect(presence.getRoom('s1')).toBe('archives');
    });

    it('retrouve un utilisateur connecte par son id', () => {
      presence.add('s1', alice);
      expect(presence.findUserById('userA')).toEqual(alice);
      expect(presence.findUserById('inconnu')).toBeUndefined();
    });

    it('retire un socket et retourne son entree', () => {
      presence.add('s1', alice);
      presence.setRoom('s1', 'month:2026-08');

      const entry = presence.remove('s1');
      expect(entry).toEqual({ socketId: 's1', room: 'month:2026-08', user: alice });
      expect(presence.size()).toBe(0);
      expect(presence.listRoom('month:2026-08')).toEqual([]);
      expect(presence.remove('s1')).toBeNull();
    });

    it('ignore setRoom sur un socket inconnu', () => {
      presence.setRoom('inconnu', 'month:2026-08');
      expect(presence.size()).toBe(0);
      expect(presence.getRoom('inconnu')).toBeNull();
      expect(presence.getUser('inconnu')).toBeNull();
    });
  });
  ```

- [ ] **Étape 2: lancer le test (FAIL)**

  ```bash
  pnpm --filter @suivi/api test:unit -- presence.service.spec
  ```

  Résultat attendu : **FAIL** — `Cannot find module './presence.service' from 'src/realtime/presence.service.spec.ts'`.

- [ ] **Étape 3: implémenter `PresenceService`**

  Créer `apps/api/src/realtime/presence.service.ts` :

  ```ts
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
  ```

- [ ] **Étape 4: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/api test:unit -- presence.service.spec
  ```

  Résultat attendu : **PASS** — `Tests: 7 passed, 7 total`.

- [ ] **Étape 5: commit**

  ```bash
  git add apps/api/src/realtime/presence.service.ts apps/api/src/realtime/presence.service.spec.ts
  git commit -m "feat: PresenceService (annuaire sockets, rooms, liste de presence)"
  ```

---

### Task 5.4: `RealtimeGateway` — handshake authentifié, rooms, présence, focus

**Files:**
- Create: `apps/api/src/realtime/realtime.emitter.ts` (squelette : `setServer` + no-op ; les émissions arrivent en Task 5.6), `apps/api/src/realtime/realtime.gateway.ts`, `apps/api/src/realtime/realtime.module.ts`
- Modify: `apps/api/src/app.module.ts` (ajout de `RealtimeModule`), `apps/api/src/auth/auth.module.ts` (export de `JwtModule`)
- Test: `apps/api/test/realtime.e2e-spec.ts`

**Interfaces:**
- Consomme :
  - `tokenFromHandshake`, `WsJwtPayload` (Task 5.1) ;
  - `LocksService` (Task 5.2), `PresenceService` (Task 5.3) ;
  - `JwtService` de `@nestjs/jwt` (`verifyAsync<WsJwtPayload>(token)`), fourni par `AuthModule` (Feature 2) ;
  - `PrismaService` (Feature 1) pour recharger l'utilisateur (`select: { id, email, displayName, cursorColor }` = exactement `UserDTO`) ;
  - `setupApp` (Feature 0) dans le test e2e ;
  - `POST /api/auth/login` (Feature 2) pour obtenir le cookie `token`.
- Produit (consommé par les Tasks 5.5 et 5.6) :
  - `export const SWEEP_INTERVAL_MS = 5_000;`
  - `class RealtimeGateway` : `afterInit(server: Server): void`, `handleConnection(client: Socket): void`, `handleDisconnect(client: Socket): void`, `handleRoomJoin`, `handleCellFocus`, `handleLockRequest`, `handleLockRelease`, `sweepExpiredLocks(now?: number): void`
  - `class RealtimeEmitter` : `setServer(server: Server): void`
  - `RealtimeModule` (`@Global()`) exportant `RealtimeEmitter`, `LocksService`, `PresenceService`.

- [ ] **Étape 1: écrire le test e2e qui échoue**

  Créer `apps/api/test/realtime.e2e-spec.ts` :

  ```ts
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

    /** Emet `event` et attend l ack du serveur. */
    function ask<T>(socket: Socket, event: string, body: unknown, timeoutMs = 5_000): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Aucun ack pour "${event}" en ${timeoutMs} ms`)),
          timeoutMs,
        );
        socket.emit(event, body, (ack: T) => {
          clearTimeout(timer);
          resolve(ack);
        });
      });
    }

    /** Petite attente pour laisser le serveur traiter un message sans ack. */
    function settle(ms = 150): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms));
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
        expect(seul.users[0]).toMatchObject({ id: alice.id, displayName: 'Alice', cursorColor: '#FF0000' });
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
  });
  ```

- [ ] **Étape 2: lancer le test (FAIL)**

  ```bash
  pnpm --filter @suivi/api test:e2e -- realtime.e2e-spec
  ```

  Résultat attendu : **FAIL** — toutes les connexions échouent (`connect(cookieAlice)` rejette) car aucune passerelle Socket.IO n'est enregistrée : le serveur HTTP répond 404 sur `/socket.io`. Le premier test (`refuse la connexion sans cookie`) échoue lui aussi : l'erreur reçue n'est pas `AUTH_REQUIRED` mais une erreur de transport.

- [ ] **Étape 3: implémenter le squelette de `RealtimeEmitter`**

  Créer `apps/api/src/realtime/realtime.emitter.ts` :

  ```ts
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
  ```

- [ ] **Étape 4: implémenter la passerelle**

  Créer `apps/api/src/realtime/realtime.gateway.ts` :

  ```ts
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

  @WebSocketGateway({ path: '/socket.io', cors: { origin: true, credentials: true } })
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
  ```

- [ ] **Étape 5: créer `RealtimeModule` et le câbler dans `AppModule`**

  Créer `apps/api/src/realtime/realtime.module.ts` :

  ```ts
  import { Global, Module } from '@nestjs/common';
  import { AuthModule } from '../auth/auth.module';
  import { LocksService } from './locks.service';
  import { PresenceService } from './presence.service';
  import { RealtimeEmitter } from './realtime.emitter';
  import { RealtimeGateway } from './realtime.gateway';

  /**
   * `@Global()` : `RealtimeEmitter` est injectable dans RowsService,
   * ColumnsService, ChoicesService et UsersService sans reimporter le module.
   */
  @Global()
  @Module({
    imports: [AuthModule],
    providers: [RealtimeGateway, LocksService, PresenceService, RealtimeEmitter],
    exports: [RealtimeEmitter, LocksService, PresenceService],
  })
  export class RealtimeModule {}
  ```

  Remplacer `apps/api/src/app.module.ts` par (contenu complet à ce point du plan — Features 0 à 5) :

  ```ts
  import { Module } from '@nestjs/common';
  import { AuthModule } from './auth/auth.module';
  import { ChoicesModule } from './choices/choices.module';
  import { ColumnsModule } from './columns/columns.module';
  import { HealthModule } from './health/health.module';
  import { MonthsModule } from './months/months.module';
  import { PrismaModule } from './prisma/prisma.module';
  import { RealtimeModule } from './realtime/realtime.module';
  import { RowsModule } from './rows/rows.module';
  import { UsersModule } from './users/users.module';

  @Module({
    imports: [
      PrismaModule,
      HealthModule,
      AuthModule,
      UsersModule,
      ColumnsModule,
      ChoicesModule,
      RowsModule,
      MonthsModule,
      RealtimeModule,
    ],
  })
  export class AppModule {}
  ```

  `apps/api/src/auth/auth.module.ts` réexporte déjà `JwtModule` (Feature 2, Task 2.5) : `RealtimeGateway` peut injecter `JwtService` sans modification. Contenu attendu, inchangé :

  ```ts
  import { Module } from '@nestjs/common';
  import { APP_GUARD } from '@nestjs/core';
  import { JwtModule } from '@nestjs/jwt';
  import { AuthController } from './auth.controller';
  import { AuthService } from './auth.service';
  import { JwtAuthGuard } from './jwt.guard';
  import { jwtSecret } from './jwt-secret';

  @Module({
    imports: [
      JwtModule.registerAsync({
        global: true,
        useFactory: () => ({
          secret: jwtSecret(),
          signOptions: { expiresIn: '30d' },
        }),
      }),
    ],
    controllers: [AuthController],
    providers: [AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
    exports: [AuthService, JwtModule],
  })
  export class AuthModule {}
  ```

- [ ] **Étape 6: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/api test:e2e -- realtime.e2e-spec
  ```

  Résultat attendu : **PASS** — `Tests: 9 passed, 9 total` (3 handshake, 4 rooms/présence, 2 focus).

- [ ] **Étape 7: commit**

  ```bash
  git add apps/api/src/realtime apps/api/src/app.module.ts apps/api/src/auth/auth.module.ts apps/api/test/realtime.e2e-spec.ts
  git commit -m "feat: passerelle socket.io (auth handshake par cookie JWT, rooms, presence, cell.focus)"
  ```

> À vérifier à l'exécution : `extraHeaders` de `socket.io-client` avec `transports: ['websocket']` — en Node les en-têtes sont bien transmis au handshake WebSocket ; si le cookie n'arrive pas côté serveur, retirer `transports: ['websocket']` (le transport `polling` initial porte alors l'en-tête `Cookie`).
> À vérifier à l'exécution : le nom exact du module exporté par `apps/api/src/auth/auth.module.ts` (le plan suppose `AuthModule` exportant `JwtModule`). Si Feature 2 configure le JWT autrement, remplacer `imports: [AuthModule]` de `RealtimeModule` par `JwtModule.register({ secret: process.env.JWT_SECRET })` — le secret DOIT être identique à celui de la signature du cookie.

---

### Task 5.5: Verrous de cellule via la passerelle (`cell.lock.request` / `cell.lock.release`)

**Files:**
- Modify: `apps/api/src/realtime/realtime.gateway.ts` (ajout des deux handlers)
- Test: `apps/api/test/realtime.e2e-spec.ts` (ajout d'un bloc `describe`)

**Interfaces:**
- Consomme : `LocksService.acquire / release / sweep` (Task 5.2), `PresenceService.findUserById / getRoom` (Task 5.3), `RealtimeGateway.sweepExpiredLocks` (Task 5.4).
- Produit :
  - `@SubscribeMessage('cell.lock.request')` → ack `{ granted: boolean; holder?: UserDTO }`, émission `cell.lock` `{ rowId, colKey, user }` à la room en cas d'octroi ;
  - `@SubscribeMessage('cell.lock.release')` → émission `cell.unlock` `{ rowId, colKey }` à la room ;
  - libération + `cell.unlock` à la déconnexion (déjà câblée en Task 5.4 via `handleDisconnect`) et au balayage périodique.

- [ ] **Étape 1: écrire les tests qui échouent**

  Dans `apps/api/test/realtime.e2e-spec.ts`, ajouter les imports nécessaires en tête de fichier :

  ```ts
  import { LOCK_TTL_MS } from '../src/realtime/locks.service';
  import { RealtimeGateway } from '../src/realtime/realtime.gateway';
  ```

  puis ajouter, juste avant la dernière accolade fermante du `describe('Realtime (e2e)')`, le bloc suivant :

  ```ts
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
  ```

- [ ] **Étape 2: lancer le test (FAIL)**

  ```bash
  pnpm --filter @suivi/api test:e2e -- realtime.e2e-spec
  ```

  Résultat attendu : **FAIL** — 8 tests du bloc « verrous de cellule » échouent sur
  `Aucun ack pour "cell.lock.request" en 5000 ms` (aucun handler `cell.lock.request` n'est enregistré, Socket.IO n'appelle jamais le callback d'ack).

- [ ] **Étape 3: implémenter les deux handlers**

  Dans `apps/api/src/realtime/realtime.gateway.ts`, ajouter les deux méthodes suivantes juste après `handleCellFocus` :

  ```ts
    @SubscribeMessage('cell.lock.request')
    handleLockRequest(
      @ConnectedSocket() client: Socket,
      @MessageBody() body: { rowId?: unknown; colKey?: unknown },
    ): { granted: boolean; holder?: UserDTO } {
      const user = client.data.user as UserDTO | undefined;
      const room = this.presence.getRoom(client.id);
      const rowId = typeof body?.rowId === 'string' ? body.rowId : '';
      const colKey = typeof body?.colKey === 'string' ? body.colKey : '';
      if (user === undefined || room === null || rowId === '' || colKey === '') {
        return { granted: false };
      }

      const result = this.locks.acquire({
        rowId,
        colKey,
        userId: user.id,
        socketId: client.id,
        room,
      });

      if (!result.granted) {
        const holder =
          result.holderUserId === undefined
            ? undefined
            : this.presence.findUserById(result.holderUserId);
        return holder === undefined ? { granted: false } : { granted: false, holder };
      }

      this.server.to(room).emit('cell.lock', { rowId, colKey, user });
      return { granted: true };
    }

    @SubscribeMessage('cell.lock.release')
    handleLockRelease(
      @ConnectedSocket() client: Socket,
      @MessageBody() body: { rowId?: unknown; colKey?: unknown },
    ): void {
      const rowId = typeof body?.rowId === 'string' ? body.rowId : '';
      const colKey = typeof body?.colKey === 'string' ? body.colKey : '';
      if (rowId === '' || colKey === '') {
        return;
      }
      const released = this.locks.release({ rowId, colKey, socketId: client.id });
      if (released !== null) {
        this.server.to(released.room).emit('cell.unlock', { rowId, colKey });
      }
    }
  ```

- [ ] **Étape 4: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/api test:e2e -- realtime.e2e-spec
  ```

  Résultat attendu : **PASS** — `Tests: 17 passed, 17 total` (9 de la Task 5.4 + 8 verrous).

- [ ] **Étape 5: commit**

  ```bash
  git add apps/api/src/realtime/realtime.gateway.ts apps/api/test/realtime.e2e-spec.ts
  git commit -m "feat: verrous de cellule temps reel (ack lock.request, release, unlock a la deconnexion et au sweep)"
  ```

> À vérifier à l'exécution : l'acquittement (« ack ») d'un `@SubscribeMessage` NestJS — la valeur retournée par le handler est transmise au callback du client. Si l'ack n'arrive pas, retourner explicitement `{ event: 'cell.lock.request', data: { granted, holder } }` n'est PAS la bonne piste (ce format sert aux réponses évènementielles) : injecter alors le callback comme second paramètre du handler (`@MessageBody() body, ack: (payload: unknown) => void`) et l'appeler directement.

---

### Task 5.6: `RealtimeEmitter` complet et branchement dans les services REST

**Files:**
- Modify: `apps/api/src/realtime/realtime.emitter.ts`, `apps/api/src/rows/rows.service.ts`, `apps/api/src/columns/columns.service.ts`, `apps/api/src/choices/choices.service.ts`, `apps/api/src/users/users.service.ts`
- Test: `apps/api/src/realtime/realtime.emitter.spec.ts` (Create), `apps/api/test/realtime.e2e-spec.ts` (ajout d'un bloc `describe`)

**Interfaces:**
- Consomme :
  - `RealtimeEmitter.setServer` (Task 5.4) ;
  - `RowDTO` de `@suivi/shared` (Feature 1) ;
  - `ColumnsService.create / update / remove`, `ChoicesService.create / update / remove` (Feature 3, signatures rappelées ci-dessous) ;
  - `RowsService.create / patch / move / archive / remove` (Feature 4) ;
  - `UsersService.create / updateMe` (Feature 2).
- Produit (API publique consommée par tous les services REST) :
  - `export type ConfigScope = 'columns' | 'choices' | 'users';`
  - `RealtimeEmitter.emitRowCreated(row: RowDTO): void`
  - `RealtimeEmitter.emitRowUpdated(row: RowDTO, changedKeys: string[], byUserId: string): void`
  - `RealtimeEmitter.emitRowDeleted(rowId: string, month: string, archived: boolean): void`
  - `RealtimeEmitter.emitRowMoved(row: RowDTO, fromMonth: string): void`
  - `RealtimeEmitter.emitConfigChanged(scope: ConfigScope): void`
  - `static RealtimeEmitter.roomFor(row: { month: string; archived: boolean }): string`

- [ ] **Étape 1: écrire le test unitaire de l'émetteur (FAIL attendu à l'étape 2)**

  Créer `apps/api/src/realtime/realtime.emitter.spec.ts` :

  ```ts
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
  ```

- [ ] **Étape 2: lancer le test (FAIL)**

  ```bash
  pnpm --filter @suivi/api test:unit -- realtime.emitter.spec
  ```

  Résultat attendu : **FAIL** — erreurs de compilation ts-jest
  `Property 'roomFor' does not exist on type 'typeof RealtimeEmitter'` et
  `Property 'emitRowCreated' does not exist on type 'RealtimeEmitter'` (le squelette de la Task 5.4 n'a que `setServer`).

- [ ] **Étape 3: implémenter `RealtimeEmitter` en entier**

  Remplacer intégralement `apps/api/src/realtime/realtime.emitter.ts` par :

  ```ts
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
  ```

- [ ] **Étape 4: relancer le test unitaire (PASS)**

  ```bash
  pnpm --filter @suivi/api test:unit -- realtime.emitter.spec
  ```

  Résultat attendu : **PASS** — `Tests: 10 passed, 10 total`.

- [ ] **Étape 5: écrire les tests e2e de diffusion depuis REST (FAIL attendu à l'étape 6)**

  Dans `apps/api/test/realtime.e2e-spec.ts`, ajouter juste avant la dernière accolade fermante du `describe('Realtime (e2e)')` :

  ```ts
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
    });
  ```

- [ ] **Étape 6: lancer le test (FAIL)**

  ```bash
  pnpm --filter @suivi/api test:e2e -- realtime.e2e-spec
  ```

  Résultat attendu : **FAIL** — les 8 tests du bloc « diffusion des mutations REST » échouent sur
  `Aucun evenement "row.updated" recu en 5000 ms` (et équivalents), les services REST n'émettant encore rien.

- [ ] **Étape 7: brancher `RealtimeEmitter` dans `RowsService`**

  Dans `apps/api/src/rows/rows.service.ts` :

  1. ajouter l'import :

  ```ts
  import { RealtimeEmitter } from '../realtime/realtime.emitter';
  ```

  2. ajouter le paramètre au constructeur :

  ```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: RealtimeEmitter,
  ) {}
  ```

  (Les noms de méthodes et de variables ci-dessous sont ceux, définitifs, de
  `apps/api/src/rows/rows.service.ts` livré par la Feature 4 : `create(dto, userId)`,
  `patch(id, dto, userId)`, `move(id, dto, userId)`, `archive(id, archived, userId)`,
  `remove(id)`. Le paramètre d'entrée s'appelant déjà `dto`, le `RowDTO` produit est
  nommé `row`. `move`, `archive` et `remove` relisent déjà la ligne dans une variable
  `existing` — contrat interne annoncé par la section 04 : **ne pas relire la ligne**.)

  3. dans `create(dto, userId)`, remplacer `return toRowDTO(created);` par :

  ```ts
    const row = toRowDTO(created);
    this.emitter.emitRowCreated(row);
    return row;
  ```

  4. dans `patch(id, dto, userId)`, remplacer `return toRowDTO(updated);` par (la liste des clés touchées est déjà calculée en tête de méthode dans `keys`) :

  ```ts
    const row = toRowDTO(updated);
    this.emitter.emitRowUpdated(row, keys, userId);
    return row;
  ```

  5. dans `move(id, dto, userId)`, remplacer `return toRowDTO(moved);` par (le mois de départ est `existing.month`, déjà lu en tête de méthode) :

  ```ts
    const row = toRowDTO(moved);
    this.emitter.emitRowMoved(row, existing.month);
    return row;
  ```

  6. dans `archive(id, archived, userId)`, remplacer `return toRowDTO(updated);` par (la ligne change de room : elle disparaît de l'ancienne vue et apparaît dans la nouvelle) :

  ```ts
    const row = toRowDTO(updated);
    this.emitter.emitRowDeleted(row.id, row.month, !row.archived);
    this.emitter.emitRowCreated(row);
    return row;
  ```

  7. dans `remove(id)`, ajouter l'émission après la transaction, en fin de méthode, en réutilisant `existing` (déjà lu en tête de méthode) :

  ```ts
    this.emitter.emitRowDeleted(id, existing.month, existing.archived);
  ```

- [ ] **Étape 8: brancher `RealtimeEmitter` dans `ColumnsService`, `ChoicesService` et `UsersService`**

  Dans `apps/api/src/columns/columns.service.ts` :

  ```ts
  import { RealtimeEmitter } from '../realtime/realtime.emitter';
  ```

  ```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: RealtimeEmitter,
  ) {}
  ```

  Puis, juste avant le `return` de `create(input)` et de `update(id, input)` (méthodes qui retournent un `ColumnDTO`), et à la toute fin de `remove(id, force)` :

  ```ts
    this.emitter.emitConfigChanged('columns');
  ```

  (dans `create` et `update`, placer la ligne avant le `return dto;` ; dans `remove`, après la transaction de suppression.)

  Dans `apps/api/src/choices/choices.service.ts` :

  ```ts
  import { RealtimeEmitter } from '../realtime/realtime.emitter';
  ```

  ```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: RealtimeEmitter,
  ) {}
  ```

  Puis, juste avant le `return` de `create(columnId, input)` et de `update(id, input)`, et à la toute fin de `remove(id)` :

  ```ts
    this.emitter.emitConfigChanged('choices');
  ```

  Décision explicite sur le renommage d'un choix : `ChoicesService.update` met à jour en masse le JSONB des lignes concernées (Feature 3), mais **aucun `row.updated` n'est émis** — relire puis diffuser toutes les lignes touchées serait coûteux et non borné. Le seul événement émis est `config.changed { scope: 'choices' }` ; à sa réception, le client recharge la configuration **et** les lignes de sa room (ce comportement client relève de la Feature 7).

  Dans `apps/api/src/users/users.service.ts` :

  ```ts
  import { RealtimeEmitter } from '../realtime/realtime.emitter';
  ```

  ```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: RealtimeEmitter,
  ) {}
  ```

  Puis, juste avant le `return` de `create(input)` et de `updateMe(userId, input)` :

  ```ts
    this.emitter.emitConfigChanged('users');
  ```

- [ ] **Étape 9: relancer les tests (PASS)**

  ```bash
  pnpm --filter @suivi/api test:unit -- realtime.emitter.spec
  pnpm --filter @suivi/api test:e2e -- realtime.e2e-spec
  ```

  Résultat attendu : **PASS** — `Tests: 10 passed, 10 total` pour l'unitaire et
  `Tests: 25 passed, 25 total` pour l'e2e (9 + 8 + 8).

- [ ] **Étape 10: commit**

  ```bash
  git add apps/api/src/realtime/realtime.emitter.ts apps/api/src/realtime/realtime.emitter.spec.ts apps/api/src/rows/rows.service.ts apps/api/src/columns/columns.service.ts apps/api/src/choices/choices.service.ts apps/api/src/users/users.service.ts apps/api/test/realtime.e2e-spec.ts
  git commit -m "feat: RealtimeEmitter et diffusion des mutations REST (row.* et config.changed)"
  ```

> À vérifier à l'exécution : les noms exacts des méthodes de `UsersService` (Feature 2) — le plan suppose `create` et `updateMe`.

---

### Task 5.7: Vérification complète du périmètre et fin de feature (merge dans `develop`)

**Files:**
- Modify: aucun fichier de code — task de vérification et d'intégration.
- Test: toutes les suites du périmètre (unitaires realtime + e2e realtime) et l'ensemble du monorepo.

**Interfaces:**
- Consomme : tout ce qui a été produit par les Tasks 5.1 à 5.6.
- Produit : `develop` contenant la passerelle temps réel, tests verts, poussée sur GitHub.

- [ ] **Étape 1: relancer les 4 suites unitaires du périmètre**

  ```bash
  pnpm --filter @suivi/api test:unit -- ws-jwt.util.spec locks.service.spec presence.service.spec realtime.emitter.spec
  ```

  Résultat attendu : **PASS** — `Test Suites: 4 passed, 4 total`, `Tests: 40 passed, 40 total`
  (10 ws-jwt + 13 locks + 7 presence + 10 emitter).

- [ ] **Étape 2: relancer la suite e2e temps réel complète**

  ```bash
  pnpm --filter @suivi/api test:e2e -- realtime.e2e-spec
  ```

  Résultat attendu : **PASS** — `Tests: 25 passed, 25 total`. Vérifier qu'aucun
  message `Jest did not exit one second after...` n'apparaît (le `setInterval` du
  balayage est `unref()` et libéré par `onModuleDestroy`).

- [ ] **Étape 3: lancer TOUS les tests du monorepo et le lint**

  ```bash
  pnpm -r test
  pnpm lint
  ```

  Résultat attendu : toutes les suites vertes (`@suivi/shared`, `@suivi/api`
  unitaires + e2e), lint en code 0. **Aucun merge si une seule suite est rouge.**

- [ ] **Étape 4: vérification manuelle du chemin réel (même port, path `/socket.io`)**

  ```bash
  pnpm --filter @suivi/api build
  node apps/api/dist/main.js &
  sleep 3
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3001/socket.io/?EIO=4&transport=polling"
  kill %1
  ```

  Résultat attendu : le build sort en code 0 et le `curl` renvoie `400`
  (Socket.IO répond « Session ID unknown / Bad handshake » sur ce chemin, ce qui
  prouve que le endpoint `/socket.io` est bien servi par le process API sur 3001 —
  un `404` signifierait que la passerelle n'est pas montée).

- [ ] **Étape 5: merge dans `develop` et push**

  ```bash
  git checkout develop && git merge --no-ff feature/realtime-gateway -m "merge: feature/realtime-gateway"
  git push origin develop
  ```

  Résultat attendu : merge sans conflit, `develop` poussé sur GitHub.

---

## Résumé des artefacts produits par la Feature 5

| Élément | Fichier | Signature / rôle |
|---|---|---|
| Cookie du handshake | `apps/api/src/auth/ws-jwt.util.ts` | `AUTH_COOKIE_NAME`, `parseCookieHeader`, `tokenFromHandshake`, `WsJwtPayload`, `WsHandshakeLike` |
| Verrous | `apps/api/src/realtime/locks.service.ts` | `LOCK_TTL_MS`, `Lock`, `AcquireInput`, `AcquireResult`, `LocksService` |
| Présence | `apps/api/src/realtime/presence.service.ts` | `PresenceEntry`, `PresenceService` |
| Passerelle | `apps/api/src/realtime/realtime.gateway.ts` | `SWEEP_INTERVAL_MS`, `RealtimeGateway` (handshake, `room.join`, `cell.focus`, `cell.lock.request`, `cell.lock.release`, disconnect, sweep) |
| Émetteur | `apps/api/src/realtime/realtime.emitter.ts` | `ConfigScope`, `RealtimeEmitter` (`emitRowCreated`, `emitRowUpdated`, `emitRowDeleted`, `emitRowMoved`, `emitConfigChanged`, `setServer`, `roomFor`) |
| Module | `apps/api/src/realtime/realtime.module.ts` | `RealtimeModule` (`@Global()`, exporte `RealtimeEmitter`, `LocksService`, `PresenceService`) |
