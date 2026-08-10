# Section 01 — Schéma de données + seed

## Feature 1 — Schéma de données + seed (branche `feature/db-schema`)

**But:** poser les fondations de données du projet — schéma Prisma complet migré en base, package `@suivi/shared` (types, DTO, codes d'erreur, schémas zod, palette pastel) et seed idempotent des colonnes, listes de choix colorées et de l'utilisateur initial.

**Dépend de:** la section bootstrap du monorepo (workspace pnpm opérationnel, squelette NestJS 11 dans `apps/api` avec jest + ts-jest configurés par défaut — scripts `test` et `test:e2e` du `nest new` —, dossier `packages/` déclaré dans `pnpm-workspace.yaml`, branche `develop` existante et poussée). Aucune feature applicative préalable.

**Prérequis machine:** PostgreSQL 16 démarré en local. Le plus simple est le conteneur
livré par la Feature 0, qui crée déjà le rôle et la base attendus
(`POSTGRES_USER: suivi`, `POSTGRES_PASSWORD: dev`, `POSTGRES_DB: suivi`) :

```bash
docker compose -f docker-compose.dev.yml up -d
```

Sur une installation PostgreSQL native, créer une fois le rôle et la base avec
**exactement les mêmes identifiants** (à exécuter par l'ingénieur, pas par un
script du repo) :

```bash
sudo -u postgres psql -c "CREATE ROLE suivi LOGIN PASSWORD 'dev';"
sudo -u postgres psql -c "CREATE DATABASE suivi OWNER suivi;"
```

Seuls les tests du seed (Task 1.6) touchent la base ; tous les autres tests de la feature sont purement unitaires.

---

### Task 1.1: Branche, dépendances, schéma Prisma et migration `init`

- **Files:**
  - Create: `apps/api/prisma/schema.prisma`
  - Create: `apps/api/.env` (local, non commité) — `apps/api/.env.example` est créé par la Feature 0 et n'est pas modifié ici
  - Modify: `.gitignore` (racine), `apps/api/package.json` (dépendances)
  - Test: `apps/api/src/prisma/schema.spec.ts`
- **Interfaces:**
  - Consomme : le schéma Prisma « définitif » des contrats (`_contracts.md`, section « Schéma Prisma ») — copié à l'identique.
  - Produit : client Prisma généré `@prisma/client` exposant les modèles `User`, `Column`, `Choice`, `Row`, `RowEvent` et l'enum `ColumnType` (`TEXT | LONGTEXT | DATE | TIME | NUMBER | SELECT | LINK`) ; migration SQL `init` dans `apps/api/prisma/migrations/`.

- [ ] **Étape 1 : créer la branche (gitflow).**

```bash
git checkout develop && git pull && git checkout -b feature/db-schema
```

- [ ] **Étape 2 : installer les dépendances de la feature côté API.**

```bash
pnpm --filter @suivi/api add @prisma/client argon2
pnpm --filter @suivi/api add -D prisma ts-node
```

- [ ] **Étape 3 : écrire le test qui échoue** — `apps/api/src/prisma/schema.spec.ts` :

```ts
import { ColumnType, Prisma } from '@prisma/client';

describe('Schéma Prisma', () => {
  it('expose les cinq modèles du contrat', () => {
    expect(Prisma.ModelName.User).toBe('User');
    expect(Prisma.ModelName.Column).toBe('Column');
    expect(Prisma.ModelName.Choice).toBe('Choice');
    expect(Prisma.ModelName.Row).toBe('Row');
    expect(Prisma.ModelName.RowEvent).toBe('RowEvent');
  });

  it('expose les sept types de colonne du contrat', () => {
    expect(Object.values(ColumnType).sort()).toEqual([
      'DATE',
      'LINK',
      'LONGTEXT',
      'NUMBER',
      'SELECT',
      'TEXT',
      'TIME',
    ]);
  });
});
```

- [ ] **Étape 4 : lancer le test.**

```bash
pnpm --filter @suivi/api test -- schema.spec
```

Attendu : **FAIL** — erreur du type `@prisma/client did not initialize yet. Please run "prisma generate"` (le client n'est pas encore généré, le schéma n'existe pas).

- [ ] **Étape 5 : créer `apps/api/prisma/schema.prisma`** — copie EXACTE des contrats :

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum ColumnType {
  TEXT
  LONGTEXT
  DATE
  TIME
  NUMBER
  SELECT
  LINK
}

model User {
  id           String     @id @default(cuid())
  email        String     @unique
  passwordHash String
  displayName  String
  cursorColor  String
  createdAt    DateTime   @default(now())
  events       RowEvent[]
}

model Column {
  id       String     @id @default(cuid())
  key      String     @unique
  label    String
  type     ColumnType
  position Int
  width    Int        @default(150)
  visible  Boolean    @default(true)
  choices  Choice[]
}

model Choice {
  id        String  @id @default(cuid())
  columnId  String
  column    Column  @relation(fields: [columnId], references: [id], onDelete: Cascade)
  label     String
  bgColor   String?
  textColor String?
  bold      Boolean @default(false)
  position  Int
  archived  Boolean @default(false)

  @@unique([columnId, label])
}

model Row {
  id        String     @id @default(cuid())
  month     String
  position  Int
  data      Json       @default("{}")
  formats   Json       @default("{}")
  version   Int        @default(0)
  archived  Boolean    @default(false)
  createdBy String?
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  events    RowEvent[]

  @@index([month, archived])
}

model RowEvent {
  id      String   @id @default(cuid())
  rowId   String
  row     Row      @relation(fields: [rowId], references: [id], onDelete: Cascade)
  userId  String
  user    User     @relation(fields: [userId], references: [id])
  at      DateTime @default(now())
  type    String // create | update | delete | move | archive | format
  payload Json

  @@index([rowId, at])
}
```

- [ ] **Étape 6 : créer le fichier d'environnement local.** Créer uniquement `apps/api/.env` (non commité). **Ne pas toucher à `apps/api/.env.example`**, déjà produit par la Feature 0 (00-scaffold.md) : les valeurs ci-dessous sont exactement celles qu'il documente, alignées sur `docker-compose.dev.yml` (`POSTGRES_USER: suivi`, `POSTGRES_PASSWORD: dev`, `POSTGRES_DB: suivi`).

```dotenv
DATABASE_URL="postgresql://suivi:dev@localhost:5432/suivi?schema=public"
JWT_SECRET="dev-secret-a-changer"
APP_URL="http://localhost:3000"
PORT=3001
```

Note : la CLI Prisma et le client généré lisent tous deux `apps/api/.env` automatiquement (répertoire courant `apps/api` quand on passe par `pnpm --filter @suivi/api`). S'assurer que `.env` est bien ignoré par git :

```bash
grep -qxF 'apps/api/.env' .gitignore || echo 'apps/api/.env' >> .gitignore
```

- [ ] **Étape 7 : créer et appliquer la migration `init`** (génère aussi le client) :

```bash
pnpm --filter @suivi/api exec prisma migrate dev --name init
```

Attendu : dossier `apps/api/prisma/migrations/<timestamp>_init/migration.sql` créé, message `Your database is now in sync with your schema` puis `Generated Prisma Client`.

- [ ] **Étape 8 : relancer le test.**

```bash
pnpm --filter @suivi/api test -- schema.spec
```

Attendu : **PASS** (2 tests verts).

- [ ] **Étape 9 : commit.**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/prisma/schema.spec.ts apps/api/package.json .gitignore pnpm-lock.yaml
git commit -m "feat: schéma Prisma complet et migration init"
```

---

### Task 1.2: PrismaService + PrismaModule global

- **Files:**
  - Create: `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/prisma/prisma.module.ts`
  - Modify: `apps/api/src/app.module.ts`
  - Test: `apps/api/src/prisma/prisma.service.spec.ts`
- **Interfaces:**
  - Consomme : `PrismaClient` généré en Task 1.1.
  - Produit : `class PrismaService extends PrismaClient implements OnModuleInit { onModuleInit(): Promise<void> }` et `PrismaModule` décoré `@Global()` qui fournit et exporte `PrismaService` — toutes les features suivantes (auth, users, columns, rows…) injecteront `PrismaService` sans réimporter le module.

- [ ] **Étape 1 : écrire le test qui échoue** — `apps/api/src/prisma/prisma.service.spec.ts` :

```ts
import { Test } from '@nestjs/testing';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it("appelle $connect à l'initialisation du module", async () => {
    const service = new PrismaService();
    const connectSpy = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined as never);

    await service.onModuleInit();

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('est fourni et exporté par PrismaModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
    }).compile();

    expect(moduleRef.get(PrismaService)).toBeInstanceOf(PrismaService);
  });
});
```

(Le second test compile le module sans appeler `app.init()`, donc sans connexion réelle à la base.)

- [ ] **Étape 2 : lancer le test.**

```bash
pnpm --filter @suivi/api test -- prisma.service.spec
```

Attendu : **FAIL** — `Cannot find module './prisma.module'` (les fichiers n'existent pas).

- [ ] **Étape 3 : implémenter** — `apps/api/src/prisma/prisma.service.ts` :

```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
}
```

puis `apps/api/src/prisma/prisma.module.ts` :

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Étape 4 : enregistrer le module dans `apps/api/src/app.module.ts`** (fichier complet ; si le squelette contient encore `AppController`/`AppService`, les conserver dans les tableaux `controllers`/`providers` existants) :

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
})
export class AppModule {}
```

- [ ] **Étape 5 : relancer le test.**

```bash
pnpm --filter @suivi/api test -- prisma.service.spec
```

Attendu : **PASS** (2 tests verts).

- [ ] **Étape 6 : commit.**

```bash
git add apps/api/src/prisma apps/api/src/app.module.ts
git commit -m "feat: PrismaService et PrismaModule global (connexion au démarrage)"
```

---

### Task 1.3: Package `@suivi/shared` — types, DTO et ErrorCode

- **Files:**
  - Create: `packages/shared/jest.config.cjs`, `packages/shared/src/types.ts`
  - Modify: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts` (créés par la Feature 0, Task 0.2 — on les complète, on ne les réécrit pas)
  - Test: `packages/shared/src/types.spec.ts`
