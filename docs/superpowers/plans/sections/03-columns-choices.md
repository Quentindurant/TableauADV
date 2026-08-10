# Section 03 — Colonnes & listes de choix

## Feature 3 — Colonnes & listes (CRUD) (branche `feature/columns-choices`)

**But:** exposer le paramétrage du tableau — CRUD complet des colonnes (`/api/columns`) et des valeurs de listes déroulantes (`/api/columns/:id/choices`, `/api/choices/:id`), avec clés slugifiées uniques, réordonnancement transactionnel, garde-fou de suppression de colonne (`COLUMN_HAS_DATA`), propagation d'un renommage de choix dans les lignes existantes, et refus de suppression d'un choix utilisé (`CHOICE_IN_USE`).

**Dépend de:**
- **Feature 0 (socle monorepo)** : workspace pnpm, package `@suivi/api` avec ses scripts `test:unit` (jest, `rootDir: src`, `testRegex: .*\.spec\.ts$`) et `test:e2e` (jest, `apps/api/test/jest-e2e.json`, `testRegex: .e2e-spec.ts$`), `export function setupApp(app: INestApplication): INestApplication` dans `apps/api/src/app.setup.ts` (préfixe global `api` + `cookie-parser`), `export class AppModule {}` dans `apps/api/src/app.module.ts`, base Postgres de dev (`docker-compose.dev.yml`).
- **Feature 1 (schéma + shared)** : migration Prisma appliquée (modèles `Column`, `Choice`, `Row`, enum `ColumnType`), `PrismaService` (`apps/api/src/prisma/prisma.service.ts`) fourni par un `PrismaModule` `@Global()`, package `@suivi/shared` exportant les types `ColumnDTO`, `ChoiceDTO`, `ColumnType`, `ApiError`, `ErrorCode` et les schémas zod `createColumnSchema`, `updateColumnSchema`, `createChoiceSchema`, `updateChoiceSchema`.
- **Feature 2 (auth/users)** : `POST /api/auth/login` qui pose le cookie JWT httpOnly `token`, garde `JwtAuthGuard` exportée par `apps/api/src/auth/jwt.guard.ts`, dépendance `argon2` installée dans `@suivi/api`.

**Ne fait PAS partie de cette feature :** l'émission temps réel `config.changed`. Les services produits ici sont volontairement « purs » (Prisma + logique métier, aucune dépendance socket) ; la Feature 5 injectera `RealtimeEmitter` dans `ColumnsService` et `ChoicesService` sans modifier leur logique.

**Base de données utilisée par les tests e2e :** la base de dev (`DATABASE_URL` de `apps/api/.env`). Les tests e2e de cette feature vident `Row`, `Choice` et `Column` avant chaque test — ne jamais les lancer sur une base contenant des données réelles.

**Commandes de test utilisées dans cette section :**
- unitaires : `pnpm --filter @suivi/api test:unit -- <motif>`
- e2e : `pnpm --filter @suivi/api test:e2e -- <motif>`

(Le script `test` du package enchaîne les deux ; on utilise ici les scripts ciblés pour que le motif de fichier soit transmis au bon jest.)

---

### Task 3.1: Branche de feature + utilitaires `slugify` / `uniqueKey`

- **Files:**
  - Create: `apps/api/src/columns/slugify.ts`
  - Test: `apps/api/src/columns/slugify.spec.ts`
- **Interfaces:**
  - Consomme : rien (fonctions pures, aucun accès base).
  - Produit :
    - `export function slugify(label: string): string` — minuscules, accents retirés (normalisation NFD + suppression des diacritiques), toute suite de caractères non `[a-z0-9]` remplacée par `_`, underscores de tête et de queue supprimés.
    - `export function uniqueKey(base: string, taken: readonly string[]): string` — renvoie `base` s'il est libre, sinon `base_2`, `base_3`… ; si `base` est vide, se rabat sur `colonne`.

- [ ] **Étape 1 : créer la branche de feature (gitflow).**

```bash
git checkout develop && git pull && git checkout -b feature/columns-choices
```

Attendu : `Switched to a new branch 'feature/columns-choices'`, `develop` à jour avec l'origine.

- [ ] **Étape 2 : écrire le test qui échoue.**

Créer `apps/api/src/columns/slugify.spec.ts` :

```ts
import { slugify, uniqueKey } from './slugify';

describe('slugify', () => {
  it('met en minuscules', () => {
    expect(slugify('CLIENT')).toBe('client');
  });

  it('retire les accents', () => {
    expect(slugify('Matériel reçu')).toBe('materiel_recu');
    expect(slugify('Numéro dossier')).toBe('numero_dossier');
  });

  it('remplace les espaces par des underscores', () => {
    expect(slugify('CP CLIENT')).toBe('cp_client');
  });

  it('remplace toute suite de caractères spéciaux par un seul underscore', () => {
    expect(slugify('N° CHRONO')).toBe('n_chrono');
    expect(slugify('PORTA ET COMMENTAIRES  IMPORTANT')).toBe('porta_et_commentaires_important');
  });

  it('supprime les underscores de tête et de queue', () => {
    expect(slugify('  HEURE  ')).toBe('heure');
    expect(slugify('--- Infos ---')).toBe('infos');
  });

  it('renvoie une chaîne vide si le libellé ne contient aucun caractère alphanumérique', () => {
    expect(slugify('***')).toBe('');
  });
});

describe('uniqueKey', () => {
  it('renvoie la base telle quelle si elle est libre', () => {
    expect(uniqueKey('client', ['statut', 'tech'])).toBe('client');
  });

  it('suffixe _2 à la première collision', () => {
    expect(uniqueKey('client', ['client'])).toBe('client_2');
  });

  it('incrémente le suffixe tant que la clé est prise', () => {
    expect(uniqueKey('client', ['client', 'client_2'])).toBe('client_3');
    expect(uniqueKey('client', ['client', 'client_2', 'client_3'])).toBe('client_4');
  });

  it('se rabat sur "colonne" quand la base est vide', () => {
    expect(uniqueKey('', [])).toBe('colonne');
    expect(uniqueKey('', ['colonne'])).toBe('colonne_2');
  });
});
```

- [ ] **Étape 3 : lancer le test.**

```bash
pnpm --filter @suivi/api test:unit -- slugify.spec.ts
```

Attendu : **FAIL** — `Cannot find module './slugify' from 'src/columns/slugify.spec.ts'`.

- [ ] **Étape 4 : implémentation minimale.**

Créer `apps/api/src/columns/slugify.ts` :

```ts
/**
 * Transforme un libellé de colonne en clé technique stable
 * (utilisée comme clé dans le JSONB `Row.data`).
 * Exemple : "Matériel reçu" -> "materiel_recu".
 */
export function slugify(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '');
}

/**
 * Rend la clé unique parmi celles déjà prises : "client", "client_2", "client_3"…
 */
export function uniqueKey(base: string, taken: readonly string[]): string {
  const root = base === '' ? 'colonne' : base;
  if (!taken.includes(root)) {
    return root;
  }
  let suffix = 2;
  while (taken.includes(`${root}_${suffix}`)) {
    suffix += 1;
  }
  return `${root}_${suffix}`;
}
```

- [ ] **Étape 5 : relancer le test.**

```bash
pnpm --filter @suivi/api test:unit -- slugify.spec.ts
```

Attendu : **PASS** — `Tests: 10 passed, 10 total`.

- [ ] **Étape 6 : commit.**

```bash
git add apps/api/src/columns/slugify.ts apps/api/src/columns/slugify.spec.ts
git commit -m "feat: utilitaires slugify et uniqueKey pour les clés de colonnes"
```

---

### Task 3.2: Erreurs API et validation zod — **rien à créer, tout est consommé de la Feature 2**

> Décision figée dans `_contracts.md` § « Erreurs et validation API » : il n'existe
> **qu'un seul** mécanisme d'erreur (`ApiException` + fabriques, livré par la
> Feature 2, Task 2.1) et **qu'un seul** mécanisme de validation
> (`parseOrThrow`, livré par la Feature 2, Task 2.2, dans
> `apps/api/src/common/api-error.ts`). La fonction `apiError()` n'existe pas et
> ne doit pas être créée : elle retournerait une `HttpException` brute, ce qui
> court-circuiterait le `ApiExceptionFilter` global enregistré dans `setupApp`.

- **Files:** aucun. Cette task ne crée, ne modifie et ne teste aucun fichier.
- **Interfaces:**
  - Consomme (Feature 2, `apps/api/src/common/api.exception.ts`) :
    - `class ApiException extends HttpException` — `new ApiException(code: ErrorCode, message: string, status: HttpStatus, details?: unknown)`, champs publics `code`, `userMessage`, `details` ;
    - fabriques `authInvalid()`, `authRequired(message?)`, `validationFailed(message, details?)`, `notFound(message?)`.
  - Consomme (Feature 2, `apps/api/src/common/api-error.ts`) :
    - `function parseOrThrow<T>(schema: ZodType<T>, input: unknown): T` — 422 `VALIDATION_FAILED` avec `details: { path, message }[]`.
  - `zod` est déjà une dépendance de `@suivi/api` (installée en Feature 2, Task 2.1) : aucune installation supplémentaire.

- [ ] **Étape 1 : vérifier que les deux briques sont bien présentes avant de continuer.**

