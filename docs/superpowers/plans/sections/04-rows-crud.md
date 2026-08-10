# Section 04 — Lignes (CRUD, fusion, versions, historique)

## Feature 4 — Lignes (CRUD, fusion, versions, historique) (branche `feature/rows-crud`)

**But:** exposer tout le cycle de vie d'une ligne (lecture par mois/archives, création avec insertion positionnée, fusion `PATCH` clé par clé avec détection de conflit `VERSION_CONFLICT`, déplacement, archivage, suppression, historique, recherche globale, liste des mois) — sans aucune émission temps réel, branchée en Feature 5.

**Dépend de:**
- **Feature 1 (socle + schéma)** : monorepo pnpm, `setupApp(app)` (`apps/api/src/app.setup.ts`, préfixe global `api` + cookie-parser), `PrismaService` global (`apps/api/src/prisma/prisma.service.ts`), migration Prisma appliquée (modèles `Row`, `RowEvent`, `User`), package `@suivi/shared` exportant `RowDTO`, `RowEventDTO`, `MonthInfo`, `CellValue`, `CellFormat`, `createRowSchema`, `patchRowSchema`, `moveRowSchema`, scripts `test` / `test:e2e` de `@suivi/api` (jest unitaire sur `src/**/*.spec.ts`, jest e2e sur `test/**/*.e2e-spec.ts` avec `moduleNameMapper` vers `@suivi/shared`).
- **Feature 2 (auth/users)** : `POST /api/auth/login` posant le cookie JWT httpOnly `token`, garde `JwtAuthGuard` exportée par `apps/api/src/auth/jwt.guard.ts` (payload JWT `{ sub: <userId>, email }`), dépendance `argon2` installée.
- **Feature 3 (colonnes/choix)** : helper de validation `parseOrThrow` exporté par `apps/api/src/common/api-error.ts` (jette 422 `{ code: 'VALIDATION_FAILED' }`). Cette feature le consomme tel quel, elle ne le redéfinit pas.

**Notes de périmètre (à lire avant de commencer) :**