- **Interfaces:**
  - Consomme : la section « Types partagés » des contrats — noms copiés à l'identique.
  - Produit (exports de `@suivi/shared`) :
    - `type ColumnType = 'TEXT' | 'LONGTEXT' | 'DATE' | 'TIME' | 'NUMBER' | 'SELECT' | 'LINK'`
    - `interface UserDTO`, `interface ChoiceDTO`, `interface ColumnDTO`, `type CellValue`, `interface CellFormat`, `interface RowDTO`, `interface RowEventDTO`, `interface MonthInfo`
    - `interface ApiError { code: ErrorCode; message: string; details?: unknown }` et `type ErrorCode` (8 codes du contrat)

- [ ] **Étape 1 : compléter l'outillage du package.** `packages/shared/package.json` existe déjà (Feature 0, Task 0.2) : ne rien supprimer, ajouter seulement `zod`, les dépendances jest et basculer `"test"` sur jest (le script `typecheck` et la version TypeScript `^5.7.3` de la Feature 0 sont conservés tels quels). Contenu final attendu :

```json
{
  "name": "@suivi/shared",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "jest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.7.3"
  }
}
```

`packages/shared/tsconfig.json` existe aussi (Feature 0) : **le laisser tel quel**. Il doit conserver `"extends": "../../tsconfig.base.json"` ainsi que `module: "esnext"` / `moduleResolution: "bundler"` — ts-jest transpile la source via son propre réglage, aucune bascule vers `commonjs`/`node` n'est nécessaire. Contenu attendu (inchangé) :

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "noEmit": true
  },
  "include": ["src"]
}
```

`packages/shared/jest.config.cjs` :

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // Le tsconfig du package cible `module: esnext` (Feature 0) : ts-jest doit
  // émettre du CommonJS pour le runner jest, sans modifier tsconfig.json.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
  },
};
```

Puis installer :

```bash
pnpm install
```

- [ ] **Étape 2 : écrire le test qui échoue** — `packages/shared/src/types.spec.ts` :

```ts
import type {
  ApiError,
  CellValue,
  ChoiceDTO,
  ColumnDTO,
  ErrorCode,
  MonthInfo,
  RowDTO,
  RowEventDTO,
  UserDTO,
} from './types';

describe('Types partagés', () => {
  it('ApiError accepte exactement les 8 codes du contrat', () => {
    const codes: ErrorCode[] = [
      'AUTH_INVALID',
      'AUTH_REQUIRED',
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'VERSION_CONFLICT',
      'COLUMN_HAS_DATA',
      'CHOICE_IN_USE',
      'LOCKED',
    ];
    const errors: ApiError[] = codes.map((code) => ({
      code,
      message: 'message en français',
    }));
    expect(errors).toHaveLength(8);
  });

  it('RowDTO transporte data (CellValue) et formats (CellFormat)', () => {
    const row: RowDTO = {
      id: 'r1',
      month: '2026-08',
      position: 0,
      data: { client: 'ARCADIA', dpt: null, num_chrono: 78 },
      formats: { num_chrono: { bg: '#FF0000' } },
      version: 0,
      archived: false,
      updatedAt: '2026-08-10T00:00:00.000Z',
    };
    const value: CellValue = row.data.client;
    expect(value).toBe('ARCADIA');
    expect(row.formats.num_chrono.bg).toBe('#FF0000');
  });

  it('ColumnDTO embarque ses ChoiceDTO', () => {
    const choice: ChoiceDTO = {
      id: 'c1',
      columnId: 'col1',
      label: 'NEW',
      bgColor: '#FFFF00',
      textColor: '#FF0000',
      bold: true,
      position: 0,
      archived: false,
    };
    const column: ColumnDTO = {
      id: 'col1',
      key: 'statut',
      label: 'INSTALLATION',
      type: 'SELECT',
      position: 11,
      width: 150,
      visible: true,
      choices: [choice],
    };
    const user: UserDTO = {
      id: 'u1',
      email: 'quentin.durant49@orange.fr',
      displayName: 'Quentin',
      cursorColor: '#3498DB',
    };
    const event: RowEventDTO = {
      id: 'e1',
      rowId: 'r1',
      userId: user.id,
      userName: user.displayName,
      at: '2026-08-10T00:00:00.000Z',
      type: 'update',
      payload: { statut: { from: 'NEW', to: 'STAGING' } },
    };
    const month: MonthInfo = { month: '2026-08', count: 42 };
    expect(column.choices[0].label).toBe('NEW');
    expect(event.type).toBe('update');
    expect(month.count).toBe(42);
  });
});
```