```bash
test -f apps/api/src/common/api.exception.ts && test -f apps/api/src/common/api-error.ts && echo OK
pnpm --filter @suivi/api test:unit -- api-error.spec
```

Attendu : `OK`, puis **PASS** — `Tests: 4 passed, 4 total` (suite livrée par la Feature 2).
Si l'un des deux fichiers manque, la Feature 2 n'est pas mergée : reprendre `develop` avant d'aller plus loin.

**Correspondance à appliquer dans tout le reste de cette section :**

| Besoin | À écrire |
|---|---|
| 404 ressource absente | `throw notFound('Colonne introuvable.')` |
| 422 règle métier / doublon | `throw validationFailed('…')` |
| 409 `COLUMN_HAS_DATA` | `throw new ApiException('COLUMN_HAS_DATA', '…', HttpStatus.CONFLICT, { rowCount })` |
| 409 `CHOICE_IN_USE` | `throw new ApiException('CHOICE_IN_USE', '…', HttpStatus.CONFLICT, { rowCount })` |
| Validation d'un corps ou d'une query | `const input = parseOrThrow(schema, raw)` |

---

### Task 3.3: `GET /api/columns` — module, mappers, service `findAll`, contrôleur, harnais e2e

- **Files:**
  - Create: `apps/api/src/columns/mappers.ts`, `apps/api/src/columns/columns.service.ts`, `apps/api/src/columns/columns.controller.ts`, `apps/api/src/columns/columns.module.ts`, `apps/api/test/helpers/config-test-app.ts`
  - Modify: `apps/api/src/app.module.ts`
  - Test: `apps/api/test/columns.e2e-spec.ts`
- **Interfaces:**
  - Consomme : `PrismaService` (`apps/api/src/prisma/prisma.service.ts`), `JwtAuthGuard` (`apps/api/src/auth/jwt.guard.ts`), `setupApp` (`apps/api/src/app.setup.ts`), types `ColumnDTO`/`ChoiceDTO`/`ColumnType` de `@suivi/shared`, route `POST /api/auth/login` (Feature 2).
  - Produit :
    - `export function toChoiceDTO(choice: Choice): ChoiceDTO` et `export function toColumnDTO(column: Column & { choices?: Choice[] }): ColumnDTO` (`apps/api/src/columns/mappers.ts`) — réutilisés par le module choices.
    - `export class ColumnsService { findAll(): Promise<ColumnDTO[]> }` (`apps/api/src/columns/columns.service.ts`).
    - `export class ColumnsController` (`apps/api/src/columns/columns.controller.ts`) monté sur `columns`, protégé par `JwtAuthGuard`.
    - `export class ColumnsModule {}` importé par `AppModule`.
    - Harnais e2e (`apps/api/test/helpers/config-test-app.ts`) :
      `export interface ConfigTestContext { app: INestApplication; prisma: PrismaService; cookie: string }`,
      `export function createConfigTestContext(): Promise<ConfigTestContext>`,
      `export function resetConfigTables(prisma: PrismaService): Promise<void>`,
      `export function closeConfigTestContext(ctx: ConfigTestContext): Promise<void>` — réutilisé par `choices.e2e-spec.ts` (Tasks 3.7–3.9).

- [ ] **Étape 1 : écrire le harnais e2e.**

Créer `apps/api/test/helpers/config-test-app.ts` :

```ts
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';
import { PrismaService } from '../../src/prisma/prisma.service';

const TEST_EMAIL = 'config.e2e@test.fr';
const TEST_PASSWORD = 'motdepasse-test';

export interface ConfigTestContext {
  app: INestApplication;
  prisma: PrismaService;
  cookie: string;
}

/**
 * Démarre l'application complète (même configuration HTTP que la prod via setupApp),
 * crée un utilisateur de test et récupère le cookie JWT `token` par un vrai login.
 */
export async function createConfigTestContext(): Promise<ConfigTestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = setupApp(moduleRef.createNestApplication());
  await app.init();

  const prisma = app.get(PrismaService);
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      passwordHash: await argon2.hash(TEST_PASSWORD),
      displayName: 'Testeur configuration',
      cursorColor: '#3498DB',
    },
  });

  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

  if (login.status !== 200) {
    throw new Error(
      `Login de test impossible (statut ${login.status}) — vérifier POST /api/auth/login (Feature 2).`,
    );
  }

  const rawCookies = login.headers['set-cookie'] as unknown as string[];
  const cookie = rawCookies.map((value) => value.split(';')[0]).join('; ');

  return { app, prisma, cookie };
}

/** Vide les tables de configuration et les lignes (isolation entre tests). */
export async function resetConfigTables(prisma: PrismaService): Promise<void> {
  await prisma.row.deleteMany();
  await prisma.choice.deleteMany();
  await prisma.column.deleteMany();
}

export async function closeConfigTestContext(ctx: ConfigTestContext): Promise<void> {
  await resetConfigTables(ctx.prisma);
  await ctx.prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await ctx.app.close();
}
```

- [ ] **Étape 2 : écrire le test e2e qui échoue.**

Créer `apps/api/test/columns.e2e-spec.ts` :

```ts
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { ColumnDTO } from '@suivi/shared';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  closeConfigTestContext,
  createConfigTestContext,
  resetConfigTables,
  type ConfigTestContext,
} from './helpers/config-test-app';

jest.setTimeout(30_000);

describe('Colonnes (e2e)', () => {
  let ctx: ConfigTestContext;
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;

  beforeAll(async () => {
    ctx = await createConfigTestContext();
    app = ctx.app;
    prisma = ctx.prisma;
    cookie = ctx.cookie;
  });

  beforeEach(async () => {
    await resetConfigTables(prisma);
  });

  afterAll(async () => {
    await closeConfigTestContext(ctx);
  });

  describe('GET /api/columns', () => {
    it('refuse un appel sans cookie (401)', async () => {
      const res = await request(app.getHttpServer()).get('/api/columns');
      expect(res.status).toBe(401);
    });

    it('renvoie un tableau vide quand aucune colonne n’existe', async () => {
      const res = await request(app.getHttpServer()).get('/api/columns').set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('trie les colonnes par position et les choix par position', async () => {
      await prisma.column.create({
        data: { key: 'client', label: 'CLIENT', type: 'TEXT', position: 1, width: 200 },
      });
      await prisma.column.create({
        data: {
          key: 'statut',
          label: 'INSTALLATION',
          type: 'SELECT',
          position: 0,
          width: 150,
          choices: {
            create: [
              { label: 'CLOTUREE', position: 1, bgColor: '#A6A6A6', textColor: '#ABEBC6' },
              { label: 'NEW', position: 0, bgColor: '#FFFF00', textColor: '#FF0000', bold: true },
            ],
          },
        },
      });

      const res = await request(app.getHttpServer()).get('/api/columns').set('Cookie', cookie);

      expect(res.status).toBe(200);
      const columns = res.body as ColumnDTO[];
      expect(columns.map((c) => c.key)).toEqual(['statut', 'client']);
      expect(columns[0].choices.map((c) => c.label)).toEqual(['NEW', 'CLOTUREE']);
      expect(columns[0].choices[0]).toMatchObject({
        label: 'NEW',
        bgColor: '#FFFF00',
        textColor: '#FF0000',
        bold: true,
        position: 0,
        archived: false,
      });
      expect(columns[1]).toMatchObject({
        key: 'client',
        label: 'CLIENT',
        type: 'TEXT',
        position: 1,
        width: 200,
        visible: true,
        choices: [],
      });
    });
  });
});
```

- [ ] **Étape 3 : lancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- columns.e2e-spec.ts
```

Attendu : **FAIL** — erreur de compilation ts-jest `Cannot find module '../../src/...'` pour les fichiers du module colonnes, ou, une fois compilé, `404` sur `GET /api/columns` (la route n'existe pas).

- [ ] **Étape 4 : implémenter les mappers.**

Créer `apps/api/src/columns/mappers.ts` :

```ts
import type { Choice, Column } from '@prisma/client';
import type { ChoiceDTO, ColumnDTO, ColumnType } from '@suivi/shared';

export function toChoiceDTO(choice: Choice): ChoiceDTO {
  return {
    id: choice.id,
    columnId: choice.columnId,
    label: choice.label,
    bgColor: choice.bgColor,
    textColor: choice.textColor,
    bold: choice.bold,
    position: choice.position,
    archived: choice.archived,
  };
}

export function toColumnDTO(column: Column & { choices?: Choice[] }): ColumnDTO {
  return {
    id: column.id,
    key: column.key,
    label: column.label,
    type: column.type as ColumnType,
    position: column.position,
    width: column.width,
    visible: column.visible,
    choices: (column.choices ?? []).map(toChoiceDTO),
  };
}
```

- [ ] **Étape 5 : implémenter le service, le contrôleur et le module.**

Créer `apps/api/src/columns/columns.service.ts` :

```ts
import { Injectable } from '@nestjs/common';
import type { ColumnDTO } from '@suivi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toColumnDTO } from './mappers';

@Injectable()
export class ColumnsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<ColumnDTO[]> {
    const columns = await this.prisma.column.findMany({
      orderBy: { position: 'asc' },
      include: { choices: { orderBy: { position: 'asc' } } },
    });
    return columns.map(toColumnDTO);
  }
}
```

Créer `apps/api/src/columns/columns.controller.ts` :

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { ColumnDTO } from '@suivi/shared';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { ColumnsService } from './columns.service';

@Controller('columns')
@UseGuards(JwtAuthGuard)
export class ColumnsController {
  constructor(private readonly columns: ColumnsService) {}

  @Get()
  findAll(): Promise<ColumnDTO[]> {
    return this.columns.findAll();
  }
}
```