1. **Aucune émission Socket.IO ici.** `RowsService` expose des méthodes pures « entrée → `Promise<RowDTO>` ». La Feature 5 injectera `RealtimeEmitter` dans le constructeur existant et ajoutera les appels d'émission après commit. Pour que ce branchement se fasse sans réécriture, deux conventions sont imposées et respectées dans tout le code ci-dessous : la variable relue avant écriture s'appelle **`existing`** (utilisée par la Feature 5 pour `fromMonth` et pour `emitRowDeleted`), et chaque méthode de mutation retourne le `RowDTO` final.
2. **`version` n'est incrémentée QUE par `PATCH /rows/:id`.** `move`, `archive` et `delete` ne touchent ni `data` ni `formats`, donc ne changent pas `version`. Cet invariant est ce qui rend la détection de conflit fiable : il existe exactement un `RowEvent` de type `update` par incrément de version, et son `payload.version` porte la version **produite** par cet événement.
3. **Pas de `RowEvent` de type `delete`.** `RowEvent.rowId` a une contrainte `onDelete: Cascade` (contrats, schéma Prisma) : un événement consigné juste avant la suppression de la ligne serait effacé par la cascade dans la même transaction. Consigner la suppression demanderait une table d'audit détachée de `Row` — hors périmètre v1. La suppression n'est donc pas tracée dans `RowEvent`, et le test e2e de la Task 4.7 vérifie explicitement que la cascade vide bien les événements de la ligne supprimée.
4. **Base de tests.** Les specs e2e vident `RowEvent`, `Row`, `Choice`, `Column`, `User` dans `beforeEach`. Utiliser la base de test dédiée (variable `DATABASE_URL` du fichier d'env de test mis en place en Feature 1), jamais la base contenant l'import réel.
5. **Périmètre des positions.** Les positions sont contiguës `0..n-1` à l'intérieur d'un couple (`month`, `archived = false`). La vue Archives (`?archived=true`) ignore `position` pour son tri principal (tri `month` puis `position`).

---

### Task 4.1: Branche + helpers purs de fusion et de conflit

**Files:**
- Create: `apps/api/src/rows/merge.ts`
- Test: `apps/api/src/rows/merge.spec.ts`

**Interfaces:**
- Consomme : `@suivi/shared` → `type CellValue = string | number | null`, `interface CellFormat { bg?: string }`.
- Produit (utilisé par la Task 4.5) :
  - `type RowData = Record<string, CellValue>`
  - `type RowFormats = Record<string, CellFormat>`
  - `type FormatsPatch = Record<string, CellFormat | null>`
  - `mergeData(current: RowData, patch: RowData): RowData` — valeur `null` = effacement de la clé.
  - `mergeFormats(current: RowFormats, patch: FormatsPatch): RowFormats` — valeur `null` = retrait du format.
  - `changedKeysOf(patch: RowData, formats: FormatsPatch): string[]` — union ordonnée (clés de `patch` puis clés de `formats` absentes de `patch`).
  - `buildDiff(current: RowData, patch: RowData): Record<string, { from: CellValue; to: CellValue }>`
  - `changedKeysOfPayload(payload: unknown): string[]`
  - `versionOfPayload(payload: unknown): number | null`
  - `conflictKeys(events: readonly { payload: unknown }[], keys: readonly string[]): string[]`

- [ ] **Étape 1: créer la branche gitflow**

```bash
git checkout develop && git pull && git checkout -b feature/rows-crud
```

- [ ] **Étape 2: écrire le test unitaire qui échoue**

Créer `apps/api/src/rows/merge.spec.ts` :

```ts
import {
  buildDiff,
  changedKeysOf,
  changedKeysOfPayload,
  conflictKeys,
  mergeData,
  mergeFormats,
  versionOfPayload,
} from './merge';

describe('mergeData', () => {
  it('applique les valeurs du patch et conserve les autres clés', () => {
    const result = mergeData(
      { client: 'ARCADIA', statut: 'NEW' },
      { statut: 'A SUIVRE' },
    );
    expect(result).toEqual({ client: 'ARCADIA', statut: 'A SUIVRE' });
  });

  it('efface la clé quand la valeur du patch est null', () => {
    const result = mergeData({ client: 'ARCADIA', heure: '14H' }, { heure: null });
    expect(result).toEqual({ client: 'ARCADIA' });
    expect('heure' in result).toBe(false);
  });

  it('accepte les valeurs numériques', () => {
    expect(mergeData({}, { num_chrono: 78 })).toEqual({ num_chrono: 78 });
  });

  it('ne mute pas l objet source', () => {
    const current = { client: 'ARCADIA' };
    mergeData(current, { client: 'AUTRE', statut: 'NEW' });
    expect(current).toEqual({ client: 'ARCADIA' });
  });

  it('fusionne deux patchs concurrents portant sur des clés différentes', () => {
    const apresA = mergeData({}, { client: 'ARCADIA' });
    const apresB = mergeData(apresA, { statut: 'NEW' });
    expect(apresB).toEqual({ client: 'ARCADIA', statut: 'NEW' });
  });
});

describe('mergeFormats', () => {
  it('ajoute et remplace un format clé par clé', () => {
    const result = mergeFormats(
      { impe: { bg: '#FFFF00' } },
      { num_chrono: { bg: '#FF0000' } },
    );
    expect(result).toEqual({
      impe: { bg: '#FFFF00' },
      num_chrono: { bg: '#FF0000' },
    });
  });

  it('remplace entièrement le format d une clé existante', () => {
    expect(mergeFormats({ impe: { bg: '#FFFF00' } }, { impe: { bg: '#FF0000' } })).toEqual({
      impe: { bg: '#FF0000' },
    });
  });

  it('retire le format quand la valeur du patch est null', () => {
    const result = mergeFormats({ impe: { bg: '#FFFF00' }, client: { bg: '#FF0000' } }, { impe: null });
    expect(result).toEqual({ client: { bg: '#FF0000' } });
  });

  it('ne mute pas l objet source', () => {
    const current = { impe: { bg: '#FFFF00' } };
    mergeFormats(current, { impe: null });
    expect(current).toEqual({ impe: { bg: '#FFFF00' } });
  });
});

describe('changedKeysOf', () => {
  it('retourne les clés du patch puis celles des formats, sans doublon', () => {
    expect(
      changedKeysOf({ client: 'ARCADIA', statut: null }, { statut: null, impe: { bg: '#FF0000' } }),
    ).toEqual(['client', 'statut', 'impe']);
  });

  it('retourne un tableau vide sans patch ni formats', () => {
    expect(changedKeysOf({}, {})).toEqual([]);
  });
});

describe('buildDiff', () => {
  it('décrit from/to pour chaque clé du patch', () => {
    expect(buildDiff({ client: 'ARCADIA' }, { client: 'AUTRE' })).toEqual({
      client: { from: 'ARCADIA', to: 'AUTRE' },
    });
  });

  it('utilise null comme valeur de départ quand la clé était absente', () => {
    expect(buildDiff({}, { statut: 'NEW' })).toEqual({ statut: { from: null, to: 'NEW' } });
  });

  it('décrit un effacement comme to: null', () => {
    expect(buildDiff({ heure: '14H' }, { heure: null })).toEqual({
      heure: { from: '14H', to: null },
    });
  });
});

describe('changedKeysOfPayload', () => {
  it('extrait changedKeys d un payload d événement update', () => {
    expect(changedKeysOfPayload({ version: 3, changedKeys: ['client', 'statut'] })).toEqual([
      'client',
      'statut',
    ]);
  });

  it('tolère un payload sans changedKeys, null ou non objet', () => {
    expect(changedKeysOfPayload({ version: 3 })).toEqual([]);
    expect(changedKeysOfPayload(null)).toEqual([]);
    expect(changedKeysOfPayload('texte')).toEqual([]);
  });

  it('ignore les entrées non textuelles de changedKeys', () => {
    expect(changedKeysOfPayload({ changedKeys: ['client', 42, null] })).toEqual(['client']);
  });
});

describe('versionOfPayload', () => {
  it('retourne la version quand elle est numérique', () => {
    expect(versionOfPayload({ version: 4 })).toBe(4);
  });

  it('retourne null quand la version est absente ou non numérique', () => {
    expect(versionOfPayload({})).toBeNull();
    expect(versionOfPayload(null)).toBeNull();
    expect(versionOfPayload({ version: 'quatre' })).toBeNull();
  });
});

describe('conflictKeys', () => {
  it('retourne un tableau vide quand les clés modifiées sont disjointes du patch', () => {
    const events = [{ payload: { version: 1, changedKeys: ['statut'] } }];
    expect(conflictKeys(events, ['client'])).toEqual([]);
  });

  it('retourne les clés communes quand la même clé a été modifiée entre-temps', () => {
    const events = [{ payload: { version: 1, changedKeys: ['client', 'statut'] } }];
    expect(conflictKeys(events, ['client'])).toEqual(['client']);
  });

  it('agrège les clés de plusieurs événements et préserve l ordre du patch', () => {
    const events = [
      { payload: { version: 2, changedKeys: ['statut'] } },
      { payload: { version: 1, changedKeys: ['client'] } },
    ];
    expect(conflictKeys(events, ['client', 'heure', 'statut'])).toEqual(['client', 'statut']);
  });

  it('retourne un tableau vide sans aucun événement postérieur', () => {
    expect(conflictKeys([], ['client'])).toEqual([]);
  });
});
```

- [ ] **Étape 3: lancer le test**

```bash
pnpm --filter @suivi/api test -- merge.spec.ts
```

Attendu : **FAIL** — `Cannot find module './merge' from 'src/rows/merge.spec.ts'`.

- [ ] **Étape 4: implémentation minimale**

Créer `apps/api/src/rows/merge.ts` :

```ts
import type { CellFormat, CellValue } from '@suivi/shared';

/** Contenu du JSONB `Row.data`. */
export type RowData = Record<string, CellValue>;
/** Contenu du JSONB `Row.formats`. */
export type RowFormats = Record<string, CellFormat>;
/** Patch de formats : `null` demande le retrait du format de la clé. */
export type FormatsPatch = Record<string, CellFormat | null>;

/**
 * Fusion clé par clé de `data`. Une valeur `null` efface la clé
 * (et non « stocke null »), conformément aux contrats.
 */
export function mergeData(current: RowData, patch: RowData): RowData {
  const next: RowData = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

/**
 * Fusion clé par clé de `formats`. Une valeur `null` retire le surlignage
 * de la clé ; sinon le format de la clé est remplacé en entier.
 */
export function mergeFormats(current: RowFormats, patch: FormatsPatch): RowFormats {
  const next: RowFormats = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

/** Union ordonnée des clés touchées par un PATCH (data puis formats). */
export function changedKeysOf(patch: RowData, formats: FormatsPatch): string[] {
  const keys = Object.keys(patch);
  for (const key of Object.keys(formats)) {
    if (!keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
}

/** Journal de modification : { clé: { from, to } } pour le panneau historique. */
export function buildDiff(
  current: RowData,
  patch: RowData,
): Record<string, { from: CellValue; to: CellValue }> {
  const diff: Record<string, { from: CellValue; to: CellValue }> = {};
  for (const [key, value] of Object.entries(patch)) {
    diff[key] = { from: current[key] ?? null, to: value };
  }
  return diff;
}

/** Lit `payload.changedKeys` de façon défensive (payload est un JSONB libre). */
export function changedKeysOfPayload(payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null) {
    return [];
  }
  const value = (payload as { changedKeys?: unknown }).changedKeys;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((key): key is string => typeof key === 'string');
}

/** Lit `payload.version` (version PRODUITE par l'événement) ou null. */
export function versionOfPayload(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const value = (payload as { version?: unknown }).version;
  return typeof value === 'number' ? value : null;
}

/**
 * Intersection entre les clés du patch courant et les clés modifiées par les
 * événements postérieurs à `expectedVersion`. Vide => pas de conflit, la
 * fusion peut avoir lieu même si la version a bougé.
 */
export function conflictKeys(
  events: readonly { payload: unknown }[],
  keys: readonly string[],
): string[] {
  const modified = new Set<string>();
  for (const event of events) {
    for (const key of changedKeysOfPayload(event.payload)) {
      modified.add(key);
    }
  }
  return keys.filter((key) => modified.has(key));
}
```

- [ ] **Étape 5: relancer le test**

```bash
pnpm --filter @suivi/api test -- merge.spec.ts
```

Attendu : **PASS** (les 23 cas verts).

- [ ] **Étape 6: commit**

```bash
git add apps/api/src/rows/merge.ts apps/api/src/rows/merge.spec.ts && git commit -m "feat(rows): helpers purs de fusion data/formats et de détection de conflit"
```

---

### Task 4.2: Mapper `toRowDTO`

**Files:**
- Create: `apps/api/src/rows/rows.mapper.ts`
- Test: `apps/api/src/rows/rows.mapper.spec.ts`

**Interfaces:**
- Consomme : `type Row` de `@prisma/client` (modèle des contrats : `id, month, position, data, formats, version, archived, createdBy, createdAt, updatedAt`), `RowDTO`, `CellValue`, `CellFormat` de `@suivi/shared`.
- Produit : `toRowDTO(row: Row): RowDTO` — `updatedAt` sérialisé en ISO 8601, `data`/`formats` normalisés en objets (jamais `null`), `createdBy` et `createdAt` volontairement absents du DTO (non présents dans le contrat `RowDTO`).

- [ ] **Étape 1: écrire le test unitaire qui échoue**

Créer `apps/api/src/rows/rows.mapper.spec.ts` :

```ts
import type { Row } from '@prisma/client';
import { toRowDTO } from './rows.mapper';

function fakeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'row_1',
    month: '2026-08',
    position: 3,
    data: { client: 'ARCADIA', num_chrono: 78 },
    formats: { num_chrono: { bg: '#FF0000' } },
    version: 5,
    archived: false,
    createdBy: 'user_1',
    createdAt: new Date('2026-08-01T08:00:00.000Z'),
    updatedAt: new Date('2026-08-10T12:34:56.000Z'),
    ...overrides,
  } as Row;
}

describe('toRowDTO', () => {
  it('projette la ligne Prisma sur le contrat RowDTO', () => {
    expect(toRowDTO(fakeRow())).toEqual({
      id: 'row_1',
      month: '2026-08',
      position: 3,
      data: { client: 'ARCADIA', num_chrono: 78 },
      formats: { num_chrono: { bg: '#FF0000' } },
      version: 5,
      archived: false,
      updatedAt: '2026-08-10T12:34:56.000Z',
    });
  });

  it('n expose ni createdBy ni createdAt', () => {
    const dto = toRowDTO(fakeRow());
    expect('createdBy' in dto).toBe(false);
    expect('createdAt' in dto).toBe(false);
  });

  it('normalise data et formats absents en objets vides', () => {
    const dto = toRowDTO(fakeRow({ data: null, formats: null }));
    expect(dto.data).toEqual({});
    expect(dto.formats).toEqual({});
  });
});
```

- [ ] **Étape 2: lancer le test**

```bash
pnpm --filter @suivi/api test -- rows.mapper.spec.ts
```

Attendu : **FAIL** — `Cannot find module './rows.mapper' from 'src/rows/rows.mapper.spec.ts'`.

- [ ] **Étape 3: implémentation minimale**

Créer `apps/api/src/rows/rows.mapper.ts` :

```ts
import type { Row } from '@prisma/client';
import type { CellFormat, CellValue, RowDTO } from '@suivi/shared';

/**
 * Projection Prisma -> contrat RowDTO.
 * `data` et `formats` sont des JSONB typés `Prisma.JsonValue` : on les ramène
 * aux formes du contrat et on remplace null/valeur scalaire par un objet vide.
 */
export function toRowDTO(row: Row): RowDTO {
  return {
    id: row.id,
    month: row.month,
    position: row.position,
    data: asObject<CellValue>(row.data),
    formats: asObject<CellFormat>(row.formats),
    version: row.version,
    archived: row.archived,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function asObject<T>(value: unknown): Record<string, T> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, T>;
}
```

- [ ] **Étape 4: relancer le test**

```bash
pnpm --filter @suivi/api test -- rows.mapper.spec.ts
```

Attendu : **PASS** (3 cas verts).

- [ ] **Étape 5: commit**

```bash
git add apps/api/src/rows/rows.mapper.ts apps/api/src/rows/rows.mapper.spec.ts && git commit -m "feat(rows): mapper toRowDTO (Prisma -> contrat RowDTO)"
```

---

### Task 4.3: `RowsModule` + `GET /api/rows` (filtres mois/archives, 422 sans filtre)

**Files:**
- Create: `apps/api/src/rows/rows.service.ts`, `apps/api/src/rows/rows.controller.ts`, `apps/api/src/rows/rows.module.ts`, `apps/api/test/helpers/e2e-app.ts`
- Modify: `apps/api/src/auth/current-user.decorator.ts`, `apps/api/src/app.module.ts`, `apps/api/package.json`
- Test: `apps/api/test/rows-list.e2e-spec.ts`

**Interfaces:**
- Consomme : `PrismaService` (Feature 1), `JwtAuthGuard` de `apps/api/src/auth/jwt.guard.ts` (Feature 2), `parseOrThrow<T>(schema: ZodSchema<T>, body: unknown): T` de `apps/api/src/common/api-error.ts` (Feature 3), `setupApp(app)` de `apps/api/src/app.setup.ts` (Feature 1), `toRowDTO` (Task 4.2).
- Produit :
  - `CurrentUserId()` — décorateur de paramètre (`apps/api/src/auth/current-user.decorator.ts`) retournant l'id de l'utilisateur connecté, utilisé par les Tasks 4.4 à 4.7.
  - `RowsService.findByMonth(month: string): Promise<RowDTO[]>` (tri `position` asc, `archived = false`).
  - `RowsService.findArchived(): Promise<RowDTO[]>` (tri `month` asc puis `position` asc).
  - `RowsController` monté sur `rows` sous `JwtAuthGuard` ; `GET /api/rows?month=YYYY-MM` et `GET /api/rows?archived=true` → 200 `RowDTO[]`, aucun filtre ou filtre invalide → 422 `VALIDATION_FAILED`.
  - Helpers e2e (`apps/api/test/helpers/e2e-app.ts`) : `createTestApp(): Promise<TestContext>`, `resetDb(prisma: PrismaService): Promise<void>`, `seedUserAndLogin(ctx: TestContext, email?: string): Promise<{ userId: string; cookie: string[] }>` — réutilisés par toutes les specs e2e des Tasks 4.4 à 4.9.

- [ ] **Étape 1: sérialiser les tests e2e (base partagée)**

Les 7 specs e2e de cette feature vident et rechargent la même base : jest doit les exécuter en série. Modifier les scripts de `apps/api/package.json` :

```json
    "test": "jest --passWithNoTests && jest --config ./test/jest-e2e.json --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json --runInBand"
```

Vérification immédiate (les specs e2e déjà présentes des Features 2 et 3 doivent rester vertes) :

```bash
pnpm --filter @suivi/api test:e2e
```

Attendu : **PASS** — toutes les specs e2e existantes passent, exécutées les unes après les autres.

- [ ] **Étape 2: écrire les helpers e2e**

Créer `apps/api/test/helpers/e2e-app.ts` (le nom ne se termine pas par `.e2e-spec.ts`, jest ne le collecte donc pas comme suite de tests) :

```ts
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * Démarre l'application de test avec EXACTEMENT la configuration de main.ts.
 * `listen(0)` (et non `init()`) : le serveur HTTP écoute sur un port libre
 * avant les tests, ce qui permet d'envoyer plusieurs requêtes supertest en
 * parallèle (test de PATCH concurrents de la Task 4.5).
 */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = setupApp(moduleRef.createNestApplication());
  await app.listen(0);
  return { app, prisma: app.get(PrismaService) };
}

/** Vide les tables dans l'ordre des dépendances de clés étrangères. */
export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.rowEvent.deleteMany();
  await prisma.row.deleteMany();
  await prisma.choice.deleteMany();
  await prisma.column.deleteMany();
  await prisma.user.deleteMany();
}

/** Crée un membre et retourne son id + le cookie JWT httpOnly de session. */
export async function seedUserAndLogin(
  ctx: TestContext,
  email = 'test@suivi.local',
): Promise<{ userId: string; cookie: string[] }> {
  const user = await ctx.prisma.user.create({
    data: {
      email,
      passwordHash: await argon2.hash('motdepasse'),
      displayName: 'Testeur',
      cursorColor: '#FF0000',
    },
  });
  const login = await request(ctx.app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: 'motdepasse' })
    .expect(200);
  return { userId: user.id, cookie: login.get('Set-Cookie') as unknown as string[] };
}
```

- [ ] **Étape 3: écrire le test e2e qui échoue**

Créer `apps/api/test/rows-list.e2e-spec.ts` :

```ts
import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('GET /api/rows (e2e)', () => {
  let ctx: TestContext;
  let cookie: string[];

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    cookie = (await seedUserAndLogin(ctx)).cookie;
  });

  it('refuse une requête sans filtre : 422 VALIDATION_FAILED', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/rows')
      .set('Cookie', cookie)
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('refuse un mois mal formé : 422 VALIDATION_FAILED', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/rows?month=AOUT-2026')
      .set('Cookie', cookie)
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('refuse archived=false (seul ?archived=true est un filtre) : 422', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/rows?archived=false')
      .set('Cookie', cookie)
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('retourne les lignes du mois triées par position, sans les archivées', async () => {
    await ctx.prisma.row.create({
      data: { month: '2026-08', position: 1, data: { client: 'BETA' } },
    });
    await ctx.prisma.row.create({
      data: { month: '2026-08', position: 0, data: { client: 'ALPHA' } },
    });
    await ctx.prisma.row.create({
      data: { month: '2026-08', position: 2, data: { client: 'ARCHIVEE' }, archived: true },
    });
    await ctx.prisma.row.create({
      data: { month: '2026-09', position: 0, data: { client: 'AUTRE MOIS' } },
    });

    const res = await request(ctx.app.getHttpServer())
      .get('/api/rows?month=2026-08')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body.map((r: { data: { client: string } }) => r.data.client)).toEqual([
      'ALPHA',
      'BETA',
    ]);
    expect(res.body[0]).toMatchObject({
      month: '2026-08',
      position: 0,
      formats: {},
      version: 0,
      archived: false,
    });
    expect(typeof res.body[0].updatedAt).toBe('string');
  });

  it('retourne un tableau vide pour un mois sans ligne', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/rows?month=2026-12')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('retourne toutes les archives, tous mois confondus, triées mois puis position', async () => {
    await ctx.prisma.row.create({
      data: { month: '2026-09', position: 0, data: { client: 'SEPT' }, archived: true },
    });
    await ctx.prisma.row.create({
      data: { month: '2026-08', position: 1, data: { client: 'AOUT B' }, archived: true },
    });
    await ctx.prisma.row.create({
      data: { month: '2026-08', position: 0, data: { client: 'AOUT A' }, archived: true },
    });
    await ctx.prisma.row.create({
      data: { month: '2026-08', position: 5, data: { client: 'ACTIVE' } },
    });

    const res = await request(ctx.app.getHttpServer())
      .get('/api/rows?archived=true')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.map((r: { data: { client: string } }) => r.data.client)).toEqual([
      'AOUT A',
      'AOUT B',
      'SEPT',
    ]);
  });

  it('refuse un visiteur non authentifié : 401', async () => {
    await request(ctx.app.getHttpServer()).get('/api/rows?month=2026-08').expect(401);
  });
});
```

- [ ] **Étape 4: lancer le test e2e**

```bash
pnpm --filter @suivi/api test:e2e -- rows-list.e2e-spec.ts
```

Attendu : **FAIL** — la route n'existe pas : tous les appels `GET /api/rows` répondent 404 au lieu de 422/200/401.

- [ ] **Étape 5: écrire le décorateur d'utilisateur courant**

Modifier `apps/api/src/auth/current-user.decorator.ts` : ajouter `CurrentUserId` au fichier existant sans supprimer `AuthUser`, `currentUserFactory` ni `CurrentUser` (livrés par la Feature 2, Task 2.4, et consommés par `auth.controller.ts` et `users.controller.ts`). Compléter l'import `@nestjs/common` existant avec `UnauthorizedException` si absent, puis **ajouter** en fin de fichier le seul bloc suivant :

```ts
interface RequestWithUser {
  user?: { id?: string; sub?: string };
}

/**
 * Id de l'utilisateur connecté, posé sur la requête par JwtAuthGuard.
 * Accepte les deux formes possibles du payload JWT (`id` ou `sub`).
 */
export const CurrentUserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  const userId = request.user?.id ?? request.user?.sub;
  if (userId === undefined) {
    throw new UnauthorizedException({
      code: 'AUTH_REQUIRED',
      message: 'Authentification requise.',
    });
  }
  return userId;
});
```

- [ ] **Étape 6: écrire le service de lecture**

Créer `apps/api/src/rows/rows.service.ts` :

```ts
import { Injectable } from '@nestjs/common';
import type { RowDTO } from '@suivi/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toRowDTO } from './rows.mapper';

@Injectable()
export class RowsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lignes actives d'un mois, dans l'ordre manuel. */
  async findByMonth(month: string): Promise<RowDTO[]> {
    const rows = await this.prisma.row.findMany({
      where: { month, archived: false },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toRowDTO);
  }

  /** Vue Archives : toutes les lignes archivées, tous mois confondus. */
  async findArchived(): Promise<RowDTO[]> {
    const rows = await this.prisma.row.findMany({
      where: { archived: true },
      orderBy: [{ month: 'asc' }, { position: 'asc' }],
    });
    return rows.map(toRowDTO);
  }
}
```

- [ ] **Étape 7: écrire le contrôleur et le module, brancher dans AppModule**

Créer `apps/api/src/rows/rows.controller.ts` :

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { RowDTO } from '@suivi/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { parseOrThrow } from '../common/api-error';
import { RowsService } from './rows.service';

/** Filtre obligatoire de GET /api/rows : soit ?month=YYYY-MM, soit ?archived=true. */
const listRowsQuerySchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois attendu au format AAAA-MM')
      .optional(),
    archived: z.literal('true').optional(),
  })
  .refine((query) => query.month !== undefined || query.archived === 'true', {
    message: 'Filtre requis : month=AAAA-MM ou archived=true.',
  });