- [ ] **Étape 3 : lancer le test.**

```bash
pnpm --filter @suivi/shared test -- types.spec
```

Attendu : **FAIL** — `Cannot find module './types'`.

- [ ] **Étape 4 : implémenter** — `packages/shared/src/types.ts` (noms EXACTS des contrats) :

```ts
export type ColumnType =
  | 'TEXT'
  | 'LONGTEXT'
  | 'DATE'
  | 'TIME'
  | 'NUMBER'
  | 'SELECT'
  | 'LINK';

export interface UserDTO {
  id: string;
  email: string;
  displayName: string;
  cursorColor: string;
}

export interface ChoiceDTO {
  id: string;
  columnId: string;
  label: string;
  bgColor: string | null;
  textColor: string | null;
  bold: boolean;
  position: number;
  archived: boolean;
}

export interface ColumnDTO {
  id: string;
  key: string;
  label: string;
  type: ColumnType;
  position: number;
  width: number;
  visible: boolean;
  choices: ChoiceDTO[];
}

export type CellValue = string | number | null;

export interface CellFormat {
  bg?: string;
}

export interface RowDTO {
  id: string;
  month: string;
  position: number;
  data: Record<string, CellValue>;
  formats: Record<string, CellFormat>;
  version: number;
  archived: boolean;
  updatedAt: string;
}

export interface RowEventDTO {
  id: string;
  rowId: string;
  userId: string;
  userName: string;
  at: string;
  type: 'create' | 'update' | 'delete' | 'move' | 'archive' | 'format';
  payload: unknown;
}

export interface MonthInfo {
  month: string;
  count: number;
}

export type ErrorCode =
  | 'AUTH_INVALID'
  | 'AUTH_REQUIRED'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'COLUMN_HAS_DATA'
  | 'CHOICE_IN_USE'
  | 'LOCKED';

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}
```

puis `packages/shared/src/index.ts` :

```ts
export * from './types';
```

- [ ] **Étape 5 : relancer le test.**

```bash
pnpm --filter @suivi/shared test -- types.spec
```

Attendu : **PASS** (3 tests verts).

- [ ] **Étape 6 : commit.**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat: package @suivi/shared avec types, DTO et ErrorCode du contrat"
```

---

### Task 1.4: Schémas zod partagés

- **Files:**
  - Create: `packages/shared/src/schemas.ts`
  - Modify: `packages/shared/src/index.ts`
  - Test: `packages/shared/src/schemas.spec.ts`
- **Interfaces:**
  - Consomme : `zod` 3 ; la définition EXACTE de `patchRowSchema` donnée dans les contrats.
  - Produit (exports de `@suivi/shared`) : `loginSchema`, `createUserSchema`, `updateMeSchema`, `createColumnSchema`, `updateColumnSchema`, `createChoiceSchema`, `updateChoiceSchema`, `createRowSchema`, `patchRowSchema`, `moveRowSchema`, plus `columnTypeSchema` (enum zod des 7 types). Ces schémas seront branchés sur les routes REST des features suivantes (toute entrée invalide → 422 `VALIDATION_FAILED`).

- [ ] **Étape 1 : écrire le test qui échoue** — `packages/shared/src/schemas.spec.ts` :

```ts
import {
  createChoiceSchema,
  createColumnSchema,
  createRowSchema,
  createUserSchema,
  loginSchema,
  moveRowSchema,
  patchRowSchema,
  updateChoiceSchema,
  updateColumnSchema,
  updateMeSchema,
} from './schemas';