Créer `apps/api/src/columns/columns.module.ts` :

```ts
import { Module } from '@nestjs/common';
import { ColumnsController } from './columns.controller';
import { ColumnsService } from './columns.service';

@Module({
  controllers: [ColumnsController],
  providers: [ColumnsService],
  exports: [ColumnsService],
})
export class ColumnsModule {}
```

- [ ] **Étape 6 : enregistrer le module dans `AppModule`.**

Remplacer `apps/api/src/app.module.ts` par (contenu complet à ce point du plan — Features 0 à 3) :

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ColumnsModule } from './columns/columns.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, HealthModule, AuthModule, UsersModule, ColumnsModule],
})
export class AppModule {}
```

- [ ] **Étape 7 : relancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- columns.e2e-spec.ts
```

Attendu : **PASS** — `Tests: 3 passed, 3 total`.

- [ ] **Étape 8 : commit.**

```bash
git add apps/api/src/columns apps/api/src/app.module.ts apps/api/test/columns.e2e-spec.ts apps/api/test/helpers/config-test-app.ts
git commit -m "feat: GET /api/columns (module colonnes, mappers DTO, harnais e2e)"
```

> À vérifier à l'exécution : le nom exact de la classe exportée par `apps/api/src/auth/jwt.guard.ts` (Feature 2) — le plan suppose `JwtAuthGuard`. Si la Feature 2 l'enregistre déjà globalement via `APP_GUARD`, le `@UseGuards` local reste valide (simple redondance).

---

### Task 3.4: `POST /api/columns` — clé slugifiée unique, position `max+1`, largeur 150

- **Files:**
  - Modify: `apps/api/src/columns/columns.service.ts`, `apps/api/src/columns/columns.controller.ts`, `apps/api/test/columns.e2e-spec.ts`
- **Interfaces:**
  - Consomme : `slugify` / `uniqueKey` (Task 3.1), `parseOrThrow` (Task 3.2), `createColumnSchema` (`@suivi/shared`, Feature 1 : `{ label: string; type: ColumnType }`).
  - Produit :
    - `export interface CreateColumnInput { label: string; type: ColumnType }`
    - `ColumnsService.create(input: CreateColumnInput): Promise<ColumnDTO>` — clé = `uniqueKey(slugify(label), clés existantes)`, `position = max(position) + 1` (0 si table vide), `width = 150`, `visible = true`, le tout dans une transaction.
    - Route `POST /api/columns` → `201 ColumnDTO`, `422 VALIDATION_FAILED` si le corps est invalide.

- [ ] **Étape 1 : écrire les tests qui échouent.**

Ajouter dans `apps/api/test/columns.e2e-spec.ts`, à l'intérieur du `describe('Colonnes (e2e)')` et après le bloc `describe('GET /api/columns')`, le bloc suivant :

```ts
  describe('POST /api/columns', () => {
    it('refuse un appel sans cookie (401)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/columns')
        .send({ label: 'CLIENT', type: 'TEXT' });

      expect(res.status).toBe(401);
    });

    it('crée la première colonne avec key slugifiée, position 0 et largeur 150', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: 'CP CLIENT', type: 'TEXT' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        key: 'cp_client',
        label: 'CP CLIENT',
        type: 'TEXT',
        position: 0,
        width: 150,
        visible: true,
        choices: [],
      });
      expect(typeof (res.body as ColumnDTO).id).toBe('string');
    });

    it('retire les accents de la clé', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: 'Matériel reçu', type: 'SELECT' });

      expect(res.status).toBe(201);
      expect((res.body as ColumnDTO).key).toBe('materiel_recu');
    });

    it('place chaque nouvelle colonne en dernière position (max + 1)', async () => {
      await prisma.column.create({
        data: { key: 'client', label: 'CLIENT', type: 'TEXT', position: 4, width: 150 },
      });

      const res = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: 'TECH', type: 'SELECT' });

      expect(res.status).toBe(201);
      expect((res.body as ColumnDTO).position).toBe(5);
    });

    it('suffixe la clé en cas de collision (_2 puis _3)', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: 'CLIENT', type: 'TEXT' });
      const second = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: 'Client', type: 'TEXT' });
      const third = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: 'client', type: 'TEXT' });

      expect([first.status, second.status, third.status]).toEqual([201, 201, 201]);
      expect((first.body as ColumnDTO).key).toBe('client');
      expect((second.body as ColumnDTO).key).toBe('client_2');
      expect((third.body as ColumnDTO).key).toBe('client_3');
    });

    it('se rabat sur la clé "colonne" quand le libellé n’a aucun caractère alphanumérique', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: '***', type: 'TEXT' });

      expect(res.status).toBe(201);
      expect((res.body as ColumnDTO).key).toBe('colonne');
    });

    it('refuse un type hors enum (422 VALIDATION_FAILED)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: 'CASE À COCHER', type: 'CHECKBOX' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toBe('Données invalides.');
    });

    it('refuse un libellé vide (422 VALIDATION_FAILED)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: '   ', type: 'TEXT' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });
```

- [ ] **Étape 2 : lancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- columns.e2e-spec.ts
```

Attendu : **FAIL** — les 7 nouveaux tests authentifiés renvoient `404` (la route `POST /api/columns` n'existe pas) ; seul le test 401 passe.

- [ ] **Étape 3 : implémenter la création dans le service.**

Remplacer `apps/api/src/columns/columns.service.ts` par (fichier complet) :

```ts
import { Injectable } from '@nestjs/common';
import type { ColumnDTO, ColumnType } from '@suivi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toColumnDTO } from './mappers';
import { slugify, uniqueKey } from './slugify';

export interface CreateColumnInput {
  label: string;
  type: ColumnType;
}

const DEFAULT_WIDTH = 150;

@Injectable()
export class ColumnsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<ColumnDTO[]> {
    const columns = await this.prisma.column.findMany({
      orderBy: { position: 'asc' },
      include: { choices: { orderBy: { position: 'asc' } } },
    });
    return columns.map(toColumnDTO);
  }

  async create(input: CreateColumnInput): Promise<ColumnDTO> {
    const label = input.label.trim();

    const created = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.column.findMany({ select: { key: true } });
      const key = uniqueKey(
        slugify(label),
        existing.map((column) => column.key),
      );
      const aggregate = await tx.column.aggregate({ _max: { position: true } });
      const position = (aggregate._max.position ?? -1) + 1;

      return tx.column.create({
        data: {
          key,
          label,
          type: input.type,
          position,
          width: DEFAULT_WIDTH,
          visible: true,
        },
        include: { choices: { orderBy: { position: 'asc' } } },
      });
    });

    return toColumnDTO(created);
  }
}
```

- [ ] **Étape 4 : brancher la route sur le contrôleur.**

Remplacer `apps/api/src/columns/columns.controller.ts` par (fichier complet) :

```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { createColumnSchema, type ColumnDTO } from '@suivi/shared';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { parseOrThrow } from '../common/api-error';
import { ColumnsService } from './columns.service';

@Controller('columns')
@UseGuards(JwtAuthGuard)
export class ColumnsController {
  constructor(private readonly columns: ColumnsService) {}