@Controller('rows')
@UseGuards(JwtAuthGuard)
export class RowsController {
  constructor(private readonly rows: RowsService) {}

  @Get()
  async list(@Query() query: unknown): Promise<RowDTO[]> {
    const filter = parseOrThrow(listRowsQuerySchema, query);
    if (filter.month !== undefined) {
      return this.rows.findByMonth(filter.month);
    }
    return this.rows.findArchived();
  }
}
```

Créer `apps/api/src/rows/rows.module.ts` :

```ts
import { Module } from '@nestjs/common';
import { RowsController } from './rows.controller';
import { RowsService } from './rows.service';

@Module({
  controllers: [RowsController],
  providers: [RowsService],
  exports: [RowsService],
})
export class RowsModule {}
```

Remplacer `apps/api/src/app.module.ts` par (contenu complet à ce point du plan — Features 0 à 4) :

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ChoicesModule } from './choices/choices.module';
import { ColumnsModule } from './columns/columns.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
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
  ],
})
export class AppModule {}
```

- [ ] **Étape 8: relancer le test e2e**

```bash
pnpm --filter @suivi/api test:e2e -- rows-list.e2e-spec.ts
```

Attendu : **PASS** (7 cas verts).

- [ ] **Étape 9: commit**

```bash
git add apps/api/package.json apps/api/src/auth/current-user.decorator.ts apps/api/src/rows/rows.service.ts apps/api/src/rows/rows.controller.ts apps/api/src/rows/rows.module.ts apps/api/src/app.module.ts apps/api/test/helpers/e2e-app.ts apps/api/test/rows-list.e2e-spec.ts && git commit -m "feat(rows): GET /api/rows par mois ou archives, 422 sans filtre"
```

> À vérifier à l'exécution : la forme exacte de `request.user` posée par le `JwtAuthGuard` de la Feature 2 (`{ id }` ou `{ sub }`) — le décorateur accepte les deux, mais si la garde pose l'utilisateur sous une autre clé (ex. `req.currentUser`), aligner `RequestWithUser` sur la garde réelle.

---

### Task 4.4: `RowEventsService` + `POST /api/rows` (création, insertion positionnée)

**Files:**
- Create: `apps/api/src/events/row-events.service.ts`, `apps/api/src/events/events.module.ts`
- Modify: `apps/api/src/rows/rows.service.ts`, `apps/api/src/rows/rows.controller.ts`, `apps/api/src/rows/rows.module.ts`
- Test: `apps/api/test/rows-create.e2e-spec.ts`

**Interfaces:**
- Consomme : `PrismaService`, `CurrentUserId` (Task 4.3), `parseOrThrow` (Feature 3), `createRowSchema` de `@suivi/shared` (`z.object({ month, position: z.number().int().min(0).optional() })`, `month` au format `AAAA-MM`), `toRowDTO` (Task 4.2).
- Produit :
  - `RowEventsService.record(tx: Prisma.TransactionClient, input: { rowId: string; userId: string; type: RowEventDTO['type']; payload: unknown }): Promise<void>` — consigne un événement DANS la transaction en cours (Tasks 4.5 à 4.7).
  - `RowEventsService.listForRow(rowId: string): Promise<RowEventDTO[]>` — récent d'abord, max 100, `userName` joint (Task 4.8).
  - `EventsModule` (fournit et exporte `RowEventsService`).
  - `RowsService.create(dto: CreateRowInput, userId: string): Promise<RowDTO>` avec `interface CreateRowInput { month: string; position?: number }`.
  - `POST /api/rows` → 201 `RowDTO` (position absente = fin du mois ; position fournie = insertion avec décalage des suivantes), 422 `VALIDATION_FAILED`.

- [ ] **Étape 1: écrire le test e2e qui échoue**

Créer `apps/api/test/rows-create.e2e-spec.ts` :