describe('loginSchema', () => {
  it('accepte email + mot de passe', () => {
    expect(
      loginSchema.safeParse({ email: 'a@b.fr', password: 'x' }).success,
    ).toBe(true);
  });

  it('rejette un email invalide et un mot de passe vide', () => {
    expect(loginSchema.safeParse({ email: 'pas-un-email', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.fr', password: '' }).success).toBe(false);
  });
});

describe('createUserSchema', () => {
  const valid = {
    email: 'nouveau@exemple.fr',
    displayName: 'Pierre',
    password: 'motdepasse',
    cursorColor: '#E74C3C',
  };

  it('accepte un utilisateur complet', () => {
    expect(createUserSchema.safeParse(valid).success).toBe(true);
  });

  it('rejette un mot de passe trop court (< 8)', () => {
    expect(createUserSchema.safeParse({ ...valid, password: 'court' }).success).toBe(false);
  });

  it('rejette une couleur non hexadécimale', () => {
    expect(createUserSchema.safeParse({ ...valid, cursorColor: 'rouge' }).success).toBe(false);
  });
});

describe('updateMeSchema', () => {
  it('accepte une mise à jour partielle', () => {
    expect(updateMeSchema.safeParse({ displayName: 'Quentin D.' }).success).toBe(true);
  });

  it('rejette un objet vide (aucun champ à modifier)', () => {
    expect(updateMeSchema.safeParse({}).success).toBe(false);
  });
});

describe('createColumnSchema / updateColumnSchema', () => {
  it('accepte {label, type} avec un type du contrat', () => {
    expect(createColumnSchema.safeParse({ label: 'Réf devis', type: 'TEXT' }).success).toBe(true);
  });

  it('rejette un type hors enum', () => {
    expect(createColumnSchema.safeParse({ label: 'X', type: 'CHECKBOX' }).success).toBe(false);
  });

  it('updateColumnSchema accepte position/width/visible partiels', () => {
    expect(updateColumnSchema.safeParse({ width: 200, visible: false }).success).toBe(true);
  });

  it('updateColumnSchema accepte un changement de type valide', () => {
    expect(updateColumnSchema.safeParse({ type: 'NUMBER' }).success).toBe(true);
  });

  it('updateColumnSchema rejette un type hors enum', () => {
    expect(updateColumnSchema.safeParse({ type: 'CHECKBOX' }).success).toBe(false);
  });

  it('updateColumnSchema rejette une largeur non entière', () => {
    expect(updateColumnSchema.safeParse({ width: 150.5 }).success).toBe(false);
  });
});

describe('createChoiceSchema / updateChoiceSchema', () => {
  it('accepte un choix avec couleurs et gras', () => {
    expect(
      createChoiceSchema.safeParse({
        label: 'NEW',
        bgColor: '#FFFF00',
        textColor: '#FF0000',
        bold: true,
      }).success,
    ).toBe(true);
  });

  it('rejette un label vide', () => {
    expect(createChoiceSchema.safeParse({ label: '   ' }).success).toBe(false);
  });

  it('updateChoiceSchema accepte bgColor null (retour au neutre)', () => {
    expect(updateChoiceSchema.safeParse({ bgColor: null, archived: true }).success).toBe(true);
  });
});

describe('createRowSchema / moveRowSchema', () => {
  it('accepte un mois YYYY-MM', () => {
    expect(createRowSchema.safeParse({ month: '2026-08' }).success).toBe(true);
    expect(createRowSchema.safeParse({ month: '2026-08', position: 3 }).success).toBe(true);
  });

  it('rejette un mois mal formé', () => {
    expect(createRowSchema.safeParse({ month: '2026-13' }).success).toBe(false);
    expect(createRowSchema.safeParse({ month: 'AOUT 2026' }).success).toBe(false);
  });

  it('moveRowSchema accepte month seul, position seule, ou les deux', () => {
    expect(moveRowSchema.safeParse({ month: '2026-09' }).success).toBe(true);
    expect(moveRowSchema.safeParse({ position: 0 }).success).toBe(true);
  });
});

describe('patchRowSchema (contrat exact)', () => {
  it('rejette expectedVersion manquant', () => {
    expect(patchRowSchema.safeParse({ patch: { client: 'ARCADIA' } }).success).toBe(false);
  });

  it('rejette expectedVersion non entier', () => {
    expect(patchRowSchema.safeParse({ expectedVersion: 1.5 }).success).toBe(false);
  });

  it('accepte un patch string/number/null', () => {
    expect(
      patchRowSchema.safeParse({
        expectedVersion: 3,
        patch: { client: 'ARCADIA', num_chrono: 78, dpt: null },
      }).success,
    ).toBe(true);
  });

  it('rejette une valeur de patch booléenne', () => {
    expect(
      patchRowSchema.safeParse({ expectedVersion: 3, patch: { archived: true } }).success,
    ).toBe(false);
  });

  it('accepte formats avec bg, et null pour effacer un surlignage', () => {
    expect(
      patchRowSchema.safeParse({
        expectedVersion: 0,
        formats: { num_chrono: { bg: '#FF0000' }, impe: null },
      }).success,
    ).toBe(true);
  });

  it('rejette un bg non string dans formats', () => {
    expect(
      patchRowSchema.safeParse({ expectedVersion: 0, formats: { impe: { bg: 42 } } }).success,
    ).toBe(false);
  });
});
```

- [ ] **Étape 2 : lancer le test.**

```bash
pnpm --filter @suivi/shared test -- schemas.spec
```

Attendu : **FAIL** — `Cannot find module './schemas'`.

- [ ] **Étape 3 : implémenter** — `packages/shared/src/schemas.ts` (messages utilisateur en français) :

```ts
import { z } from 'zod';

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hexadécimale attendue (ex. #AABBCC)');

const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois attendu au format YYYY-MM (ex. 2026-08)');

export const columnTypeSchema = z.enum([
  'TEXT',
  'LONGTEXT',
  'DATE',
  'TIME',
  'NUMBER',
  'SELECT',
  'LINK',
]);

export const loginSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export const createUserSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
  displayName: z.string().trim().min(1, 'Nom affiché requis'),
  password: z.string().min(8, 'Mot de passe : 8 caractères minimum'),
  cursorColor: hexColor,
});

export const updateMeSchema = z
  .object({
    displayName: z.string().trim().min(1, 'Nom affiché requis').optional(),
    cursorColor: hexColor.optional(),
    password: z.string().min(8, 'Mot de passe : 8 caractères minimum').optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: 'Aucun champ à modifier',
  });

export const createColumnSchema = z.object({
  label: z.string().trim().min(1, 'Libellé requis'),
  type: columnTypeSchema,
});

export const updateColumnSchema = z.object({
  label: z.string().trim().min(1, 'Libellé requis').optional(),
  type: columnTypeSchema.optional(),
  position: z.number().int('Position entière attendue').min(0).optional(),
  width: z.number().int('Largeur entière attendue').min(40).max(1000).optional(),
  visible: z.boolean().optional(),
});

export const createChoiceSchema = z.object({
  label: z.string().trim().min(1, 'Libellé requis'),
  bgColor: hexColor.optional(),
  textColor: hexColor.optional(),
  bold: z.boolean().optional(),
});

export const updateChoiceSchema = z.object({
  label: z.string().trim().min(1, 'Libellé requis').optional(),
  bgColor: hexColor.nullable().optional(),
  textColor: hexColor.nullable().optional(),
  bold: z.boolean().optional(),
  position: z.number().int('Position entière attendue').min(0).optional(),
  archived: z.boolean().optional(),
});

export const createRowSchema = z.object({
  month,
  position: z.number().int('Position entière attendue').min(0).optional(),
});

// Définition EXACTE du contrat (_contracts.md) — ne pas modifier.
export const patchRowSchema = z.object({
  expectedVersion: z.number().int(),
  patch: z.record(z.union([z.string(), z.number(), z.null()])).optional(),
  formats: z
    .record(z.object({ bg: z.string().optional() }).nullable())
    .optional(),
});

export const moveRowSchema = z.object({
  month: month.optional(),
  position: z.number().int('Position entière attendue').min(0).optional(),
});
```

puis compléter `packages/shared/src/index.ts` :

```ts
export * from './types';
export * from './schemas';
```

- [ ] **Étape 4 : relancer le test.**

```bash
pnpm --filter @suivi/shared test -- schemas.spec
```

Attendu : **PASS** (l'intégralité des cas, y compris les rejets).

- [ ] **Étape 5 : commit.**

```bash
git add packages/shared/src/schemas.ts packages/shared/src/schemas.spec.ts packages/shared/src/index.ts
git commit -m "feat: schémas zod partagés (auth, users, columns, choices, rows)"
```

---

### Task 1.5: PASTEL_PALETTE (24 couleurs) + pastelFor (djb2)

- **Files:**
  - Create: `packages/shared/src/palette.ts`
  - Modify: `packages/shared/src/index.ts`
  - Test: `packages/shared/src/palette.spec.ts`
- **Interfaces:**
  - Consomme : rien (fonction pure).
  - Produit (exports de `@suivi/shared`, signatures du contrat) :
    - `const PASTEL_PALETTE: { bg: string; text: string }[]` (24 entrées)
    - `function pastelFor(label: string): { bg: string; text: string }` — hash djb2 du label trimmé/majusculisé, modulo 24. Utilisée par le seed (Task 1.6) et par l'import xlsx (feature Import) pour colorer les partenaires sans couleur Excel, de façon déterministe.

Les valeurs attendues dans les tests ci-dessous (`CUBE` → `#D1F2EB`, `ALLIPCOM` → `#FFE0B2`, `2A Consulting` → `#B3E5FC`) ont été pré-calculées avec l'implémentation djb2 de l'étape 3 : ne pas les modifier.

- [ ] **Étape 1 : écrire le test qui échoue** — `packages/shared/src/palette.spec.ts` :

```ts
import { PASTEL_PALETTE, pastelFor } from './palette';

const PARTENAIRES_SANS_COULEUR_EXCEL = [
  'CUBE', 'ESPACE BUREAUTIQUE', 'IT ADEPT', '2A Consulting', 'ALLIPCOM',
  'BUREAUTIK SERVICES', 'MABUROTIC', 'CG CONEKT', 'LEA NUMERIQUE', 'COM2S',
  'DBTELECOM', 'ECS', 'GOOD MORNING OFFICE', 'GROUPE TCV', 'KOTEL',
  'I PLANETHI', 'DJEFFREY', 'LDS SOLUTIONS', 'MIKADO SOLUTIONS', 'MY OBS',
  'ODH SOLUTIONS', 'OMNITEL', 'PRO FIBRE', 'RESEAU LINE', 'SNS SOLUTIONS',
  'SQUARTIS', 'TELPRO', 'ODS', 'TOPLINIE', 'UNITED TELECOM', 'YOWIGO',
  'VD COM', 'REVOLY', 'FR TELECOM', 'HOIST GROUP',
];

describe('PASTEL_PALETTE', () => {
  it('contient 24 paires bg/text hexadécimales, fonds tous distincts', () => {
    expect(PASTEL_PALETTE).toHaveLength(24);
    expect(new Set(PASTEL_PALETTE.map((p) => p.bg)).size).toBe(24);
    for (const { bg, text } of PASTEL_PALETTE) {
      expect(bg).toMatch(/^#[0-9A-F]{6}$/);
      expect(text).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe('pastelFor', () => {
  it('est déterministe, insensible à la casse et aux espaces parasites', () => {
    expect(pastelFor('CUBE')).toEqual(pastelFor('  cube  '));
    expect(pastelFor('CUBE')).toEqual({ bg: '#D1F2EB', text: '#0B5345' });
    expect(pastelFor('ALLIPCOM')).toEqual({ bg: '#FFE0B2', text: '#BF360C' });
    expect(pastelFor('2A Consulting')).toEqual({ bg: '#B3E5FC', text: '#01579B' });
  });

  it('retourne toujours une entrée de la palette', () => {
    for (const label of PARTENAIRES_SANS_COULEUR_EXCEL) {
      expect(PASTEL_PALETTE).toContainEqual(pastelFor(label));
    }
  });

  it('distribue correctement : les 35 partenaires reçoivent au moins 15 couleurs distinctes', () => {
    const distinct = new Set(
      PARTENAIRES_SANS_COULEUR_EXCEL.map((label) => pastelFor(label).bg),
    );
    expect(distinct.size).toBeGreaterThanOrEqual(15);
  });

  it('couvre les 24 entrées de la palette sur un large échantillon', () => {
    const buckets = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      buckets.add(pastelFor(`LABEL-${i}`).bg);
    }
    expect(buckets.size).toBe(24);
  });
});
```

- [ ] **Étape 2 : lancer le test.**

```bash
pnpm --filter @suivi/shared test -- palette.spec
```

Attendu : **FAIL** — `Cannot find module './palette'`.

- [ ] **Étape 3 : implémenter** — `packages/shared/src/palette.ts` :

```ts
// 24 fonds pastel lisibles, chacun apparié à un texte foncé de la même teinte.
// Aucun fond ne reprend les 6 couleurs partenaires figées de l'Excel
// (#229955, #C39BD3, #2772A4, #F1C40F, #AED6F1, #FCDAE3).
export const PASTEL_PALETTE: { bg: string; text: string }[] = [
  { bg: '#FFCDD2', text: '#B71C1C' }, // 0  rose
  { bg: '#F8BBD0', text: '#880E4F' }, // 1  rose bonbon
  { bg: '#E1BEE7', text: '#4A148C' }, // 2  lilas
  { bg: '#D1C4E9', text: '#311B92' }, // 3  parme
  { bg: '#C5CAE9', text: '#1A237E' }, // 4  bleu lavande
  { bg: '#BBDEFB', text: '#0D47A1' }, // 5  bleu clair
  { bg: '#B3E5FC', text: '#01579B' }, // 6  bleu ciel
  { bg: '#B2EBF2', text: '#006064' }, // 7  cyan pâle
  { bg: '#B2DFDB', text: '#004D40' }, // 8  turquoise pâle
  { bg: '#C8E6C9', text: '#1B5E20' }, // 9  vert pâle
  { bg: '#DCEDC8', text: '#33691E' }, // 10 vert tilleul
  { bg: '#F0F4C3', text: '#827717' }, // 11 citron vert
  { bg: '#FFF9C4', text: '#6D4C41' }, // 12 jaune pâle
  { bg: '#FFECB3', text: '#5D4037' }, // 13 ambre pâle
  { bg: '#FFE0B2', text: '#BF360C' }, // 14 orange pâle
  { bg: '#FFCCBC', text: '#9C2A00' }, // 15 corail pâle
  { bg: '#D7CCC8', text: '#3E2723' }, // 16 taupe
  { bg: '#CFD8DC', text: '#263238' }, // 17 gris bleuté
  { bg: '#F6DDCC', text: '#6E2C00' }, // 18 pêche
  { bg: '#D6EAF8', text: '#154360' }, // 19 bleu glacier
  { bg: '#D1F2EB', text: '#0B5345' }, // 20 menthe
  { bg: '#FCF3CF', text: '#7D6608' }, // 21 vanille
  { bg: '#E8DAEF', text: '#512E5F' }, // 22 glycine
  { bg: '#FDEBD0', text: '#784212' }, // 23 abricot
];

/**
 * Couleur pastel déterministe pour un libellé : hash djb2 du libellé
 * trimmé et passé en majuscules, modulo 24. Même libellé => même couleur,
 * à chaque exécution (import rejouable, seed idempotent).
 */
export function pastelFor(label: string): { bg: string; text: string } {
  const normalized = label.trim().toUpperCase();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    // djb2 : hash * 33 + code, contraint en entier non signé 32 bits.
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) >>> 0;
  }
  return PASTEL_PALETTE[hash % 24];
}
```

puis compléter `packages/shared/src/index.ts` :

```ts
export * from './types';
export * from './schemas';
export * from './palette';
```

- [ ] **Étape 4 : relancer le test.**

```bash
pnpm --filter @suivi/shared test -- palette.spec
```

Attendu : **PASS** (5 tests verts, y compris les valeurs exactes pré-calculées).

- [ ] **Étape 5 : commit.**

```bash
git add packages/shared/src/palette.ts packages/shared/src/palette.spec.ts packages/shared/src/index.ts
git commit -m "feat: palette pastel 24 couleurs et pastelFor deterministe (djb2)"
```

---

### Task 1.6: Seed idempotent (colonnes, choix colorés, utilisateur initial)

- **Files:**
  - Create: `apps/api/prisma/seed.ts`
  - Modify: `apps/api/package.json` (dépendance workspace + config seed), `apps/api/test/jest-e2e.json` (résolution de `@suivi/shared`)
  - Test: `apps/api/test/seed.e2e-spec.ts`
- **Interfaces:**
  - Consomme : `PrismaClient` (Task 1.1), `pastelFor(label)` de `@suivi/shared` (Task 1.5), `argon2.hash` / `argon2.verify`.
  - Produit : `export async function seed(prisma: PrismaClient): Promise<void>` (rejouable sans doublon) + commande `pnpm --filter @suivi/api exec prisma db seed`. Les features suivantes (auth, grille) supposent la base seedée : 16 colonnes, 83 choix, 1 utilisateur.

**Ce test nécessite la base `suivi` migrée (Task 1.1) et joignable.**

- [ ] **Étape 1 : lier `@suivi/shared` à l'API.**

```bash
pnpm --filter @suivi/api add @suivi/shared --workspace
```

- [ ] **Étape 2 : écrire le test qui échoue** — `apps/api/test/seed.e2e-spec.ts` :

```ts
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { pastelFor } from '@suivi/shared';
import { seed } from '../prisma/seed';

describe('Seed initial (idempotent)', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await seed(prisma);
    await seed(prisma); // rejouable : la 2e exécution ne doit rien dupliquer
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('crée exactement 16 colonnes, sans doublon après deux exécutions', async () => {
    expect(await prisma.column.count()).toBe(16);
    const statut = await prisma.column.findUniqueOrThrow({ where: { key: 'statut' } });
    expect(statut).toMatchObject({ label: 'INSTALLATION', type: 'SELECT', position: 11, width: 150 });
    const impe = await prisma.column.findUniqueOrThrow({ where: { key: 'impe' } });
    expect(impe).toMatchObject({ label: 'IMPE', type: 'DATE', position: 0 });
  });

  it('crée 83 choix (15 statuts + 41 partenaires + 14 tech + 10 CP + 3 matériel)', async () => {
    expect(await prisma.choice.count()).toBe(83);
    const parCle = async (key: string) =>
      prisma.choice.count({ where: { column: { key } } });
    expect(await parCle('statut')).toBe(15);
    expect(await parCle('partenaire')).toBe(41);
    expect(await parCle('tech')).toBe(14);
    expect(await parCle('nom_cp')).toBe(10);
    expect(await parCle('materiel_recu')).toBe(3);
  });

  it('applique les couleurs exactes des statuts', async () => {
    const statut = await prisma.column.findUniqueOrThrow({
      where: { key: 'statut' },
      include: { choices: true },
    });
    const parLabel = Object.fromEntries(statut.choices.map((c) => [c.label, c]));
    expect(parLabel['NEW']).toMatchObject({ bgColor: '#FFFF00', textColor: '#FF0000', bold: true });
    expect(parLabel['ATT PV']).toMatchObject({ bgColor: '#744388', textColor: '#FFFFFF', bold: true });
    expect(parLabel['EN COLLECTE']).toMatchObject({ bgColor: '#F9E79F', textColor: '#786208', bold: false });
    expect(parLabel['A DISTANCE']).toMatchObject({ bgColor: null, textColor: null, bold: false });
    expect(parLabel['CLOTUREE']).toMatchObject({ bgColor: '#A6A6A6', textColor: '#ABEBC6', bold: false });
  });

  it('colore les 6 partenaires Excel en dur et les autres via pastelFor', async () => {
    const parte = await prisma.column.findUniqueOrThrow({
      where: { key: 'partenaire' },
      include: { choices: true },
    });
    const parLabel = Object.fromEntries(parte.choices.map((c) => [c.label, c]));
    expect(parLabel['EVERLINK']).toMatchObject({ bgColor: '#229955', textColor: '#000000' });
    expect(parLabel['OR-TEL']).toMatchObject({ bgColor: '#F1C40F', textColor: '#000000' });
    expect(parLabel['WETELGROUP']).toMatchObject({ bgColor: '#FCDAE3', textColor: '#000000' });
    expect(parLabel['CUBE']).toMatchObject({
      bgColor: pastelFor('CUBE').bg,
      textColor: pastelFor('CUBE').text,
    });
    expect(parLabel['2A Consulting']).toMatchObject({
      bgColor: pastelFor('2A Consulting').bg,
      textColor: pastelFor('2A Consulting').text,
    });
  });

  it('colore la liste tech selon le contrat', async () => {
    const tech = await prisma.column.findUniqueOrThrow({
      where: { key: 'tech' },
      include: { choices: true },
    });
    const parLabel = Object.fromEntries(tech.choices.map((c) => [c.label, c]));
    expect(parLabel['DIRECT']).toMatchObject({ bgColor: null, textColor: '#009ADF', bold: true });
    expect(parLabel['ADWEB']).toMatchObject({ bgColor: null, textColor: '#229955', bold: true });
    expect(parLabel['VOSGES INFO']).toMatchObject({ bgColor: null, textColor: '#229955', bold: true });
    expect(parLabel['NETWORK']).toMatchObject({ bgColor: null, textColor: null, bold: false });
  });

  it("crée l'utilisateur initial une seule fois, avec un hash argon2 valide", async () => {
    const users = await prisma.user.findMany({
      where: { email: 'quentin.durant49@orange.fr' },
    });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ displayName: 'Quentin', cursorColor: '#3498DB' });
    await expect(argon2.verify(users[0].passwordHash, 'changeme')).resolves.toBe(true);
  });
});
```

- [ ] **Étape 3 : permettre à jest e2e de résoudre `@suivi/shared`** — remplacer `apps/api/test/jest-e2e.json` par :

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "moduleNameMapper": {
    "^@suivi/shared$": "<rootDir>/../../../packages/shared/src/index.ts"
  }
}
```

- [ ] **Étape 4 : lancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- seed.e2e-spec
```

Attendu : **FAIL** — `Cannot find module '../prisma/seed'`.

- [ ] **Étape 5 : implémenter** — `apps/api/prisma/seed.ts` (données complètes ; largeurs par défaut listées dans `COLUMNS`) :

```ts
import { ColumnType, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { pastelFor } from '@suivi/shared';

interface ColumnSeed {
  key: string;
  label: string;
  type: ColumnType;
  position: number;
  width: number;
}

interface ChoiceSeed {
  label: string;
  bgColor?: string | null;
  textColor?: string | null;
  bold?: boolean;
}

// Les 16 colonnes de la spec §2.1, ordre Excel, largeurs par défaut en px.
const COLUMNS: ColumnSeed[] = [
  { key: 'impe',                label: 'IMPE',                             type: 'DATE',     position: 0,  width: 110 },
  { key: 'client',              label: 'CLIENT',                           type: 'TEXT',     position: 1,  width: 220 },
  { key: 'dpt',                 label: 'DPT',                              type: 'TEXT',     position: 2,  width: 70 },
  { key: 'cp_client',           label: 'CP CLIENT',                        type: 'TEXT',     position: 3,  width: 100 },
  { key: 'partenaire',          label: 'PARTE',                            type: 'SELECT',   position: 4,  width: 160 },
  { key: 'date',                label: 'DATE',                             type: 'DATE',     position: 5,  width: 110 },
  { key: 'porta_commentaires',  label: 'PORTA ET COMMENTAIRES IMPORTANT',  type: 'LONGTEXT', position: 6,  width: 320 },
  // La spec garde l'heure en texte libre (« 14H », « 14h »...) : type TEXT, pas TIME.
  { key: 'heure',               label: 'HEURE',                            type: 'TEXT',     position: 7,  width: 90 },
  { key: 'tech',                label: 'TECH',                             type: 'SELECT',   position: 8,  width: 130 },
  { key: 'nom_tech',            label: 'NOM TECH',                         type: 'TEXT',     position: 9,  width: 160 },
  { key: 'nom_cp',              label: 'NOM CP',                           type: 'SELECT',   position: 10, width: 130 },
  { key: 'statut',              label: 'INSTALLATION',                     type: 'SELECT',   position: 11, width: 150 },
  { key: 'commentaires_planif', label: 'COMMENTAIRES PLANIF',              type: 'LONGTEXT', position: 12, width: 320 },
  { key: 'materiel_recu',       label: 'MATERIEL RECU',                    type: 'SELECT',   position: 13, width: 140 },
  { key: 'num_chrono',          label: 'N° CHRONO',                        type: 'TEXT',     position: 14, width: 120 },
  { key: 'infos_facturation',   label: 'INFOS FACTURATION',                type: 'TEXT',     position: 15, width: 220 },
];

// Statuts : couleurs exactes du contrat (§Couleurs initiales).
const STATUTS: ChoiceSeed[] = [
  { label: 'NEW',         bgColor: '#FFFF00', textColor: '#FF0000', bold: true },
  { label: 'STAGING',     bgColor: '#F8B5C8', textColor: '#E64219', bold: true },
  { label: 'A SUIVRE',    bgColor: '#FFA600', textColor: '#FF0000', bold: true },
  { label: 'ATT TECH',    bgColor: '#F8B5C8', textColor: '#E64219', bold: true },
  { label: 'ATT PARTE',   bgColor: '#F8B5C8', textColor: '#E64219', bold: true },
  { label: 'ATT PV',      bgColor: '#744388', textColor: '#FFFFFF', bold: true },
  { label: 'ATT 5 COM',   bgColor: '#F8B5C8', textColor: '#E64219', bold: true },
  { label: 'ATT CLIENT',  bgColor: '#F8B5C8', textColor: '#E64219', bold: true },
  { label: 'EN COLLECTE', bgColor: '#F9E79F', textColor: '#786208', bold: false },
  { label: 'STAND BY',    bgColor: '#85C1E9', textColor: '#002060', bold: true },
  { label: 'A PLANIFIER', bgColor: '#13ED0C', textColor: '#FF0000', bold: true },
  { label: 'INSTALLATION', bgColor: '#9BDEB4', textColor: '#176638', bold: true },
  { label: 'A DISTANCE',  bgColor: null,      textColor: null,      bold: false },
  { label: 'ANNULEE',     bgColor: '#FF0000', textColor: '#000000', bold: true },
  { label: 'CLOTUREE',    bgColor: '#A6A6A6', textColor: '#ABEBC6', bold: false },
];

// 41 partenaires (ordre de la spec §2.2). 6 couleurs figées de l'Excel,
// texte #000000 (contrat) ; les 35 autres passent par pastelFor.
const PARTENAIRES: string[] = [
  'OR-TEL', 'ENTREPRISE PRO', 'CUBE', 'VIP TELECOM', 'ESPACE BUREAUTIQUE',
  'IT ADEPT', 'WETELGROUP', 'HIGHCOM', '2A Consulting', 'ALLIPCOM',
  'BUREAUTIK SERVICES', 'MABUROTIC', 'CG CONEKT', 'LEA NUMERIQUE', 'COM2S',
  'DBTELECOM', 'ECS', 'GOOD MORNING OFFICE', 'GROUPE TCV', 'KOTEL',
  'I PLANETHI', 'DJEFFREY', 'LDS SOLUTIONS', 'MIKADO SOLUTIONS', 'MY OBS',
  'ODH SOLUTIONS', 'OMNITEL', 'PRO FIBRE', 'RESEAU LINE', 'SNS SOLUTIONS',
  'SQUARTIS', 'TELPRO', 'ODS', 'TOPLINIE', 'UNITED TELECOM', 'YOWIGO',
  'VD COM', 'REVOLY', 'FR TELECOM', 'EVERLINK', 'HOIST GROUP',
];

const PARTENAIRE_COULEURS_EXCEL: Record<string, { bg: string; text: string }> = {
  'EVERLINK':       { bg: '#229955', text: '#000000' },
  'HIGHCOM':        { bg: '#C39BD3', text: '#000000' },
  'ENTREPRISE PRO': { bg: '#2772A4', text: '#000000' },
  'OR-TEL':         { bg: '#F1C40F', text: '#000000' },
  'VIP TELECOM':    { bg: '#AED6F1', text: '#000000' },
  'WETELGROUP':     { bg: '#FCDAE3', text: '#000000' },
};

// Tech : DIRECT en bleu gras, 8 revendeurs en vert gras, le reste neutre.
const TECHS: string[] = [
  'DIRECT', 'ADWEB', 'DELTINFO', 'SOSINFO', 'NETWORK', 'KRYCIA', 'OCCITECH',
  'SPOTER', 'LAMIE', 'VOSGES INFO', 'PSITEK', 'TOULINFO', 'IMPECPRO', 'AUTRE',
];
const TECHS_VERTS = new Set([
  'ADWEB', 'DELTINFO', 'SOSINFO', 'OCCITECH', 'PSITEK', 'TOULINFO',
  'VOSGES INFO', 'LAMIE',
]);

const NOMS_CP: string[] = [
  'LAURENT', 'PIERRE', 'GEOFFROY', 'QUENTIN', 'KORANTIN', 'ADRIEN', 'MARCO',
  'ADV', 'AURELIEN', 'DYLAN',
];

const MATERIEL_RECU: string[] = ['ENVOYE', 'LIVRE', 'POINT RELAIS'];

async function upsertChoices(
  prisma: PrismaClient,
  columnKey: string,
  choices: ChoiceSeed[],
): Promise<void> {
  const column = await prisma.column.findUniqueOrThrow({
    where: { key: columnKey },
  });
  for (const [position, choice] of choices.entries()) {
    const attributes = {
      bgColor: choice.bgColor ?? null,
      textColor: choice.textColor ?? null,
      bold: choice.bold ?? false,
      position,
    };
    await prisma.choice.upsert({
      where: { columnId_label: { columnId: column.id, label: choice.label } },
      update: attributes,
      create: { columnId: column.id, label: choice.label, ...attributes },
    });
  }
}

export async function seed(prisma: PrismaClient): Promise<void> {
  // 1. Colonnes — upsert par clé unique `key`.
  for (const column of COLUMNS) {
    const attributes = {
      label: column.label,
      type: column.type,
      position: column.position,
      width: column.width,
    };
    await prisma.column.upsert({
      where: { key: column.key },
      update: attributes,
      create: { key: column.key, ...attributes },
    });
  }

  // 2. Choix des 5 listes — upsert par (columnId, label).
  await upsertChoices(prisma, 'statut', STATUTS);
  await upsertChoices(
    prisma,
    'partenaire',
    PARTENAIRES.map((label) => {
      const couleurs = PARTENAIRE_COULEURS_EXCEL[label] ?? pastelFor(label);
      return { label, bgColor: couleurs.bg, textColor: couleurs.text, bold: false };
    }),
  );
  await upsertChoices(
    prisma,
    'tech',
    TECHS.map((label) => {
      if (label === 'DIRECT') {
        return { label, bgColor: null, textColor: '#009ADF', bold: true };
      }
      if (TECHS_VERTS.has(label)) {
        return { label, bgColor: null, textColor: '#229955', bold: true };
      }
      return { label };
    }),
  );
  await upsertChoices(prisma, 'nom_cp', NOMS_CP.map((label) => ({ label })));
  await upsertChoices(prisma, 'materiel_recu', MATERIEL_RECU.map((label) => ({ label })));

  // 3. Utilisateur initial — upsert par email ; `update: {}` pour ne jamais
  // écraser un mot de passe ou un profil modifié depuis l'interface.
  const passwordHash = await argon2.hash('changeme');
  await prisma.user.upsert({
    where: { email: 'quentin.durant49@orange.fr' },
    update: {},
    create: {
      email: 'quentin.durant49@orange.fr',
      displayName: 'Quentin',
      passwordHash,
      cursorColor: '#3498DB',
    },
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seed(prisma);
    console.log('Seed terminé : 16 colonnes, 83 choix, 1 utilisateur.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Échec du seed :', error);
    process.exit(1);
  });
}
```

- [ ] **Étape 6 : brancher la commande `prisma db seed`** — ajouter dans `apps/api/package.json` (au niveau racine du JSON, à côté de `"scripts"`) :

```json
"prisma": {
  "seed": "ts-node --transpile-only prisma/seed.ts"
}
```

- [ ] **Étape 7 : relancer le test.**

```bash
pnpm --filter @suivi/api test:e2e -- seed.e2e-spec
```

Attendu : **PASS** (6 tests verts — dont le comptage strict après double exécution, qui prouve l'idempotence).

- [ ] **Étape 8 : vérifier la commande CLI de seed** (celle qui sera utilisée au déploiement) :

```bash
pnpm --filter @suivi/api exec prisma db seed
```

Attendu : `Seed terminé : 16 colonnes, 83 choix, 1 utilisateur.` — la relance de la commande redonne le même résultat sans erreur de contrainte unique.

- [ ] **Étape 9 : commit.**

```bash
git add apps/api/prisma/seed.ts apps/api/test/seed.e2e-spec.ts apps/api/test/jest-e2e.json apps/api/package.json pnpm-lock.yaml
git commit -m "feat: seed idempotent (16 colonnes, 5 listes colorees, utilisateur initial)"
```

> À vérifier à l'exécution : la résolution de `@suivi/shared` (main `src/index.ts`, TypeScript) par `ts-node --transpile-only` et par ts-jest à travers le lien symbolique pnpm. Si l'un des deux refuse de compiler le package lié, remplacer dans `seed.ts` et `seed.e2e-spec.ts` l'import `from '@suivi/shared'` par le chemin relatif `from '../../../packages/shared/src/palette'` (même export `pastelFor`), sans rien changer d'autre.

---

### Task 1.7: Vérification complète et fin de feature (merge dans develop)

- **Files:** aucun fichier nouveau — exécution des suites et merge.
- **Interfaces:**
  - Consomme : l'ensemble des tests des Tasks 1.1 à 1.6.
  - Produit : branche `develop` contenant la Feature 1 complète, poussée sur GitHub.

- [ ] **Étape 1 : lancer TOUS les tests du périmètre.**

```bash
pnpm --filter @suivi/shared test
pnpm --filter @suivi/api test
pnpm --filter @suivi/api test:e2e -- seed.e2e-spec
```

Attendu : trois suites entièrement **vertes** (shared : types + schemas + palette ; api : schema + prisma.service ; e2e : seed). Aucun merge si un seul test est rouge.

- [ ] **Étape 2 : vérifier qu'il ne reste rien à commiter.**

```bash
git status --short
```

Attendu : sortie vide (le `.env` local est ignoré par git).

- [ ] **Étape 3 : merge gitflow et push.**

```bash
git checkout develop
git merge --no-ff feature/db-schema -m "merge: feature/db-schema"
git push origin develop
```

Attendu : merge commit créé sur `develop`, push accepté. La Feature 2 (auth) pourra démarrer depuis ce `develop` avec une base migrée, seedée, et `@suivi/shared` consommable.