  @Get()
  findAll(): Promise<ColumnDTO[]> {
    return this.columns.findAll();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<ColumnDTO> {
    return this.columns.create(parseOrThrow(createColumnSchema, body));
  }
}
```

- [ ] **Étape 5 : relancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- columns.e2e-spec.ts
```

Attendu : **PASS** — `Tests: 11 passed, 11 total`.

- [ ] **Étape 6 : commit.**

```bash
git add apps/api/src/columns apps/api/test/columns.e2e-spec.ts
git commit -m "feat: POST /api/columns (clé slugifiée unique, position max+1, largeur 150)"
```

---

### Task 3.5: `PATCH /api/columns/:id` — libellé, type, largeur, visibilité et réordonnancement transactionnel

- **Files:**
  - Modify: `apps/api/src/columns/columns.service.ts`, `apps/api/src/columns/columns.controller.ts`, `apps/api/test/columns.e2e-spec.ts`
- **Interfaces:**
  - Consomme : `updateColumnSchema` (`@suivi/shared` : `{ label?, type?, position?, width?, visible? }`), `ColumnType` (`@suivi/shared`), `ApiException` / `notFound` / `validationFailed` (Feature 2, Task 2.1) et `parseOrThrow` (Feature 2, Task 2.2).
  - Produit :
    - `export interface UpdateColumnInput { label?: string; type?: ColumnType; position?: number; width?: number; visible?: boolean }`
    - `ColumnsService.update(id: string, input: UpdateColumnInput): Promise<ColumnDTO>` — `404 NOT_FOUND` si l'id n'existe pas ; le renommage **ne change jamais la `key`** (les valeurs des lignes sont indexées par `key` dans le JSONB) ; le **changement de type est toujours accepté et persiste le nouveau `type` sans convertir les valeurs des lignes** (les valeurs stockées dans le JSONB sont conservées telles quelles et réinterprétées par le nouveau type) ; le changement de position décale les autres colonnes dans une transaction, position cible bornée à `[0, nombre de colonnes - 1]`.
    - Route `PATCH /api/columns/:id` → `200 ColumnDTO`.

- [ ] **Étape 1 : écrire les tests qui échouent.**

Ajouter dans `apps/api/test/columns.e2e-spec.ts`, après le bloc `describe('POST /api/columns')` :

```ts
  describe('PATCH /api/columns/:id', () => {
    async function seedThreeColumns(): Promise<string[]> {
      const a = await prisma.column.create({
        data: { key: 'impe', label: 'IMPE', type: 'DATE', position: 0, width: 150 },
      });
      const b = await prisma.column.create({
        data: { key: 'client', label: 'CLIENT', type: 'TEXT', position: 1, width: 150 },
      });
      const c = await prisma.column.create({
        data: { key: 'dpt', label: 'DPT', type: 'TEXT', position: 2, width: 150 },
      });
      return [a.id, b.id, c.id];
    }

    async function keysInOrder(): Promise<string[]> {
      const columns = await prisma.column.findMany({ orderBy: { position: 'asc' } });
      return columns.map((column) => column.key);
    }

    it('renomme la colonne sans changer sa clé', async () => {
      const [, clientId] = await seedThreeColumns();

      const res = await request(app.getHttpServer())
        .patch(`/api/columns/${clientId}`)
        .set('Cookie', cookie)
        .send({ label: 'CLIENT FINAL' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ key: 'client', label: 'CLIENT FINAL' });
    });

    it('met à jour largeur et visibilité', async () => {
      const [impeId] = await seedThreeColumns();

      const res = await request(app.getHttpServer())
        .patch(`/api/columns/${impeId}`)
        .set('Cookie', cookie)
        .send({ width: 240, visible: false });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ width: 240, visible: false, position: 0 });
    });

    it('change le type d’une colonne remplie sans toucher aux valeurs des lignes', async () => {
      const [, clientId] = await seedThreeColumns();
      const row = await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { client: '12345' } },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/columns/${clientId}`)
        .set('Cookie', cookie)
        .send({ type: 'NUMBER' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ key: 'client', type: 'NUMBER' });

      // Les valeurs déjà saisies sont conservées telles quelles (aucune conversion).
      const reloaded = await prisma.row.findUniqueOrThrow({ where: { id: row.id } });
      expect((reloaded.data as Record<string, unknown>).client).toBe('12345');
    });

    it('déplace une colonne vers le haut et décale les autres', async () => {
      const [, , dptId] = await seedThreeColumns();

      const res = await request(app.getHttpServer())
        .patch(`/api/columns/${dptId}`)
        .set('Cookie', cookie)
        .send({ position: 0 });

      expect(res.status).toBe(200);
      expect((res.body as ColumnDTO).position).toBe(0);
      expect(await keysInOrder()).toEqual(['dpt', 'impe', 'client']);
    });

    it('déplace une colonne vers le bas et décale les autres', async () => {
      const [impeId] = await seedThreeColumns();

      const res = await request(app.getHttpServer())
        .patch(`/api/columns/${impeId}`)
        .set('Cookie', cookie)
        .send({ position: 2 });

      expect(res.status).toBe(200);
      expect((res.body as ColumnDTO).position).toBe(2);
      expect(await keysInOrder()).toEqual(['client', 'dpt', 'impe']);
    });

    it('borne une position cible trop grande à la dernière place', async () => {
      const [impeId] = await seedThreeColumns();

      const res = await request(app.getHttpServer())
        .patch(`/api/columns/${impeId}`)
        .set('Cookie', cookie)
        .send({ position: 99 });

      expect(res.status).toBe(200);
      expect((res.body as ColumnDTO).position).toBe(2);
      expect(await keysInOrder()).toEqual(['client', 'dpt', 'impe']);
    });

    it('renvoie 404 NOT_FOUND pour un id inconnu', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/columns/col_inexistante')
        .set('Cookie', cookie)
        .send({ label: 'PEU IMPORTE' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Colonne introuvable.');
    });

    it('refuse une largeur non entière (422 VALIDATION_FAILED)', async () => {
      const [impeId] = await seedThreeColumns();

      const res = await request(app.getHttpServer())
        .patch(`/api/columns/${impeId}`)
        .set('Cookie', cookie)
        .send({ width: 150.5 });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });
```

- [ ] **Étape 2 : lancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- columns.e2e-spec.ts
```

Attendu : **FAIL** — les 8 nouveaux tests renvoient `404` avec le corps par défaut de Nest (`{ statusCode: 404, ... }`, donc `res.body.code` vaut `undefined`) : la route `PATCH /api/columns/:id` n'existe pas.

- [ ] **Étape 3 : implémenter `update` dans le service.**

Ajouter dans `apps/api/src/columns/columns.service.ts` — l'import de `HttpStatus` et des helpers d'erreur de la Feature 2 en tête de fichier :

```ts
import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException, notFound } from '../common/api.exception';
import type { ColumnType } from '@suivi/shared';
```

l'interface d'entrée à côté de `CreateColumnInput` :

```ts
export interface UpdateColumnInput {
  label?: string;
  type?: ColumnType;
  position?: number;
  width?: number;
  visible?: boolean;
}
```

et la méthode suivante dans la classe `ColumnsService` :

```ts
  async update(id: string, input: UpdateColumnInput): Promise<ColumnDTO> {
    const existing = await this.prisma.column.findUnique({ where: { id } });
    if (!existing) {
      throw notFound('Colonne introuvable.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let targetPosition: number | undefined;

      if (input.position !== undefined && input.position !== existing.position) {
        const total = await tx.column.count();
        const from = existing.position;
        const to = Math.min(Math.max(input.position, 0), total - 1);

        if (to < from) {
          // Décalage vers la droite des colonnes situées entre la cible et l'ancienne place.
          await tx.column.updateMany({
            where: { id: { not: id }, position: { gte: to, lt: from } },
            data: { position: { increment: 1 } },
          });
        } else if (to > from) {
          // Décalage vers la gauche des colonnes situées entre l'ancienne place et la cible.
          await tx.column.updateMany({
            where: { id: { not: id }, position: { gt: from, lte: to } },
            data: { position: { decrement: 1 } },
          });
        }
        targetPosition = to;
      }

      return tx.column.update({
        where: { id },
        data: {
          // La clé n'est jamais recalculée : les valeurs des lignes sont indexées par `key`.
          ...(input.label !== undefined ? { label: input.label.trim() } : {}),
          // Le type est toujours modifiable : on persiste le nouveau type sans
          // convertir les valeurs déjà stockées (elles restent telles quelles et
          // sont réinterprétées par le nouveau type à l'affichage).
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.width !== undefined ? { width: input.width } : {}),
          ...(input.visible !== undefined ? { visible: input.visible } : {}),
          ...(targetPosition !== undefined ? { position: targetPosition } : {}),
        },
        include: { choices: { orderBy: { position: 'asc' } } },
      });
    });

    return toColumnDTO(updated);
  }
```

- [ ] **Étape 4 : brancher la route sur le contrôleur.**

Dans `apps/api/src/columns/columns.controller.ts`, compléter l'import Nest et ajouter la méthode :

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { createColumnSchema, updateColumnSchema, type ColumnDTO } from '@suivi/shared';
```

```ts
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<ColumnDTO> {
    return this.columns.update(id, parseOrThrow(updateColumnSchema, body));
  }
```

- [ ] **Étape 5 : relancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- columns.e2e-spec.ts
```

Attendu : **PASS** — `Tests: 19 passed, 19 total`.

- [ ] **Étape 6 : commit.**

```bash
git add apps/api/src/columns apps/api/test/columns.e2e-spec.ts
git commit -m "feat: PATCH /api/columns/:id (libellé, type, largeur, visibilité, réordonnancement transactionnel)"
```

---

### Task 3.6: `DELETE /api/columns/:id` — garde-fou `COLUMN_HAS_DATA`, `?force=true`, purge du JSONB

- **Files:**
  - Modify: `apps/api/src/columns/columns.service.ts`, `apps/api/src/columns/columns.controller.ts`, `apps/api/test/columns.e2e-spec.ts`
- **Interfaces:**
  - Consomme : `ApiException` / `notFound` (Feature 2, Task 2.1), `PrismaService.$queryRaw` / `$executeRaw`.
  - Produit :
    - `ColumnsService.countRowsWithValue(key: string): Promise<number>` — nombre de lignes dont `data->>key` est non nul et non vide.
    - `ColumnsService.remove(id: string, force: boolean): Promise<void>` — `404 NOT_FOUND` si inconnue ; `409 COLUMN_HAS_DATA` si des lignes portent une valeur et `force` est faux ; sinon, dans une transaction : retrait de la clé dans `Row.data` de toutes les lignes (opérateur jsonb `-`) puis suppression de la colonne (les `Choice` partent en cascade via le schéma Prisma).
    - Route `DELETE /api/columns/:id[?force=true]` → `204` sans corps.

- [ ] **Étape 1 : écrire les tests qui échouent.**

Ajouter dans `apps/api/test/columns.e2e-spec.ts`, après le bloc `describe('PATCH /api/columns/:id')` :

```ts
  describe('DELETE /api/columns/:id', () => {
    it('supprime une colonne sans données (204)', async () => {
      const column = await prisma.column.create({
        data: { key: 'num_chrono', label: 'N° CHRONO', type: 'TEXT', position: 0, width: 150 },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/columns/${column.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(204);
      expect(await prisma.column.count()).toBe(0);
    });

    it('refuse la suppression quand une ligne porte une valeur (409 COLUMN_HAS_DATA)', async () => {
      const column = await prisma.column.create({
        data: { key: 'client', label: 'CLIENT', type: 'TEXT', position: 0, width: 150 },
      });
      await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { client: 'ARCADIA' } },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/columns/${column.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('COLUMN_HAS_DATA');
      expect(res.body.message).toContain('CLIENT');
      expect(res.body.details).toEqual({ rowCount: 1 });
      expect(await prisma.column.count()).toBe(1);
    });

    it('ne considère pas une valeur vide comme une donnée', async () => {
      const column = await prisma.column.create({
        data: { key: 'client', label: 'CLIENT', type: 'TEXT', position: 0, width: 150 },
      });
      await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { client: '', statut: 'NEW' } },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/columns/${column.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(204);
    });

    it('supprime avec ?force=true et retire la clé des données de toutes les lignes', async () => {
      const column = await prisma.column.create({
        data: { key: 'client', label: 'CLIENT', type: 'TEXT', position: 0, width: 150 },
      });
      const first = await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { client: 'ARCADIA', statut: 'NEW' } },
      });
      const second = await prisma.row.create({
        data: { month: '2026-09', position: 0, data: { client: 'BETA', statut: 'CLOTUREE' } },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/columns/${column.id}?force=true`)
        .set('Cookie', cookie);

      expect(res.status).toBe(204);
      expect(await prisma.column.count()).toBe(0);
      const rows = await prisma.row.findMany({
        where: { id: { in: [first.id, second.id] } },
        orderBy: { month: 'asc' },
      });
      expect(rows[0].data).toEqual({ statut: 'NEW' });
      expect(rows[1].data).toEqual({ statut: 'CLOTUREE' });
    });

    it('supprime aussi les choix de la colonne (cascade)', async () => {
      const column = await prisma.column.create({
        data: {
          key: 'statut',
          label: 'INSTALLATION',
          type: 'SELECT',
          position: 0,
          width: 150,
          choices: { create: [{ label: 'NEW', position: 0 }, { label: 'CLOTUREE', position: 1 }] },
        },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/columns/${column.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(204);
      expect(await prisma.choice.count()).toBe(0);
    });

    it('renvoie 404 NOT_FOUND pour un id inconnu', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/columns/col_inexistante')
        .set('Cookie', cookie);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });
```

- [ ] **Étape 2 : lancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- columns.e2e-spec.ts
```

Attendu : **FAIL** — les 6 nouveaux tests reçoivent `404` sans code d'erreur applicatif (route `DELETE /api/columns/:id` absente).

- [ ] **Étape 3 : implémenter `countRowsWithValue` et `remove`.**

Ajouter les deux méthodes suivantes dans `apps/api/src/columns/columns.service.ts` :

```ts
  /** Nombre de lignes dont la colonne porte une valeur non vide. */
  async countRowsWithValue(key: string): Promise<number> {
    const result = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM "Row"
      WHERE "data" ->> ${key}::text IS NOT NULL
        AND "data" ->> ${key}::text <> ''
    `;
    return result[0]?.count ?? 0;
  }

  async remove(id: string, force: boolean): Promise<void> {
    const existing = await this.prisma.column.findUnique({ where: { id } });
    if (!existing) {
      throw notFound('Colonne introuvable.');
    }

    if (!force) {
      const rowCount = await this.countRowsWithValue(existing.key);
      if (rowCount > 0) {
        throw new ApiException(
          'COLUMN_HAS_DATA',
          `La colonne « ${existing.label} » contient des données sur ${rowCount} ligne(s). Confirmez la suppression pour effacer aussi ces valeurs.`,
          HttpStatus.CONFLICT,
          { rowCount },
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // Opérateur jsonb "-" : retire la clé de l'objet `data` de chaque ligne.
      await tx.$executeRaw`
        UPDATE "Row"
        SET "data" = "data" - ${existing.key}::text
      `;
      await tx.column.delete({ where: { id } });
    });
  }
```

- [ ] **Étape 4 : brancher la route sur le contrôleur.**

Dans `apps/api/src/columns/columns.controller.ts`, compléter l'import Nest avec `Delete` et `Query`, puis ajouter :

```ts
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Query('force') force?: string): Promise<void> {
    await this.columns.remove(id, force === 'true');
  }
```

- [ ] **Étape 5 : relancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- columns.e2e-spec.ts
```

Attendu : **PASS** — `Tests: 24 passed, 24 total`.

- [ ] **Étape 6 : commit.**

```bash
git add apps/api/src/columns apps/api/test/columns.e2e-spec.ts
git commit -m "feat: DELETE /api/columns/:id (409 COLUMN_HAS_DATA, ?force=true, purge jsonb)"
```

> À vérifier à l'exécution : les requêtes `$queryRaw` / `$executeRaw` supposent les noms de table et de colonne générés par défaut par Prisma (`"Row"`, `"data"`, type `jsonb`) — aucun `@@map`/`@map` n'est présent dans le schéma des contrats. Vérifier aussi que `COUNT(*)::int` renvoie bien un `number` (et non un `BigInt`) dans le driver utilisé ; le cast `::int` est là pour cela.

---

### Task 3.7: `POST /api/columns/:id/choices` — module choix, contrôle du type `SELECT`, doublons

- **Files:**
  - Create: `apps/api/src/choices/choices.service.ts`, `apps/api/src/choices/choices.controller.ts`, `apps/api/src/choices/column-choices.controller.ts`, `apps/api/src/choices/choices.module.ts`
  - Modify: `apps/api/src/app.module.ts`
  - Test: `apps/api/test/choices.e2e-spec.ts`
- **Interfaces:**
  - Consomme : `PrismaService`, `JwtAuthGuard`, `ApiException` / `notFound` / `validationFailed` (Feature 2, Task 2.1) et `parseOrThrow` (Feature 2, Task 2.2), `toChoiceDTO` (`apps/api/src/columns/mappers.ts`, Task 3.3), `createChoiceSchema` (`@suivi/shared` : `{ label, bgColor?, textColor?, bold? }`), harnais e2e (Task 3.3).
  - Produit :
    - `export interface CreateChoiceInput { label: string; bgColor?: string; textColor?: string; bold?: boolean }`
    - `export class ChoicesService { create(columnId: string, input: CreateChoiceInput): Promise<ChoiceDTO> }`
    - `export class ColumnChoicesController` (`@Controller('columns/:columnId/choices')`) et `export class ChoicesController` (`@Controller('choices')`, complété aux Tasks 3.8–3.9), `export class ChoicesModule {}` importé par `AppModule`.

- [ ] **Étape 1 : écrire le test e2e qui échoue.**

Créer `apps/api/test/choices.e2e-spec.ts` :

```ts
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { ChoiceDTO } from '@suivi/shared';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  closeConfigTestContext,
  createConfigTestContext,
  resetConfigTables,
  type ConfigTestContext,
} from './helpers/config-test-app';

jest.setTimeout(30_000);

describe('Choix de listes (e2e)', () => {
  let ctx: ConfigTestContext;
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;

  beforeAll(async () => {
    ctx = await createConfigTestContext();
    app = ctx.app;
    prisma = ctx.prisma;
    cookie = ctx.cookie;
  });

  beforeEach(async () => {
    await resetConfigTables(prisma);
  });

  afterAll(async () => {
    await closeConfigTestContext(ctx);
  });

  /** Crée la colonne SELECT « INSTALLATION » (clé `statut`) et renvoie son id. */
  async function createSelectColumn(): Promise<string> {
    const column = await prisma.column.create({
      data: { key: 'statut', label: 'INSTALLATION', type: 'SELECT', position: 0, width: 150 },
    });
    return column.id;
  }

  describe('POST /api/columns/:columnId/choices', () => {
    it('refuse un appel sans cookie (401)', async () => {
      const columnId = await createSelectColumn();

      const res = await request(app.getHttpServer())
        .post(`/api/columns/${columnId}/choices`)
        .send({ label: 'NEW' });

      expect(res.status).toBe(401);
    });

    it('crée un choix avec couleurs, gras et position 0 puis 1', async () => {
      const columnId = await createSelectColumn();

      const first = await request(app.getHttpServer())
        .post(`/api/columns/${columnId}/choices`)
        .set('Cookie', cookie)
        .send({ label: 'NEW', bgColor: '#FFFF00', textColor: '#FF0000', bold: true });
      const second = await request(app.getHttpServer())
        .post(`/api/columns/${columnId}/choices`)
        .set('Cookie', cookie)
        .send({ label: 'STAGING' });

      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        columnId,
        label: 'NEW',
        bgColor: '#FFFF00',
        textColor: '#FF0000',
        bold: true,
        position: 0,
        archived: false,
      });
      expect(second.status).toBe(201);
      expect(second.body).toMatchObject({
        label: 'STAGING',
        bgColor: null,
        textColor: null,
        bold: false,
        position: 1,
      });
    });

    it('refuse un choix sur une colonne qui n’est pas de type SELECT (422)', async () => {
      const column = await prisma.column.create({
        data: { key: 'client', label: 'CLIENT', type: 'TEXT', position: 0, width: 150 },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/columns/${column.id}/choices`)
        .set('Cookie', cookie)
        .send({ label: 'ARCADIA' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toContain('CLIENT');
      expect(await prisma.choice.count()).toBe(0);
    });

    it('refuse un libellé déjà présent dans la liste (422)', async () => {
      const columnId = await createSelectColumn();
      await request(app.getHttpServer())
        .post(`/api/columns/${columnId}/choices`)
        .set('Cookie', cookie)
        .send({ label: 'NEW' });

      const res = await request(app.getHttpServer())
        .post(`/api/columns/${columnId}/choices`)
        .set('Cookie', cookie)
        .send({ label: '  NEW  ' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toContain('NEW');
      expect(await prisma.choice.count()).toBe(1);
    });

    it('renvoie 404 NOT_FOUND si la colonne n’existe pas', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/columns/col_inexistante/choices')
        .set('Cookie', cookie)
        .send({ label: 'NEW' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Colonne introuvable.');
    });

    it('refuse un libellé vide (422 VALIDATION_FAILED)', async () => {
      const columnId = await createSelectColumn();

      const res = await request(app.getHttpServer())
        .post(`/api/columns/${columnId}/choices`)
        .set('Cookie', cookie)
        .send({ label: '   ' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toBe('Données invalides.');
    });
  });
});
```

- [ ] **Étape 2 : lancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- choices.e2e-spec.ts
```

Attendu : **FAIL** — `404` sur toutes les requêtes authentifiées (aucune route `/api/columns/:columnId/choices`).

- [ ] **Étape 3 : implémenter le service.**

Créer `apps/api/src/choices/choices.service.ts` :

```ts
import { HttpStatus, Injectable } from '@nestjs/common';
import type { ChoiceDTO } from '@suivi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException, notFound, validationFailed } from '../common/api.exception';
import { toChoiceDTO } from '../columns/mappers';

export interface CreateChoiceInput {
  label: string;
  bgColor?: string;
  textColor?: string;
  bold?: boolean;
}

@Injectable()
export class ChoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(columnId: string, input: CreateChoiceInput): Promise<ChoiceDTO> {
    const column = await this.prisma.column.findUnique({ where: { id: columnId } });
    if (!column) {
      throw notFound('Colonne introuvable.');
    }
    if (column.type !== 'SELECT') {
      throw validationFailed(
        `La colonne « ${column.label} » n'est pas une liste déroulante : impossible d'y ajouter une valeur.`,
      );
    }

    const label = input.label.trim();
    const duplicate = await this.prisma.choice.findFirst({ where: { columnId, label } });
    if (duplicate) {
      throw validationFailed(`La valeur « ${label} » existe déjà dans cette liste.`);
    }

    const aggregate = await this.prisma.choice.aggregate({
      where: { columnId },
      _max: { position: true },
    });

    const created = await this.prisma.choice.create({
      data: {
        columnId,
        label,
        bgColor: input.bgColor ?? null,
        textColor: input.textColor ?? null,
        bold: input.bold ?? false,
        position: (aggregate._max.position ?? -1) + 1,
      },
    });

    return toChoiceDTO(created);
  }
}
```

- [ ] **Étape 4 : implémenter les contrôleurs et le module.**

Créer `apps/api/src/choices/column-choices.controller.ts` :

```ts
import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { createChoiceSchema, type ChoiceDTO } from '@suivi/shared';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { parseOrThrow } from '../common/api-error';
import { ChoicesService } from './choices.service';

@Controller('columns/:columnId/choices')
@UseGuards(JwtAuthGuard)
export class ColumnChoicesController {
  constructor(private readonly choices: ChoicesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Param('columnId') columnId: string, @Body() body: unknown): Promise<ChoiceDTO> {
    return this.choices.create(columnId, parseOrThrow(createChoiceSchema, body));
  }
}
```

Créer `apps/api/src/choices/choices.controller.ts` (les routes `PATCH`/`DELETE` sont ajoutées aux Tasks 3.8 et 3.9) :

```ts
import { Controller, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { ChoicesService } from './choices.service';

@Controller('choices')
@UseGuards(JwtAuthGuard)
export class ChoicesController {
  constructor(private readonly choices: ChoicesService) {}
}
```

Créer `apps/api/src/choices/choices.module.ts` :

```ts
import { Module } from '@nestjs/common';
import { ChoicesController } from './choices.controller';
import { ChoicesService } from './choices.service';
import { ColumnChoicesController } from './column-choices.controller';

@Module({
  controllers: [ColumnChoicesController, ChoicesController],
  providers: [ChoicesService],
  exports: [ChoicesService],
})
export class ChoicesModule {}
```

Remplacer `apps/api/src/app.module.ts` par (contenu complet à ce point du plan — Features 0 à 3, modules colonnes **et** choix) :

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ChoicesModule } from './choices/choices.module';
import { ColumnsModule } from './columns/columns.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, HealthModule, AuthModule, UsersModule, ColumnsModule, ChoicesModule],
})
export class AppModule {}
```

- [ ] **Étape 5 : relancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- choices.e2e-spec.ts
```