```ts
import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('POST /api/rows (e2e)', () => {
  let ctx: TestContext;
  let cookie: string[];
  let userId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    const session = await seedUserAndLogin(ctx);
    cookie = session.cookie;
    userId = session.userId;
  });

  it('crée une ligne vide en fin de mois quand position est absente', async () => {
    await ctx.prisma.row.create({ data: { month: '2026-08', position: 0 } });
    await ctx.prisma.row.create({ data: { month: '2026-08', position: 1 } });

    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows')
      .set('Cookie', cookie)
      .send({ month: '2026-08' })
      .expect(201);

    expect(res.body).toMatchObject({
      month: '2026-08',
      position: 2,
      data: {},
      formats: {},
      version: 0,
      archived: false,
    });
    expect(typeof res.body.id).toBe('string');
  });

  it('crée la première ligne d un mois en position 0', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows')
      .set('Cookie', cookie)
      .send({ month: '2026-09' })
      .expect(201);
    expect(res.body.position).toBe(0);
  });

  it('insère à la position demandée et décale les lignes suivantes', async () => {
    const first = await ctx.prisma.row.create({
      data: { month: '2026-08', position: 0, data: { client: 'ALPHA' } },
    });
    const second = await ctx.prisma.row.create({
      data: { month: '2026-08', position: 1, data: { client: 'BETA' } },
    });

    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows')
      .set('Cookie', cookie)
      .send({ month: '2026-08', position: 1 })
      .expect(201);

    expect(res.body.position).toBe(1);
    const positions = await ctx.prisma.row.findMany({
      where: { month: '2026-08' },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    });
    expect(positions).toEqual([
      { id: first.id, position: 0 },
      { id: res.body.id, position: 1 },
      { id: second.id, position: 2 },
    ]);
  });

  it('ne décale pas les lignes d un autre mois', async () => {
    const autre = await ctx.prisma.row.create({ data: { month: '2026-09', position: 0 } });
    await request(ctx.app.getHttpServer())
      .post('/api/rows')
      .set('Cookie', cookie)
      .send({ month: '2026-08', position: 0 })
      .expect(201);
    const reloaded = await ctx.prisma.row.findUniqueOrThrow({ where: { id: autre.id } });
    expect(reloaded.position).toBe(0);
  });

  it('consigne un RowEvent create attribué à l auteur', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows')
      .set('Cookie', cookie)
      .send({ month: '2026-08' })
      .expect(201);

    const events = await ctx.prisma.rowEvent.findMany({ where: { rowId: res.body.id } });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('create');
    expect(events[0].userId).toBe(userId);
    expect(events[0].payload).toEqual({ month: '2026-08', position: 0 });
  });

  it('refuse un mois mal formé : 422 VALIDATION_FAILED', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows')
      .set('Cookie', cookie)
      .send({ month: 'AOUT 2026' })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('refuse une position négative : 422 VALIDATION_FAILED', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows')
      .set('Cookie', cookie)
      .send({ month: '2026-08', position: -1 })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});
```

- [ ] **Étape 2: lancer le test e2e**

```bash
pnpm --filter @suivi/api test:e2e -- rows-create.e2e-spec.ts
```

Attendu : **FAIL** — `POST /api/rows` répond 404 (route absente) pour les 7 cas.

- [ ] **Étape 3: écrire le service d'événements et son module**

Créer `apps/api/src/events/row-events.service.ts` :

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RowEventDTO } from '@suivi/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordEventInput {
  rowId: string;
  userId: string;
  type: RowEventDTO['type'];
  payload: unknown;
}

/** Nombre maximal d'événements retournés par l'historique d'une ligne. */
export const EVENTS_PAGE_SIZE = 100;

@Injectable()
export class RowEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Consigne un événement DANS la transaction en cours : l'écriture de la
   * ligne et son journal sont commités ensemble ou pas du tout.
   */
  async record(tx: Prisma.TransactionClient, input: RecordEventInput): Promise<void> {
    await tx.rowEvent.create({
      data: {
        rowId: input.rowId,
        userId: input.userId,
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
  }

  /** Historique d'une ligne : plus récent d'abord, 100 entrées maximum. */
  async listForRow(rowId: string): Promise<RowEventDTO[]> {
    const events = await this.prisma.rowEvent.findMany({
      where: { rowId },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: EVENTS_PAGE_SIZE,
      include: { user: { select: { displayName: true } } },
    });
    return events.map((event) => ({
      id: event.id,
      rowId: event.rowId,
      userId: event.userId,
      userName: event.user.displayName,
      at: event.at.toISOString(),
      type: event.type as RowEventDTO['type'],
      payload: event.payload,
    }));
  }
}
```

Créer `apps/api/src/events/events.module.ts` :

```ts
import { Module } from '@nestjs/common';
import { RowEventsService } from './row-events.service';

@Module({
  providers: [RowEventsService],
  exports: [RowEventsService],
})
export class EventsModule {}
```

- [ ] **Étape 4: ajouter la création dans le service de lignes**

Remplacer `apps/api/src/rows/rows.service.ts` par :

```ts
import { Injectable } from '@nestjs/common';
import type { RowDTO } from '@suivi/shared';
import { RowEventsService } from '../events/row-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { toRowDTO } from './rows.mapper';

export interface CreateRowInput {
  month: string;
  position?: number;
}

@Injectable()
export class RowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: RowEventsService,
  ) {}

  /** Lignes actives d'un mois, dans l'ordre manuel. */
  async findByMonth(month: string): Promise<RowDTO[]> {
    const rows = await this.prisma.row.findMany({
      where: { month, archived: false },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toRowDTO);
  }

  /** Vue Archives : toutes les lignes archivées, tous mois confondus. */
  async findArchived(): Promise<RowDTO[]> {
    const rows = await this.prisma.row.findMany({
      where: { archived: true },
      orderBy: [{ month: 'asc' }, { position: 'asc' }],
    });
    return rows.map(toRowDTO);
  }

  /**
   * Crée une ligne vide. Sans `position`, la ligne est ajoutée en fin de mois ;
   * avec `position`, les lignes actives de rang >= position sont décalées de +1.
   */
  async create(dto: CreateRowInput, userId: string): Promise<RowDTO> {
    const created = await this.prisma.$transaction(async (tx) => {
      const siblings = await tx.row.count({ where: { month: dto.month, archived: false } });
      const position =
        dto.position === undefined ? siblings : Math.min(Math.max(dto.position, 0), siblings);

      if (position < siblings) {
        await tx.row.updateMany({
          where: { month: dto.month, archived: false, position: { gte: position } },
          data: { position: { increment: 1 } },
        });
      }

      const row = await tx.row.create({
        data: { month: dto.month, position, createdBy: userId },
      });
      await this.events.record(tx, {
        rowId: row.id,
        userId,
        type: 'create',
        payload: { month: dto.month, position },
      });
      return row;
    });

    return toRowDTO(created);
  }
}
```

- [ ] **Étape 5: exposer la route et brancher le module**

Modifier `apps/api/src/rows/rows.controller.ts` : compléter les imports et ajouter la méthode `create` dans la classe existante.

```ts
import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { createRowSchema } from '@suivi/shared';
import type { RowDTO } from '@suivi/shared';
import { CurrentUserId } from '../auth/current-user.decorator';
```

```ts
  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown, @CurrentUserId() userId: string): Promise<RowDTO> {
    return this.rows.create(parseOrThrow(createRowSchema, body), userId);
  }
```

Modifier `apps/api/src/rows/rows.module.ts` :

```ts
import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { RowsController } from './rows.controller';
import { RowsService } from './rows.service';