Attendu : **PASS** — `Tests: 6 passed, 6 total`.

- [ ] **Étape 6 : commit.**

```bash
git add apps/api/src/choices apps/api/src/app.module.ts apps/api/test/choices.e2e-spec.ts
git commit -m "feat: POST /api/columns/:id/choices (type SELECT obligatoire, refus des doublons)"
```

> À vérifier à l'exécution : l'ordre de déclaration des contrôleurs — `ColumnChoicesController` (`columns/:columnId/choices`) et `ColumnsController` (`columns`) coexistent sans ambiguïté car les chemins n'ont pas le même nombre de segments. Si un `404` inattendu apparaît sur `POST /api/columns/:id/choices`, vérifier que `ChoicesModule` est bien dans les `imports` d'`AppModule`.

---

### Task 3.8: `PATCH /api/choices/:id` — renommage propagé aux lignes, couleurs, position, archivage

- **Files:**
  - Modify: `apps/api/src/choices/choices.service.ts`, `apps/api/src/choices/choices.controller.ts`, `apps/api/test/choices.e2e-spec.ts`
- **Interfaces:**
  - Consomme : `updateChoiceSchema` (`@suivi/shared` : `{ label?, bgColor?: string|null, textColor?: string|null, bold?, position?, archived? }`), `ApiException` / `notFound` / `validationFailed` (Feature 2, Task 2.1) et `parseOrThrow` (Feature 2, Task 2.2).
  - Produit :
    - `export interface UpdateChoiceInput { label?: string; bgColor?: string | null; textColor?: string | null; bold?: boolean; position?: number; archived?: boolean }`
    - `ChoicesService.update(id: string, input: UpdateChoiceInput): Promise<ChoiceDTO>` — `404 NOT_FOUND` si inconnu, `422 VALIDATION_FAILED` si le nouveau libellé existe déjà dans la même liste ; le renommage exécute, **dans une seule transaction**, la mise à jour du `Choice` puis un `UPDATE` de masse des lignes (`jsonb_set` paramétré sur la clé de la colonne) ; le changement de position décale les autres choix de la même colonne.
    - Route `PATCH /api/choices/:id` → `200 ChoiceDTO`.

- [ ] **Étape 1 : écrire les tests qui échouent.**

Ajouter dans `apps/api/test/choices.e2e-spec.ts`, après le bloc `describe('POST /api/columns/:columnId/choices')` :

```ts
  describe('PATCH /api/choices/:id', () => {
    it('met à jour couleurs, gras et archivage', async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'STAND BY', position: 0 },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/choices/${choice.id}`)
        .set('Cookie', cookie)
        .send({ bgColor: '#85C1E9', textColor: '#002060', bold: true, archived: true });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        label: 'STAND BY',
        bgColor: '#85C1E9',
        textColor: '#002060',
        bold: true,
        archived: true,
      });
    });

    it('remet une couleur à null (retour au neutre)', async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'A DISTANCE', position: 0, bgColor: '#FFFFFF' },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/choices/${choice.id}`)
        .set('Cookie', cookie)
        .send({ bgColor: null });

      expect(res.status).toBe(200);
      expect((res.body as ChoiceDTO).bgColor).toBeNull();
    });

    it('propage le renommage aux lignes qui portaient l’ancienne valeur', async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'ATT CLIENT', position: 0 },
      });
      const touched1 = await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { statut: 'ATT CLIENT', client: 'ARCADIA' } },
      });
      const touched2 = await prisma.row.create({
        data: { month: '2026-09', position: 0, data: { statut: 'ATT CLIENT' } },
      });
      const untouched = await prisma.row.create({
        data: { month: '2026-08', position: 1, data: { statut: 'NEW' } },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/choices/${choice.id}`)
        .set('Cookie', cookie)
        .send({ label: 'ATTENTE CLIENT' });

      expect(res.status).toBe(200);
      expect((res.body as ChoiceDTO).label).toBe('ATTENTE CLIENT');

      const after1 = await prisma.row.findUniqueOrThrow({ where: { id: touched1.id } });
      const after2 = await prisma.row.findUniqueOrThrow({ where: { id: touched2.id } });
      const afterUntouched = await prisma.row.findUniqueOrThrow({ where: { id: untouched.id } });
      expect(after1.data).toEqual({ statut: 'ATTENTE CLIENT', client: 'ARCADIA' });
      expect(after2.data).toEqual({ statut: 'ATTENTE CLIENT' });
      expect(afterUntouched.data).toEqual({ statut: 'NEW' });
    });

    it('n’ajoute pas la clé aux lignes qui ne l’avaient pas', async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'NEW', position: 0 },
      });
      const row = await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { client: 'ARCADIA' } },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/choices/${choice.id}`)
        .set('Cookie', cookie)
        .send({ label: 'NOUVEAU' });

      expect(res.status).toBe(200);
      const after = await prisma.row.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.data).toEqual({ client: 'ARCADIA' });
    });

    it('refuse un renommage vers un libellé déjà présent dans la liste (422)', async () => {
      const columnId = await createSelectColumn();
      await prisma.choice.create({ data: { columnId, label: 'NEW', position: 0 } });
      const second = await prisma.choice.create({
        data: { columnId, label: 'STAGING', position: 1 },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/choices/${second.id}`)
        .set('Cookie', cookie)
        .send({ label: 'NEW' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toContain('NEW');
    });

    it('réordonne les choix de la liste', async () => {
      const columnId = await createSelectColumn();
      await prisma.choice.create({ data: { columnId, label: 'NEW', position: 0 } });
      await prisma.choice.create({ data: { columnId, label: 'STAGING', position: 1 } });
      const third = await prisma.choice.create({
        data: { columnId, label: 'CLOTUREE', position: 2 },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/choices/${third.id}`)
        .set('Cookie', cookie)
        .send({ position: 0 });

      expect(res.status).toBe(200);
      expect((res.body as ChoiceDTO).position).toBe(0);
      const ordered = await prisma.choice.findMany({ where: { columnId }, orderBy: { position: 'asc' } });
      expect(ordered.map((choice) => choice.label)).toEqual(['CLOTUREE', 'NEW', 'STAGING']);
    });

    it('renvoie 404 NOT_FOUND pour un id inconnu', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/choices/choix_inexistant')
        .set('Cookie', cookie)
        .send({ label: 'PEU IMPORTE' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Valeur de liste introuvable.');
    });

    it('refuse une couleur non hexadécimale (422 VALIDATION_FAILED)', async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'NEW', position: 0 },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/choices/${choice.id}`)
        .set('Cookie', cookie)
        .send({ bgColor: 'rouge' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toBe('Données invalides.');
    });
  });
```

- [ ] **Étape 2 : lancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- choices.e2e-spec.ts
```

Attendu : **FAIL** — les 8 nouveaux tests reçoivent `404` sans corps `{ code }` : la route `PATCH /api/choices/:id` n'existe pas.

- [ ] **Étape 3 : implémenter `update` dans le service.**

Ajouter dans `apps/api/src/choices/choices.service.ts` l'interface d'entrée :

```ts
export interface UpdateChoiceInput {
  label?: string;
  bgColor?: string | null;
  textColor?: string | null;
  bold?: boolean;
  position?: number;
  archived?: boolean;
}
```

et la méthode suivante dans la classe `ChoicesService` :

```ts
  async update(id: string, input: UpdateChoiceInput): Promise<ChoiceDTO> {
    const existing = await this.prisma.choice.findUnique({
      where: { id },
      include: { column: true },
    });
    if (!existing) {
      throw notFound('Valeur de liste introuvable.');
    }

    const newLabel = input.label === undefined ? undefined : input.label.trim();
    const isRename = newLabel !== undefined && newLabel !== existing.label;

    if (isRename) {
      const duplicate = await this.prisma.choice.findFirst({
        where: { columnId: existing.columnId, label: newLabel, id: { not: id } },
      });
      if (duplicate) {
        throw validationFailed(`La valeur « ${newLabel} » existe déjà dans cette liste.`);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let targetPosition: number | undefined;

      if (input.position !== undefined && input.position !== existing.position) {
        const total = await tx.choice.count({ where: { columnId: existing.columnId } });
        const from = existing.position;
        const to = Math.min(Math.max(input.position, 0), total - 1);

        if (to < from) {
          await tx.choice.updateMany({
            where: { columnId: existing.columnId, id: { not: id }, position: { gte: to, lt: from } },
            data: { position: { increment: 1 } },
          });
        } else if (to > from) {
          await tx.choice.updateMany({
            where: { columnId: existing.columnId, id: { not: id }, position: { gt: from, lte: to } },
            data: { position: { decrement: 1 } },
          });
        }
        targetPosition = to;
      }

      const choice = await tx.choice.update({
        where: { id },
        data: {
          ...(newLabel !== undefined ? { label: newLabel } : {}),
          ...(input.bgColor !== undefined ? { bgColor: input.bgColor } : {}),
          ...(input.textColor !== undefined ? { textColor: input.textColor } : {}),
          ...(input.bold !== undefined ? { bold: input.bold } : {}),
          ...(input.archived !== undefined ? { archived: input.archived } : {}),
          ...(targetPosition !== undefined ? { position: targetPosition } : {}),
        },
      });

      if (isRename) {
        // Les lignes stockent le LIBELLÉ du choix dans le JSONB : propagation en masse.
        // jsonb_set(data, ARRAY['<clé>'], to_jsonb('<nouveau>'), false) : ne crée jamais
        // la clé sur les lignes qui ne l'avaient pas.
        await tx.$executeRaw`
          UPDATE "Row"
          SET "data" = jsonb_set(
            "data",
            ARRAY[${existing.column.key}::text],
            to_jsonb(${newLabel as string}::text),
            false
          )
          WHERE "data" ->> ${existing.column.key}::text = ${existing.label}::text
        `;
      }

      return choice;
    });

    return toChoiceDTO(updated);
  }
```

- [ ] **Étape 4 : brancher la route sur le contrôleur.**

Remplacer `apps/api/src/choices/choices.controller.ts` par (fichier complet) :

```ts
import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { updateChoiceSchema, type ChoiceDTO } from '@suivi/shared';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { parseOrThrow } from '../common/api-error';
import { ChoicesService } from './choices.service';

@Controller('choices')
@UseGuards(JwtAuthGuard)
export class ChoicesController {
  constructor(private readonly choices: ChoicesService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<ChoiceDTO> {
    return this.choices.update(id, parseOrThrow(updateChoiceSchema, body));
  }
}
```

- [ ] **Étape 5 : relancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- choices.e2e-spec.ts
```

Attendu : **PASS** — `Tests: 14 passed, 14 total`.

- [ ] **Étape 6 : commit.**

```bash
git add apps/api/src/choices apps/api/test/choices.e2e-spec.ts
git commit -m "feat: PATCH /api/choices/:id (renommage propagé aux lignes, couleurs, position, archivage)"
```

> À vérifier à l'exécution : la forme exacte du `jsonb_set` paramétré. Prisma transforme chaque interpolation en `$n` ; `ARRAY[$1::text]` est bien un `text[]` accepté comme chemin, et `to_jsonb($2::text)` produit une valeur JSON chaîne. Si PostgreSQL renvoie « function jsonb_set(jsonb, text[], jsonb, boolean) does not exist » (versions < 9.5, hors périmètre : PG 16 ici), utiliser `"data" || jsonb_build_object($1::text, $2::text)` sur la même clause `WHERE`.

---

### Task 3.9: `DELETE /api/choices/:id` — refus `CHOICE_IN_USE` avec conseil d'archivage

- **Files:**
  - Modify: `apps/api/src/choices/choices.service.ts`, `apps/api/src/choices/choices.controller.ts`, `apps/api/test/choices.e2e-spec.ts`
- **Interfaces:**
  - Consomme : `ApiException` / `notFound` (Feature 2, Task 2.1), `PrismaService.$queryRaw`.
  - Produit :
    - `ChoicesService.countRowsUsingChoice(key: string, label: string): Promise<number>`
    - `ChoicesService.remove(id: string): Promise<void>` — `404 NOT_FOUND` si inconnu ; `409 CHOICE_IN_USE` (message conseillant l'archivage, `details: { rowCount }`) si au moins une ligne porte cette valeur ; sinon suppression.
    - Route `DELETE /api/choices/:id` → `204` sans corps.

- [ ] **Étape 1 : écrire les tests qui échouent.**

Ajouter dans `apps/api/test/choices.e2e-spec.ts`, après le bloc `describe('PATCH /api/choices/:id')` :

```ts
  describe('DELETE /api/choices/:id', () => {
    it('supprime un choix inutilisé (204)', async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'A DISTANCE', position: 0 },
      });
      await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { statut: 'NEW' } },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/choices/${choice.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(204);
      expect(await prisma.choice.count()).toBe(0);
    });

    it('refuse la suppression d’un choix utilisé (409 CHOICE_IN_USE) et conseille l’archivage', async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'ATT PV', position: 0 },
      });
      await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { statut: 'ATT PV' } },
      });
      await prisma.row.create({
        data: { month: '2026-09', position: 0, data: { statut: 'ATT PV' } },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/choices/${choice.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CHOICE_IN_USE');
      expect(res.body.message).toContain('ATT PV');
      expect(res.body.message).toContain('Archivez');
      expect(res.body.details).toEqual({ rowCount: 2 });
      expect(await prisma.choice.count()).toBe(1);
    });

    it('ne bloque pas sur une valeur identique portée par une autre colonne', async () => {
      const statutId = await createSelectColumn();
      const parte = await prisma.column.create({
        data: { key: 'partenaire', label: 'PARTE', type: 'SELECT', position: 1, width: 150 },
      });
      const choice = await prisma.choice.create({
        data: { columnId: statutId, label: 'CUBE', position: 0 },
      });
      await prisma.choice.create({ data: { columnId: parte.id, label: 'CUBE', position: 0 } });
      await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { partenaire: 'CUBE' } },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/choices/${choice.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(204);
    });

    it('renvoie 404 NOT_FOUND pour un id inconnu', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/choices/choix_inexistant')
        .set('Cookie', cookie);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Valeur de liste introuvable.');
    });

    it('refuse un appel sans cookie (401)', async () => {
      const columnId = await createSelectColumn();
      const choice = await prisma.choice.create({
        data: { columnId, label: 'NEW', position: 0 },
      });

      const res = await request(app.getHttpServer()).delete(`/api/choices/${choice.id}`);

      expect(res.status).toBe(401);
    });
  });