@Module({
  imports: [EventsModule],
  controllers: [RowsController],
  providers: [RowsService],
  exports: [RowsService],
})
export class RowsModule {}
```

- [ ] **Étape 6: relancer le test e2e**

```bash
pnpm --filter @suivi/api test:e2e -- rows-create.e2e-spec.ts
```

Attendu : **PASS** (7 cas verts).

- [ ] **Étape 7: commit**

```bash
git add apps/api/src/events/row-events.service.ts apps/api/src/events/events.module.ts apps/api/src/rows/rows.service.ts apps/api/src/rows/rows.controller.ts apps/api/src/rows/rows.module.ts apps/api/test/rows-create.e2e-spec.ts && git commit -m "feat(rows): POST /api/rows avec insertion positionnée et RowEvent create"
```

---

### Task 4.5: `PATCH /api/rows/:id` — fusion clé par clé, version et conflit 409

**Files:**
- Modify: `apps/api/src/rows/rows.service.ts`, `apps/api/src/rows/rows.controller.ts`
- Test: `apps/api/test/rows-patch.e2e-spec.ts`

**Interfaces:**
- Consomme : helpers de la Task 4.1 (`mergeData`, `mergeFormats`, `changedKeysOf`, `buildDiff`, `conflictKeys`, `versionOfPayload`), `RowEventsService.record` (Task 4.4), `patchRowSchema` de `@suivi/shared` (`{ expectedVersion: number; patch?: Record<string, string|number|null>; formats?: Record<string, {bg?: string} | null> }`), `Prisma` de `@prisma/client`.
- Produit :
  - `interface PatchRowInput { expectedVersion: number; patch?: Record<string, CellValue>; formats?: Record<string, CellFormat | null> }`
  - `RowsService.patch(id: string, dto: PatchRowInput, userId: string): Promise<RowDTO>` — transaction sérialisée avec verrou `SELECT ... FOR UPDATE`, merge clé par clé, `version++`, `RowEvent` de type `update` avec `payload = { version, changedKeys, diff }`.
  - `PATCH /api/rows/:id` → 200 `RowDTO` ; 404 `NOT_FOUND` ; 422 `VALIDATION_FAILED` ; 409 `VERSION_CONFLICT` avec `details: { current: RowDTO, conflictKeys: string[] }`.

- [ ] **Étape 1: écrire le test e2e qui échoue**

Créer `apps/api/test/rows-patch.e2e-spec.ts` :

```ts
import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('PATCH /api/rows/:id (e2e)', () => {
  let ctx: TestContext;
  let cookie: string[];
  let userId: string;
  let rowId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    const session = await seedUserAndLogin(ctx);
    cookie = session.cookie;
    userId = session.userId;
    const row = await ctx.prisma.row.create({
      data: { month: '2026-08', position: 0, data: { client: 'ARCADIA' } },
    });
    rowId = row.id;
  });

  it('fusionne le patch clé par clé et incrémente la version', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { statut: 'NEW' } })
      .expect(200);

    expect(res.body.data).toEqual({ client: 'ARCADIA', statut: 'NEW' });
    expect(res.body.version).toBe(1);
  });

  it('efface une clé quand la valeur envoyée est null', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { client: null } })
      .expect(200);
    expect(res.body.data).toEqual({});
  });

  it('fusionne les formats et retire un format avec null', async () => {
    await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, formats: { num_chrono: { bg: '#FF0000' } } })
      .expect(200);

    const ajout = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 1, formats: { impe: { bg: '#FFFF00' } } })
      .expect(200);
    expect(ajout.body.formats).toEqual({
      num_chrono: { bg: '#FF0000' },
      impe: { bg: '#FFFF00' },
    });

    const retrait = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 2, formats: { num_chrono: null } })
      .expect(200);
    expect(retrait.body.formats).toEqual({ impe: { bg: '#FFFF00' } });
    expect(retrait.body.version).toBe(3);
  });

  it('consigne un RowEvent update avec version, changedKeys et diff', async () => {
    await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { client: 'AUTRE', statut: 'NEW' } })
      .expect(200);

    const events = await ctx.prisma.rowEvent.findMany({ where: { rowId, type: 'update' } });
    expect(events).toHaveLength(1);
    expect(events[0].userId).toBe(userId);
    expect(events[0].payload).toEqual({
      version: 1,
      changedKeys: ['client', 'statut'],
      diff: {
        client: { from: 'ARCADIA', to: 'AUTRE' },
        statut: { from: null, to: 'NEW' },
      },
    });
  });

  it('accepte une version dépassée si les clés touchées sont différentes', async () => {
    await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { statut: 'NEW' } })
      .expect(200);

    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { heure: '14H' } })
      .expect(200);

    expect(res.body.data).toEqual({ client: 'ARCADIA', statut: 'NEW', heure: '14H' });
    expect(res.body.version).toBe(2);
  });

  it('refuse une version dépassée sur une clé déjà modifiée : 409 VERSION_CONFLICT', async () => {
    await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { client: 'PREMIER' } })
      .expect(200);

    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { client: 'SECOND', heure: '14H' } })
      .expect(409);

    expect(res.body.code).toBe('VERSION_CONFLICT');
    expect(res.body.details.conflictKeys).toEqual(['client']);
    expect(res.body.details.current).toMatchObject({
      id: rowId,
      version: 1,
      data: { client: 'PREMIER' },
    });
  });

  it('détecte le conflit sur une clé de formats', async () => {
    await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, formats: { impe: { bg: '#FF0000' } } })
      .expect(200);

    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, formats: { impe: { bg: '#FFFF00' } } })
      .expect(409);

    expect(res.body.details.conflictKeys).toEqual(['impe']);
  });

  it('laisse passer deux PATCH concurrents portant sur des clés différentes', async () => {
    const [a, b] = await Promise.all([
      request(ctx.app.getHttpServer())
        .patch(`/api/rows/${rowId}`)
        .set('Cookie', cookie)
        .send({ expectedVersion: 0, patch: { statut: 'NEW' } }),
      request(ctx.app.getHttpServer())
        .patch(`/api/rows/${rowId}`)
        .set('Cookie', cookie)
        .send({ expectedVersion: 0, patch: { heure: '14H' } }),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    const row = await ctx.prisma.row.findUniqueOrThrow({ where: { id: rowId } });
    expect(row.data).toEqual({ client: 'ARCADIA', statut: 'NEW', heure: '14H' });
    expect(row.version).toBe(2);
  });

  it('refuse une ligne inconnue : 404 NOT_FOUND', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch('/api/rows/inconnue')
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { client: 'X' } })
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('refuse un corps sans expectedVersion : 422 VALIDATION_FAILED', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ patch: { client: 'X' } })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('refuse une valeur de patch non scalaire : 422 VALIDATION_FAILED', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { client: { nom: 'X' } } })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});
```

- [ ] **Étape 2: lancer le test e2e**

```bash
pnpm --filter @suivi/api test:e2e -- rows-patch.e2e-spec.ts
```

Attendu : **FAIL** — `PATCH /api/rows/:id` répond 404 (route absente) pour les 11 cas.

- [ ] **Étape 3: implémenter la fusion transactionnelle dans le service**

Modifier `apps/api/src/rows/rows.service.ts` : remplacer le bloc d'imports en tête de fichier par celui-ci,

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CellFormat, CellValue, RowDTO } from '@suivi/shared';
import { RowEventsService } from '../events/row-events.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildDiff,
  changedKeysOf,
  conflictKeys,
  mergeData,
  mergeFormats,
  versionOfPayload,
  type FormatsPatch,
  type RowData,
  type RowFormats,
} from './merge';
import { toRowDTO } from './rows.mapper';
```

ajouter au-dessus de la classe les constantes, le type d'entrée et le détecteur d'échec de sérialisation,

```ts
/**
 * Fenêtre d'événements relus pour la détection de conflit. Un client ne peut
 * pas détenir une version antérieure à 200 éditions (toute reconnexion
 * resynchronise la ligne entière), la fenêtre est donc largement suffisante.
 */
const CONFLICT_SCAN_LIMIT = 200;
/** Nombre de rejeux d'une transaction sérialisable interrompue par un concurrent. */
const SERIALIZATION_RETRIES = 3;

export interface PatchRowInput {
  expectedVersion: number;
  patch?: Record<string, CellValue>;
  formats?: Record<string, CellFormat | null>;
}

/** PostgreSQL 40001 / Prisma P2034 : la transaction doit être rejouée. */
function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034';
  }
  const message = error instanceof Error ? error.message : '';
  return message.includes('40001') || message.includes('could not serialize');
}
```

puis ajouter dans la classe `RowsService` les deux méthodes suivantes :

```ts
  /**
   * Fusion clé par clé d'une ligne (cœur de la co-édition).
   * Transaction sérialisable + verrou de ligne `FOR UPDATE` : deux PATCH
   * concurrents sur la même ligne sont appliqués l'un après l'autre.
   * Conflit (409) UNIQUEMENT si `expectedVersion < version` ET qu'une clé du
   * patch a été modifiée par un événement postérieur à `expectedVersion`.
   */
  async patch(id: string, dto: PatchRowInput, userId: string): Promise<RowDTO> {
    const patch: RowData = dto.patch ?? {};
    const formatsPatch: FormatsPatch = dto.formats ?? {};
    const keys = changedKeysOf(patch, formatsPatch);

    const updated = await this.runSerialized(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Row" WHERE "id" = ${id} FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ligne introuvable.' });
      }
      const row = await tx.row.findUniqueOrThrow({ where: { id } });

      if (dto.expectedVersion < row.version) {
        const recent = await tx.rowEvent.findMany({
          where: { rowId: id, type: { in: ['update', 'format'] } },
          orderBy: [{ at: 'desc' }, { id: 'desc' }],
          take: CONFLICT_SCAN_LIMIT,
          select: { payload: true },
        });
        // Un événement sans version explicite est considéré postérieur (prudence).
        const posterior = recent.filter((event) => {
          const version = versionOfPayload(event.payload);
          return version === null || version > dto.expectedVersion;
        });
        const conflicts = conflictKeys(posterior, keys);
        if (conflicts.length > 0) {
          throw new ConflictException({
            code: 'VERSION_CONFLICT',
            message: 'Cette ligne a été modifiée entre-temps.',
            details: { current: toRowDTO(row), conflictKeys: conflicts },
          });
        }
      }

      const currentDto = toRowDTO(row);
      const currentData: RowData = currentDto.data;
      const currentFormats: RowFormats = currentDto.formats;
      const nextVersion = row.version + 1;

      const saved = await tx.row.update({
        where: { id },
        data: {
          data: mergeData(currentData, patch) as Prisma.InputJsonObject,
          formats: mergeFormats(currentFormats, formatsPatch) as Prisma.InputJsonObject,
          version: nextVersion,
        },
      });
      await this.events.record(tx, {
        rowId: id,
        userId,
        type: 'update',
        payload: {
          version: nextVersion,
          changedKeys: keys,
          diff: buildDiff(currentData, patch),
        },
      });
      return saved;
    });

    return toRowDTO(updated);
  }

  /** Transaction sérialisable, rejouée si un concurrent l'a fait échouer. */
  private async runSerialized<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    let lastError: unknown = new Error('Transaction non exécutée.');
    for (let attempt = 0; attempt < SERIALIZATION_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 15000,
        });
      } catch (error) {
        if (!isSerializationFailure(error)) {
          throw error;
        }
        lastError = error;
      }
    }
    throw lastError;
  }
```

- [ ] **Étape 4: exposer la route PATCH**

Modifier `apps/api/src/rows/rows.controller.ts` : ajouter `Param` et `Patch` aux imports `@nestjs/common`, `patchRowSchema` aux imports `@suivi/shared`, puis ajouter la méthode dans la classe.

```ts
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createRowSchema, patchRowSchema } from '@suivi/shared';
```

```ts
  @Patch(':id')
  async patch(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUserId() userId: string,
  ): Promise<RowDTO> {
    return this.rows.patch(id, parseOrThrow(patchRowSchema, body), userId);
  }
```

- [ ] **Étape 5: relancer le test e2e**

```bash
pnpm --filter @suivi/api test:e2e -- rows-patch.e2e-spec.ts
```

Attendu : **PASS** (11 cas verts, dont le 409 avec `conflictKeys` et les deux PATCH concurrents en 200/200).

- [ ] **Étape 6: commit**

```bash
git add apps/api/src/rows/rows.service.ts apps/api/src/rows/rows.controller.ts apps/api/test/rows-patch.e2e-spec.ts && git commit -m "feat(rows): PATCH fusion clé par clé, version++ et conflit 409 VERSION_CONFLICT"
```

> À vérifier à l'exécution : sous PostgreSQL, un `SELECT ... FOR UPDATE` bloqué en isolation `Serializable` lève l'erreur 40001 à la libération du verrou — `runSerialized` la rejoue. Si le test des PATCH concurrents remonte une erreur 500 au lieu de 200/200, journaliser l'erreur capturée dans `isSerializationFailure` pour confirmer qu'elle porte bien le code `P2034` (sinon compléter la détection avec le code effectivement remonté par Prisma 6).

---

### Task 4.6: `POST /api/rows/:id/move` — changement de mois/position et renumérotation

**Files:**
- Modify: `apps/api/src/rows/rows.service.ts`, `apps/api/src/rows/rows.controller.ts`
- Test: `apps/api/test/rows-move.e2e-spec.ts`

**Interfaces:**
- Consomme : `moveRowSchema` de `@suivi/shared` (`{ month?: string; position?: number }`), `RowEventsService.record`, `toRowDTO`.
- Produit :
  - `interface MoveRowInput { month?: string; position?: number }`
  - `RowsService.move(id: string, dto: MoveRowInput, userId: string): Promise<RowDTO>` — renumérote le mois cible ET le mois source en `0..n-1`, consigne un `RowEvent` de type `move` avec `payload = { fromMonth, toMonth, fromPosition, toPosition }`. La ligne relue avant écriture est nommée `existing` (contrat interne pour la Feature 5).
  - `RowsService.renumberMonth(tx: Prisma.TransactionClient, month: string): Promise<void>` (privée, réutilisée en Task 4.7).
  - `POST /api/rows/:id/move` → 200 `RowDTO` ; 404 `NOT_FOUND` ; 422 `VALIDATION_FAILED`.

- [ ] **Étape 1: écrire le test e2e qui échoue**

Créer `apps/api/test/rows-move.e2e-spec.ts` :