```

- [ ] **Étape 2 : lancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- choices.e2e-spec.ts
```

Attendu : **FAIL** — les 4 tests authentifiés reçoivent `404` (route `DELETE /api/choices/:id` absente) ; le test 401 passe déjà grâce à la garde du contrôleur.

- [ ] **Étape 3 : implémenter `countRowsUsingChoice` et `remove`.**

Ajouter les deux méthodes suivantes dans la classe `ChoicesService` (`apps/api/src/choices/choices.service.ts`) :

```ts
  /** Nombre de lignes dont la colonne `key` vaut exactement `label`. */
  async countRowsUsingChoice(key: string, label: string): Promise<number> {
    const result = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM "Row"
      WHERE "data" ->> ${key}::text = ${label}::text
    `;
    return result[0]?.count ?? 0;
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.choice.findUnique({
      where: { id },
      include: { column: true },
    });
    if (!existing) {
      throw notFound('Valeur de liste introuvable.');
    }

    const rowCount = await this.countRowsUsingChoice(existing.column.key, existing.label);
    if (rowCount > 0) {
      throw new ApiException(
        'CHOICE_IN_USE',
        `La valeur « ${existing.label} » est utilisée par ${rowCount} ligne(s). Archivez-la plutôt que de la supprimer : les lignes existantes la conservent et elle ne sera plus proposée à la saisie.`,
        HttpStatus.CONFLICT,
        { rowCount },
      );
    }

    await this.prisma.choice.delete({ where: { id } });
  }