```ts
import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('POST /api/rows/:id/move (e2e)', () => {
  let ctx: TestContext;
  let cookie: string[];

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    cookie = (await seedUserAndLogin(ctx)).cookie;
  });

  async function seedMonth(month: string, clients: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 0; index < clients.length; index += 1) {
      const row = await ctx.prisma.row.create({
        data: { month, position: index, data: { client: clients[index] } },
      });
      ids.push(row.id);
    }
    return ids;
  }

  async function clientsOf(month: string): Promise<string[]> {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/rows?month=${month}`)
      .set('Cookie', cookie)
      .expect(200);
    return res.body.map((row: { data: { client: string } }) => row.data.client);
  }

  it('remonte une ligne dans son mois et renumérote de 0 à n-1', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B', 'C']);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[2]}/move`)
      .set('Cookie', cookie)
      .send({ position: 0 })
      .expect(200);

    expect(res.body.position).toBe(0);
    expect(await clientsOf('2026-08')).toEqual(['C', 'A', 'B']);
    const positions = await ctx.prisma.row.findMany({
      where: { month: '2026-08' },
      orderBy: { position: 'asc' },
      select: { position: true },
    });
    expect(positions.map((p) => p.position)).toEqual([0, 1, 2]);
  });

  it('descend une ligne dans son mois', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B', 'C']);
    await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/move`)
      .set('Cookie', cookie)
      .send({ position: 2 })
      .expect(200);
    expect(await clientsOf('2026-08')).toEqual(['B', 'C', 'A']);
  });

  it('déplace vers un autre mois en fin de liste et renumérote la source', async () => {
    const aout = await seedMonth('2026-08', ['A', 'B', 'C']);
    await seedMonth('2026-09', ['X', 'Y']);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${aout[1]}/move`)
      .set('Cookie', cookie)
      .send({ month: '2026-09' })
      .expect(200);

    expect(res.body).toMatchObject({ month: '2026-09', position: 2 });
    expect(await clientsOf('2026-08')).toEqual(['A', 'C']);
    expect(await clientsOf('2026-09')).toEqual(['X', 'Y', 'B']);
    const source = await ctx.prisma.row.findMany({
      where: { month: '2026-08' },
      orderBy: { position: 'asc' },
      select: { position: true },
    });
    expect(source.map((p) => p.position)).toEqual([0, 1]);
  });

  it('déplace vers un autre mois à une position donnée', async () => {
    const aout = await seedMonth('2026-08', ['A', 'B']);
    await seedMonth('2026-09', ['X', 'Y']);

    await request(ctx.app.getHttpServer())
      .post(`/api/rows/${aout[0]}/move`)
      .set('Cookie', cookie)
      .send({ month: '2026-09', position: 1 })
      .expect(200);

    expect(await clientsOf('2026-09')).toEqual(['X', 'A', 'Y']);
  });

  it('borne une position supérieure au nombre de lignes', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B']);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/move`)
      .set('Cookie', cookie)
      .send({ position: 99 })
      .expect(200);
    expect(res.body.position).toBe(1);
    expect(await clientsOf('2026-08')).toEqual(['B', 'A']);
  });

  it('consigne un RowEvent move décrivant l origine et la destination', async () => {
    const aout = await seedMonth('2026-08', ['A', 'B']);
    await request(ctx.app.getHttpServer())
      .post(`/api/rows/${aout[1]}/move`)
      .set('Cookie', cookie)
      .send({ month: '2026-09', position: 0 })
      .expect(200);

    const events = await ctx.prisma.rowEvent.findMany({ where: { rowId: aout[1], type: 'move' } });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({
      fromMonth: '2026-08',
      toMonth: '2026-09',
      fromPosition: 1,
      toPosition: 0,
    });
  });

  it('ne change pas la version de la ligne', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B']);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/move`)
      .set('Cookie', cookie)
      .send({ position: 1 })
      .expect(200);
    expect(res.body.version).toBe(0);
  });

  it('refuse une ligne inconnue : 404 NOT_FOUND', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows/inconnue/move')
      .set('Cookie', cookie)
      .send({ position: 0 })
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('refuse un mois mal formé : 422 VALIDATION_FAILED', async () => {
    const ids = await seedMonth('2026-08', ['A']);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/move`)
      .set('Cookie', cookie)
      .send({ month: '2026-13' })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});
```

- [ ] **Étape 2: lancer le test e2e**

```bash
pnpm --filter @suivi/api test:e2e -- rows-move.e2e-spec.ts
```

Attendu : **FAIL** — `POST /api/rows/:id/move` répond 404 (route absente) pour les 9 cas.

- [ ] **Étape 3: implémenter `move` et `renumberMonth`**

Modifier `apps/api/src/rows/rows.service.ts` : ajouter le type d'entrée sous `PatchRowInput`,

```ts
export interface MoveRowInput {
  month?: string;
  position?: number;
}
```

puis ajouter les deux méthodes dans la classe `RowsService` :

```ts
  /**
   * Déplace une ligne dans son mois ou vers un autre mois.
   * L'ordre cible est reconstruit explicitement (liste d'ids + splice) puis
   * réécrit en 0..n-1 ; le mois source est renuméroté à son tour.
   */
  async move(id: string, dto: MoveRowInput, userId: string): Promise<RowDTO> {
    const existing = await this.prisma.row.findUnique({ where: { id } });
    if (existing === null) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ligne introuvable.' });
    }
    const targetMonth = dto.month ?? existing.month;

    const moved = await this.prisma.$transaction(async (tx) => {
      const others = await tx.row.findMany({
        where: { month: targetMonth, archived: false, id: { not: id } },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      const ids = others.map((row) => row.id);
      const target = Math.min(Math.max(dto.position ?? ids.length, 0), ids.length);
      ids.splice(target, 0, id);

      for (let index = 0; index < ids.length; index += 1) {
        await tx.row.update({
          where: { id: ids[index] },
          data: ids[index] === id ? { month: targetMonth, position: index } : { position: index },
        });
      }

      if (existing.month !== targetMonth) {
        await this.renumberMonth(tx, existing.month);
      }

      await this.events.record(tx, {
        rowId: id,
        userId,
        type: 'move',
        payload: {
          fromMonth: existing.month,
          toMonth: targetMonth,
          fromPosition: existing.position,
          toPosition: target,
        },
      });

      return tx.row.findUniqueOrThrow({ where: { id } });
    });

    return toRowDTO(moved);
  }

  /** Réécrit les positions actives d'un mois en 0..n-1 sans changer l'ordre. */
  private async renumberMonth(tx: Prisma.TransactionClient, month: string): Promise<void> {
    const rows = await tx.row.findMany({
      where: { month, archived: false },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, position: true },
    });
    for (let index = 0; index < rows.length; index += 1) {
      if (rows[index].position !== index) {
        await tx.row.update({ where: { id: rows[index].id }, data: { position: index } });
      }
    }
  }
```

- [ ] **Étape 4: exposer la route move**

Modifier `apps/api/src/rows/rows.controller.ts` : ajouter `moveRowSchema` aux imports `@suivi/shared` et la méthode dans la classe.

```ts
import { createRowSchema, moveRowSchema, patchRowSchema } from '@suivi/shared';
```

```ts
  @Post(':id/move')
  @HttpCode(200)
  async move(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUserId() userId: string,
  ): Promise<RowDTO> {
    return this.rows.move(id, parseOrThrow(moveRowSchema, body), userId);
  }
```

- [ ] **Étape 5: relancer le test e2e**

```bash
pnpm --filter @suivi/api test:e2e -- rows-move.e2e-spec.ts
```

Attendu : **PASS** (9 cas verts).

- [ ] **Étape 6: commit**

```bash
git add apps/api/src/rows/rows.service.ts apps/api/src/rows/rows.controller.ts apps/api/test/rows-move.e2e-spec.ts && git commit -m "feat(rows): POST /rows/:id/move avec renumérotation source et cible"
```

---

### Task 4.7: `POST /api/rows/:id/archive` et `DELETE /api/rows/:id`

**Files:**
- Modify: `apps/api/src/rows/rows.service.ts`, `apps/api/src/rows/rows.controller.ts`
- Test: `apps/api/test/rows-archive-delete.e2e-spec.ts`

**Interfaces:**
- Consomme : `renumberMonth` (Task 4.6), `RowEventsService.record`, `toRowDTO`, `zod` (schéma local `archiveBodySchema` — aucun schéma d'archivage n'est prévu par les contrats partagés).
- Produit :
  - `RowsService.archive(id: string, archived: boolean, userId: string): Promise<RowDTO>` — archive (la ligne quitte l'ordre du mois, qui est renuméroté) ou désarchive (la ligne revient en fin de son mois) ; `RowEvent` de type `archive` avec `payload = { archived }`.
  - `RowsService.remove(id: string): Promise<void>` — 404 si absente, suppression + renumérotation du mois. Aucun `RowEvent` de suppression (cascade, cf. note 3 de la feature). La ligne relue est nommée `existing` (contrat interne pour la Feature 5).
  - `POST /api/rows/:id/archive` → 200 `RowDTO` ; 404 `NOT_FOUND` ; 422 `VALIDATION_FAILED`.
  - `DELETE /api/rows/:id` → 204 ; 404 `NOT_FOUND`.

- [ ] **Étape 1: écrire le test e2e qui échoue**

Créer `apps/api/test/rows-archive-delete.e2e-spec.ts` :

```ts
import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('Archivage et suppression de lignes (e2e)', () => {
  let ctx: TestContext;
  let cookie: string[];

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    cookie = (await seedUserAndLogin(ctx)).cookie;
  });

  async function seedMonth(month: string, clients: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 0; index < clients.length; index += 1) {
      const row = await ctx.prisma.row.create({
        data: { month, position: index, data: { client: clients[index] } },
      });
      ids.push(row.id);
    }
    return ids;
  }

  async function clientsOf(month: string): Promise<string[]> {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/rows?month=${month}`)
      .set('Cookie', cookie)
      .expect(200);
    return res.body.map((row: { data: { client: string } }) => row.data.client);
  }

  it('archive une ligne : elle quitte le mois et rejoint les archives', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B', 'C']);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[1]}/archive`)
      .set('Cookie', cookie)
      .send({ archived: true })
      .expect(200);

    expect(res.body).toMatchObject({ id: ids[1], archived: true });
    expect(await clientsOf('2026-08')).toEqual(['A', 'C']);

    const archives = await request(ctx.app.getHttpServer())
      .get('/api/rows?archived=true')
      .set('Cookie', cookie)
      .expect(200);
    expect(archives.body.map((row: { id: string }) => row.id)).toEqual([ids[1]]);
  });

  it('renumérote le mois après archivage', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B', 'C']);
    await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/archive`)
      .set('Cookie', cookie)
      .send({ archived: true })
      .expect(200);

    const rest = await ctx.prisma.row.findMany({
      where: { month: '2026-08', archived: false },
      orderBy: { position: 'asc' },
      select: { position: true },
    });
    expect(rest.map((row) => row.position)).toEqual([0, 1]);
  });

  it('désarchive une ligne : elle revient en fin de son mois', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B']);
    await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/archive`)
      .set('Cookie', cookie)
      .send({ archived: true })
      .expect(200);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/archive`)
      .set('Cookie', cookie)
      .send({ archived: false })
      .expect(200);

    expect(res.body).toMatchObject({ archived: false, position: 1 });
    expect(await clientsOf('2026-08')).toEqual(['B', 'A']);
  });

  it('consigne un RowEvent archive', async () => {
    const ids = await seedMonth('2026-08', ['A']);
    await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/archive`)
      .set('Cookie', cookie)
      .send({ archived: true })
      .expect(200);

    const events = await ctx.prisma.rowEvent.findMany({ where: { rowId: ids[0], type: 'archive' } });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({ archived: true });
  });

  it('refuse un archivage sur une ligne inconnue : 404 NOT_FOUND', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows/inconnue/archive')
      .set('Cookie', cookie)
      .send({ archived: true })
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('refuse un corps d archivage invalide : 422 VALIDATION_FAILED', async () => {
    const ids = await seedMonth('2026-08', ['A']);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/archive`)
      .set('Cookie', cookie)
      .send({ archived: 'oui' })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('supprime une ligne : 204, mois renuméroté', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B', 'C']);

    await request(ctx.app.getHttpServer())
      .delete(`/api/rows/${ids[0]}`)
      .set('Cookie', cookie)
      .expect(204);

    expect(await clientsOf('2026-08')).toEqual(['B', 'C']);
    const rest = await ctx.prisma.row.findMany({
      where: { month: '2026-08' },
      orderBy: { position: 'asc' },
      select: { position: true },
    });
    expect(rest.map((row) => row.position)).toEqual([0, 1]);
  });

  it('supprime en cascade les événements de la ligne (aucun événement delete conservé)', async () => {
    const ids = await seedMonth('2026-08', ['A']);
    await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${ids[0]}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { statut: 'NEW' } })
      .expect(200);
    expect(await ctx.prisma.rowEvent.count({ where: { rowId: ids[0] } })).toBe(1);

    await request(ctx.app.getHttpServer())
      .delete(`/api/rows/${ids[0]}`)
      .set('Cookie', cookie)
      .expect(204);

    expect(await ctx.prisma.rowEvent.count({ where: { rowId: ids[0] } })).toBe(0);
  });

  it('refuse la suppression d une ligne inconnue : 404 NOT_FOUND', async () => {
    const res = await request(ctx.app.getHttpServer())
      .delete('/api/rows/inconnue')
      .set('Cookie', cookie)
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
```

- [ ] **Étape 2: lancer le test e2e**

```bash
pnpm --filter @suivi/api test:e2e -- rows-archive-delete.e2e-spec.ts
```

Attendu : **FAIL** — `POST /api/rows/:id/archive` et `DELETE /api/rows/:id` répondent 404 (routes absentes) pour les 9 cas.

- [ ] **Étape 3: implémenter `archive` et `remove`**

Modifier `apps/api/src/rows/rows.service.ts` : ajouter les deux méthodes dans la classe `RowsService`.

```ts
  /**
   * Archive ou désarchive une ligne. À l'archivage, le mois est renuméroté ;
   * au désarchivage, la ligne revient en fin de son mois d'origine.
   */
  async archive(id: string, archived: boolean, userId: string): Promise<RowDTO> {
    const existing = await this.prisma.row.findUnique({ where: { id } });
    if (existing === null) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ligne introuvable.' });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (archived) {
        await tx.row.update({ where: { id }, data: { archived: true } });
      } else {
        const active = await tx.row.count({ where: { month: existing.month, archived: false } });
        await tx.row.update({ where: { id }, data: { archived: false, position: active } });
      }
      await this.renumberMonth(tx, existing.month);
      await this.events.record(tx, { rowId: id, userId, type: 'archive', payload: { archived } });
      return tx.row.findUniqueOrThrow({ where: { id } });
    });

    return toRowDTO(updated);
  }

  /**
   * Supprime définitivement une ligne et renumérote son mois.
   * Aucun RowEvent 'delete' n'est consigné : RowEvent.rowId est en cascade,
   * l'événement serait effacé par la suppression dans la même transaction.
   */
  async remove(id: string): Promise<void> {
    const existing = await this.prisma.row.findUnique({ where: { id } });
    if (existing === null) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ligne introuvable.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.row.delete({ where: { id } });
      await this.renumberMonth(tx, existing.month);
    });
  }
```

- [ ] **Étape 4: exposer les routes archive et delete**

Modifier `apps/api/src/rows/rows.controller.ts` : ajouter `Delete` aux imports `@nestjs/common`, déclarer le schéma local d'archivage sous `listRowsQuerySchema`, puis ajouter les deux méthodes dans la classe.

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
```

```ts
/** Corps de POST /api/rows/:id/archive (schéma local : absent des contrats partagés). */
const archiveBodySchema = z.object({ archived: z.boolean() });
```

```ts
  @Post(':id/archive')
  @HttpCode(200)
  async archive(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUserId() userId: string,
  ): Promise<RowDTO> {
    const dto = parseOrThrow(archiveBodySchema, body);
    return this.rows.archive(id, dto.archived, userId);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.rows.remove(id);
  }
```

- [ ] **Étape 5: relancer le test e2e**

```bash
pnpm --filter @suivi/api test:e2e -- rows-archive-delete.e2e-spec.ts
```

Attendu : **PASS** (9 cas verts).

- [ ] **Étape 6: commit**

```bash
git add apps/api/src/rows/rows.service.ts apps/api/src/rows/rows.controller.ts apps/api/test/rows-archive-delete.e2e-spec.ts && git commit -m "feat(rows): archivage et suppression avec renumérotation du mois"
```

---

### Task 4.8: `GET /api/rows/:id/events` et `GET /api/rows/search?q=`

**Files:**
- Modify: `apps/api/src/rows/rows.service.ts`, `apps/api/src/rows/rows.controller.ts`
- Test: `apps/api/test/rows-events-search.e2e-spec.ts`

**Interfaces:**
- Consomme : `RowEventsService.listForRow` (Task 4.4), `type Row` de `@prisma/client`, `toRowDTO`.
- Produit :
  - `RowsService.listEvents(id: string): Promise<RowEventDTO[]>` — 404 si la ligne n'existe pas, sinon délègue à `RowEventsService.listForRow` (récent d'abord, max 100, `userName` joint).
  - `RowsService.search(q: string): Promise<RowDTO[]>` — `ILIKE` sur `data::text`, tous mois + archives, max 200, `[]` si `q` vide.
  - `GET /api/rows/:id/events` → 200 `RowEventDTO[]` ; 404 `NOT_FOUND`.
  - `GET /api/rows/search?q=` → 200 `RowDTO[]`.

- [ ] **Étape 1: écrire le test e2e qui échoue**

Créer `apps/api/test/rows-events-search.e2e-spec.ts` :

```ts
import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('Historique et recherche de lignes (e2e)', () => {
  let ctx: TestContext;
  let cookie: string[];
  let userId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    const session = await seedUserAndLogin(ctx);
    cookie = session.cookie;
    userId = session.userId;
  });

  describe('GET /api/rows/:id/events', () => {
    it('retourne l historique de la ligne, plus récent d abord, avec le nom de l auteur', async () => {
      const row = await ctx.prisma.row.create({ data: { month: '2026-08', position: 0 } });
      await ctx.prisma.rowEvent.create({
        data: {
          rowId: row.id,
          userId,
          type: 'create',
          payload: { month: '2026-08', position: 0 },
          at: new Date('2026-08-01T10:00:00.000Z'),
        },
      });
      await ctx.prisma.rowEvent.create({
        data: {
          rowId: row.id,
          userId,
          type: 'update',
          payload: { version: 1, changedKeys: ['client'] },
          at: new Date('2026-08-02T10:00:00.000Z'),
        },
      });

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/rows/${row.id}/events`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.map((event: { type: string }) => event.type)).toEqual(['update', 'create']);
      expect(res.body[0]).toMatchObject({
        rowId: row.id,
        userId,
        userName: 'Testeur',
        at: '2026-08-02T10:00:00.000Z',
        payload: { version: 1, changedKeys: ['client'] },
      });
    });

    it('limite l historique à 100 entrées', async () => {
      const row = await ctx.prisma.row.create({ data: { month: '2026-08', position: 0 } });
      for (let index = 0; index < 105; index += 1) {
        await ctx.prisma.rowEvent.create({
          data: {
            rowId: row.id,
            userId,
            type: 'update',
            payload: { version: index + 1, changedKeys: ['client'] },
            at: new Date(Date.UTC(2026, 7, 1, 0, 0, index)),
          },
        });
      }

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/rows/${row.id}/events`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toHaveLength(100);
      expect(res.body[0].payload.version).toBe(105);
    });

    it('retourne un tableau vide pour une ligne sans historique', async () => {
      const row = await ctx.prisma.row.create({ data: { month: '2026-08', position: 0 } });
      const res = await request(ctx.app.getHttpServer())
        .get(`/api/rows/${row.id}/events`)
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('refuse une ligne inconnue : 404 NOT_FOUND', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/rows/inconnue/events')
        .set('Cookie', cookie)
        .expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/rows/search', () => {
    beforeEach(async () => {
      await ctx.prisma.row.create({
        data: { month: '2026-08', position: 0, data: { client: 'ARCADIA', dpt: '49' } },
      });
      await ctx.prisma.row.create({
        data: { month: '2026-09', position: 0, data: { client: 'BOULANGERIE ARCADE' } },
      });
      await ctx.prisma.row.create({
        data: {
          month: '2025-03',
          position: 0,
          data: { client: 'ARCADIA HISTORIQUE' },
          archived: true,
        },
      });
      await ctx.prisma.row.create({
        data: { month: '2026-08', position: 1, data: { client: 'AUTRE SOCIETE' } },
      });
    });

    it('trouve les lignes de tous les mois et des archives, sans tenir compte de la casse', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/rows/search?q=arcad')
        .set('Cookie', cookie)
        .expect(200);

      const clients = res.body.map((row: { data: { client: string } }) => row.data.client).sort();
      expect(clients).toEqual(['ARCADIA', 'ARCADIA HISTORIQUE', 'BOULANGERIE ARCADE']);
    });

    it('cherche dans toutes les valeurs de la ligne, pas seulement le client', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/rows/search?q=49')
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].data.client).toBe('ARCADIA');
    });

    it('retourne un tableau vide sans résultat', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/rows/search?q=zzzinconnu')
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('retourne un tableau vide quand q est vide ou absent', async () => {
      const vide = await request(ctx.app.getHttpServer())
        .get('/api/rows/search?q=')
        .set('Cookie', cookie)
        .expect(200);
      expect(vide.body).toEqual([]);

      const absent = await request(ctx.app.getHttpServer())
        .get('/api/rows/search')
        .set('Cookie', cookie)
        .expect(200);
      expect(absent.body).toEqual([]);
    });

    it('traite le caractère % comme du texte et non comme un joker', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/rows/search?q=%25')
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });
});
```

- [ ] **Étape 2: lancer le test e2e**

```bash
pnpm --filter @suivi/api test:e2e -- rows-events-search.e2e-spec.ts
```

Attendu : **FAIL** — `GET /api/rows/:id/events` et `GET /api/rows/search` répondent 404 (routes absentes) pour les 9 cas.

- [ ] **Étape 3: implémenter `listEvents` et `search`**

Modifier `apps/api/src/rows/rows.service.ts` : compléter les imports en tête de fichier,

```ts
import { Prisma, type Row } from '@prisma/client';
import type { CellFormat, CellValue, RowDTO, RowEventDTO } from '@suivi/shared';
```

ajouter la constante à côté de `CONFLICT_SCAN_LIMIT`,

```ts
/** Plafond de résultats de la recherche globale (contrat : max 200). */
const SEARCH_LIMIT = 200;
```

puis ajouter les deux méthodes dans la classe `RowsService` :

```ts
  /** Historique d'une ligne (404 si la ligne n'existe pas). */
  async listEvents(id: string): Promise<RowEventDTO[]> {
    const existing = await this.prisma.row.findUnique({ where: { id }, select: { id: true } });
    if (existing === null) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ligne introuvable.' });
    }
    return this.events.listForRow(id);
  }

  /**
   * Recherche plein texte simple sur les valeurs de la ligne : `data::text`
   * comparé en ILIKE, tous mois confondus, archives incluses.
   * Le terme est passé en paramètre lié ; les jokers % et _ y sont échappés
   * pour être cherchés littéralement.
   */
  async search(q: string): Promise<RowDTO[]> {
    const term = q.trim();
    if (term.length === 0) {
      return [];
    }
    const pattern = `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT * FROM "Row"
      WHERE "data"::text ILIKE ${pattern}
      ORDER BY "month" DESC, "position" ASC
      LIMIT ${SEARCH_LIMIT}
    `;
    return rows.map(toRowDTO);
  }
```

- [ ] **Étape 4: exposer les routes historique et recherche**

Modifier `apps/api/src/rows/rows.controller.ts` : ajouter le type `RowEventDTO` aux imports `@suivi/shared` et les deux méthodes dans la classe. `@Get('search')` est déclarée avant `@Get(':id/events')` — les deux motifs ne se recouvrent pas, mais l'ordre de déclaration reste celui des contrats.

```ts
import type { RowDTO, RowEventDTO } from '@suivi/shared';
```

```ts
  @Get('search')
  async search(@Query('q') q?: string): Promise<RowDTO[]> {
    return this.rows.search(q ?? '');
  }

  @Get(':id/events')
  async events(@Param('id') id: string): Promise<RowEventDTO[]> {
    return this.rows.listEvents(id);
  }
```

- [ ] **Étape 5: relancer le test e2e**

```bash
pnpm --filter @suivi/api test:e2e -- rows-events-search.e2e-spec.ts
```

Attendu : **PASS** (9 cas verts).

- [ ] **Étape 6: commit**

```bash
git add apps/api/src/rows/rows.service.ts apps/api/src/rows/rows.controller.ts apps/api/test/rows-events-search.e2e-spec.ts && git commit -m "feat(rows): historique de ligne et recherche globale ILIKE"
```

> À vérifier à l'exécution : `$queryRaw` retourne les colonnes JSONB déjà désérialisées et `updatedAt` en objet `Date` — si `toRowDTO` lève `row.updatedAt.toISOString is not a function` sur la route de recherche, c'est que le driver renvoie une chaîne : envelopper alors la valeur avec `new Date(row.updatedAt)` dans le mapper.

---

### Task 4.9: `MonthsModule` — `GET /api/months`

**Files:**
- Create: `apps/api/src/months/months.service.ts`, `apps/api/src/months/months.controller.ts`, `apps/api/src/months/months.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/months.e2e-spec.ts`

**Interfaces:**
- Consomme : `PrismaService`, `JwtAuthGuard`, `MonthInfo` de `@suivi/shared` (`{ month: string; count: number }`).
- Produit :
  - `MonthsService.list(): Promise<MonthInfo[]>` — `groupBy` sur `month` avec compteur, lignes actives uniquement, tri chronologique (l'ordre lexicographique de `AAAA-MM` est l'ordre chronologique).
  - `GET /api/months` → 200 `MonthInfo[]`.

- [ ] **Étape 1: écrire le test e2e qui échoue**

Créer `apps/api/test/months.e2e-spec.ts` :

```ts
import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('GET /api/months (e2e)', () => {
  let ctx: TestContext;
  let cookie: string[];

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    cookie = (await seedUserAndLogin(ctx)).cookie;
  });

  it('retourne un tableau vide sans aucune ligne', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/months')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('retourne les mois existants avec leur compteur, en ordre chronologique', async () => {
    await ctx.prisma.row.create({ data: { month: '2026-09', position: 0 } });
    await ctx.prisma.row.create({ data: { month: '2025-12', position: 0 } });
    await ctx.prisma.row.create({ data: { month: '2026-09', position: 1 } });
    await ctx.prisma.row.create({ data: { month: '2026-01', position: 0 } });

    const res = await request(ctx.app.getHttpServer())
      .get('/api/months')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body).toEqual([
      { month: '2025-12', count: 1 },
      { month: '2026-01', count: 1 },
      { month: '2026-09', count: 2 },
    ]);
  });

  it('ne compte pas les lignes archivées et omet un mois entièrement archivé', async () => {
    await ctx.prisma.row.create({ data: { month: '2026-08', position: 0 } });
    await ctx.prisma.row.create({ data: { month: '2026-08', position: 1, archived: true } });
    await ctx.prisma.row.create({ data: { month: '2025-03', position: 0, archived: true } });

    const res = await request(ctx.app.getHttpServer())
      .get('/api/months')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body).toEqual([{ month: '2026-08', count: 1 }]);
  });

  it('refuse un visiteur non authentifié : 401', async () => {
    await request(ctx.app.getHttpServer()).get('/api/months').expect(401);
  });
});
```

- [ ] **Étape 2: lancer le test e2e**

```bash
pnpm --filter @suivi/api test:e2e -- months.e2e-spec.ts
```

Attendu : **FAIL** — `GET /api/months` répond 404 (route absente) pour les 4 cas.

- [ ] **Étape 3: implémenter le service, le contrôleur et le module**

Créer `apps/api/src/months/months.service.ts` :

```ts
import { Injectable } from '@nestjs/common';
import type { MonthInfo } from '@suivi/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MonthsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Onglets de mois : mois possédant au moins une ligne active, avec le
   * nombre de lignes. "AAAA-MM" se trie lexicographiquement = chronologiquement.
   */
  async list(): Promise<MonthInfo[]> {
    const groups = await this.prisma.row.groupBy({
      by: ['month'],
      where: { archived: false },
      _count: { _all: true },
      orderBy: { month: 'asc' },
    });
    return groups.map((group) => ({ month: group.month, count: group._count._all }));
  }
}
```

Créer `apps/api/src/months/months.controller.ts` :

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { MonthInfo } from '@suivi/shared';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { MonthsService } from './months.service';

@Controller('months')
@UseGuards(JwtAuthGuard)
export class MonthsController {
  constructor(private readonly months: MonthsService) {}

  @Get()
  async list(): Promise<MonthInfo[]> {
    return this.months.list();
  }
}
```