```

- [ ] **Étape 4 : brancher la route sur le contrôleur.**

Remplacer `apps/api/src/choices/choices.controller.ts` par (fichier complet) :

```ts
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { updateChoiceSchema, type ChoiceDTO } from '@suivi/shared';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { parseOrThrow } from '../common/api-error';
import { ChoicesService } from './choices.service';

@Controller('choices')
@UseGuards(JwtAuthGuard)
export class ChoicesController {
  constructor(private readonly choices: ChoicesService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<ChoiceDTO> {
    return this.choices.update(id, parseOrThrow(updateChoiceSchema, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.choices.remove(id);
  }
}
```

- [ ] **Étape 5 : relancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- choices.e2e-spec.ts
```

Attendu : **PASS** — `Tests: 19 passed, 19 total`.

- [ ] **Étape 6 : commit.**

```bash
git add apps/api/src/choices apps/api/test/choices.e2e-spec.ts
git commit -m "feat: DELETE /api/choices/:id (409 CHOICE_IN_USE, message conseillant l'archivage)"
```

---

### Task 3.10: Vérification complète du périmètre et fin de feature (merge dans `develop`)

- **Files:**
  - Modify: aucun fichier de code (tâche de vérification et d'intégration).
  - Test: `apps/api/src/columns/slugify.spec.ts`, `apps/api/test/columns.e2e-spec.ts`, `apps/api/test/choices.e2e-spec.ts`
- **Interfaces:**
  - Consomme : tout ce qui a été produit aux Tasks 3.1 à 3.9.
  - Produit : la branche `feature/columns-choices` mergée dans `develop` et poussée. Les Features suivantes peuvent compter sur : `ColumnsService` (`findAll`, `create`, `update`, `remove`, `countRowsWithValue`), `ChoicesService` (`create`, `update`, `remove`, `countRowsUsingChoice`), `toColumnDTO` / `toChoiceDTO`, `slugify` / `uniqueKey`, et les 7 routes REST de configuration.

- [ ] **Étape 1 : vérifier la compilation stricte de l'API.**

```bash
pnpm --filter @suivi/api build
```

Attendu : sortie en code 0, `apps/api/dist/main.js` présent, aucune erreur TypeScript (mode strict).

- [ ] **Étape 2 : lancer TOUS les tests unitaires du package API.**

```bash
pnpm --filter @suivi/api test:unit
```

Attendu : **PASS** intégral, incluant les 10 tests de `slugify.spec.ts` et les specs des Features 1 et 2 déjà mergées (dont `api-error.spec.ts`).

- [ ] **Étape 3 : lancer TOUS les tests e2e du package API.**

```bash
pnpm --filter @suivi/api test:e2e
```

Attendu : **PASS** intégral — `columns.e2e-spec.ts` : 24 tests, `choices.e2e-spec.ts` : 19 tests, plus les e2e des Features 0 à 2 (health, auth, users). Aucun test rouge : interdiction de merger sinon.

- [ ] **Étape 4 : vérifier le comportement réel des routes sur l'application démarrée.**

Dans un premier terminal :

```bash
pnpm --filter @suivi/api dev
```

Dans un second terminal (remplacer l'email/mot de passe par ceux du compte créé par le seed de la Feature 1) :

```bash
curl -s -c /tmp/suivi-cookie.txt -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"quentin.durant49@orange.fr","password":"<mot de passe du seed>"}'
curl -s -b /tmp/suivi-cookie.txt http://localhost:3001/api/columns | head -c 400
curl -s -b /tmp/suivi-cookie.txt -X POST http://localhost:3001/api/columns \
  -H 'Content-Type: application/json' -d '{"label":"Réf devis","type":"TEXT"}'
```

Attendu : le login renvoie `{"user":{...}}`, `GET /api/columns` renvoie les 16 colonnes du seed triées par position avec leurs choix colorés, et le `POST` renvoie un `ColumnDTO` de clé `ref_devis`, `width: 150`, `position: 16`.

- [ ] **Étape 5 : nettoyer la colonne de test et arrêter le serveur.**

```bash
curl -s -b /tmp/suivi-cookie.txt -X DELETE \
  "http://localhost:3001/api/columns/$(curl -s -b /tmp/suivi-cookie.txt http://localhost:3001/api/columns | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const col=JSON.parse(d).find(c=>c.key==="ref_devis");process.stdout.write(col?col.id:"")})')" \
  -o /dev/null -w '%{http_code}\n'
```

Attendu : `204`. Arrêter ensuite le serveur de dev (`Ctrl+C` dans le premier terminal) et supprimer le cookie de test : `rm -f /tmp/suivi-cookie.txt`.

- [ ] **Étape 6 : vérifier que rien n'est en attente de commit.**

```bash
git status --short
```

Attendu : sortie vide (tous les fichiers de la feature sont committés).

- [ ] **Étape 7 : merge gitflow dans `develop` et push.**

```bash
git checkout develop && git merge --no-ff feature/columns-choices -m "merge: feature/columns-choices"
git push origin develop
```

Attendu : merge sans conflit (commit de merge créé), `develop` poussé sur l'origine. La feature suivante démarrera par `git checkout develop && git pull && git checkout -b feature/<nom>`.

---

## Récapitulatif de ce que les features suivantes peuvent utiliser

| Élément | Où | Signature |
|---|---|---|
| Slug de colonne | `apps/api/src/columns/slugify.ts` | `slugify(label: string): string` · `uniqueKey(base: string, taken: readonly string[]): string` |
| Erreurs typées | `apps/api/src/common/api.exception.ts` (Feature 2) | `new ApiException(code, message, status, details?)` ; `notFound(message?)`, `validationFailed(message, details?)` |
| Validation zod | `apps/api/src/common/api-error.ts` (Feature 2) | `parseOrThrow<T>(schema: ZodType<T>, input: unknown): T` (422 `VALIDATION_FAILED`) |
| Mappers DTO | `apps/api/src/columns/mappers.ts` | `toColumnDTO(column: Column & { choices?: Choice[] }): ColumnDTO` · `toChoiceDTO(choice: Choice): ChoiceDTO` |
| Service colonnes | `apps/api/src/columns/columns.service.ts` | `findAll()` · `create(input: CreateColumnInput)` · `update(id, input: UpdateColumnInput)` · `remove(id, force)` · `countRowsWithValue(key)` |
| Service choix | `apps/api/src/choices/choices.service.ts` | `create(columnId, input: CreateChoiceInput)` · `update(id, input: UpdateChoiceInput)` · `remove(id)` · `countRowsUsingChoice(key, label)` |
| Modules | `apps/api/src/columns/columns.module.ts`, `apps/api/src/choices/choices.module.ts` | `ColumnsModule` (exporte `ColumnsService`) · `ChoicesModule` (exporte `ChoicesService`) — Feature 5 y ajoutera `RealtimeModule` |
| Harnais e2e | `apps/api/test/helpers/config-test-app.ts` | `createConfigTestContext()` · `resetConfigTables(prisma)` · `closeConfigTestContext(ctx)` |
| Routes REST | — | `GET /api/columns` · `POST /api/columns` · `PATCH /api/columns/:id` · `DELETE /api/columns/:id[?force=true]` · `POST /api/columns/:id/choices` · `PATCH /api/choices/:id` · `DELETE /api/choices/:id` |