Créer `apps/api/src/months/months.module.ts` :

```ts
import { Module } from '@nestjs/common';
import { MonthsController } from './months.controller';
import { MonthsService } from './months.service';

@Module({
  controllers: [MonthsController],
  providers: [MonthsService],
  exports: [MonthsService],
})
export class MonthsModule {}
```

Remplacer `apps/api/src/app.module.ts` par (contenu complet en fin de Feature 4 ; `EventsModule` n'y figure pas : il est importé par `RowsModule`) :

```ts
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ChoicesModule } from './choices/choices.module';
import { ColumnsModule } from './columns/columns.module';
import { HealthModule } from './health/health.module';
import { MonthsModule } from './months/months.module';
import { PrismaModule } from './prisma/prisma.module';
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
  ],
})
export class AppModule {}
```

- [ ] **Étape 4: relancer le test e2e**

```bash
pnpm --filter @suivi/api test:e2e -- months.e2e-spec.ts
```

Attendu : **PASS** (4 cas verts).

- [ ] **Étape 5: commit**

```bash
git add apps/api/src/months/months.service.ts apps/api/src/months/months.controller.ts apps/api/src/months/months.module.ts apps/api/src/app.module.ts apps/api/test/months.e2e-spec.ts && git commit -m "feat(months): GET /api/months avec compteurs par mois"
```

---

### Task 4.10: Validation complète du périmètre et merge dans `develop`

**Files:**
- Modify: aucun (tâche de vérification et d'intégration).
- Test: l'ensemble des suites de `@suivi/shared` et `@suivi/api`.

**Interfaces:**
- Consomme : tout ce qui a été produit par les Tasks 4.1 à 4.9.
- Produit : la branche `feature/rows-crud` fusionnée dans `develop` et poussée ; `RowsService` (`findByMonth`, `findArchived`, `create`, `patch`, `move`, `archive`, `remove`, `listEvents`, `search`), `RowEventsService` (`record`, `listForRow`), `MonthsService.list` disponibles pour la Feature 5 (branchement de `RealtimeEmitter`) et pour le front.

- [ ] **Étape 1: vérifier la compilation TypeScript stricte de l'API**

```bash
pnpm --filter @suivi/api build
```

Attendu : **PASS** — build terminé sans erreur TypeScript (aucun `any` implicite, aucun import non résolu).

- [ ] **Étape 2: lancer les tests unitaires du périmètre**

```bash
pnpm --filter @suivi/api test -- --testPathPattern "src/rows"
```

Attendu : **PASS** — `merge.spec.ts` (23 cas) et `rows.mapper.spec.ts` (3 cas) verts.

- [ ] **Étape 3: lancer toutes les suites e2e de l'API**

```bash
pnpm --filter @suivi/api test:e2e
```

Attendu : **PASS** — les suites des Features précédentes plus `rows-list`, `rows-create`, `rows-patch`, `rows-move`, `rows-archive-delete`, `rows-events-search`, `months` (7 nouvelles suites, 56 cas ajoutés), exécutées en série.

- [ ] **Étape 4: lancer la totalité du monorepo**

```bash
pnpm -r test
```

Attendu : **PASS** — `@suivi/shared` et `@suivi/api` verts ; aucun test rouge, condition obligatoire du merge (spec §11).

- [ ] **Étape 5: fusionner dans `develop` et pousser**

```bash
git checkout develop && git merge --no-ff feature/rows-crud -m "merge: feature/rows-crud" && git push origin develop
```

Attendu : merge sans conflit (les seuls fichiers partagés avec les features précédentes sont `apps/api/src/app.module.ts` et `apps/api/package.json`, modifiés uniquement par ajout), puis push accepté.
