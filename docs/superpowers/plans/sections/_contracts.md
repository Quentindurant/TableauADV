# Contrats partagés — plan suivi commandes

Référence obligatoire pour toutes les sections du plan. Aucune section ne
redéfinit ces noms/types : elle les consomme tels quels.

## Versions et outillage

- Node 22 LTS, pnpm 10 (workspace monorepo)
- `apps/web` : Next.js 15 (App Router), React 19, TypeScript strict
- `apps/api` : NestJS 11, @nestjs/jwt, @nestjs/platform-socket.io, socket.io 4
- `packages/shared` : zod 3, types + schémas partagés (package `@suivi/shared`)
- Prisma 6 + PostgreSQL 16
- UI grille : ag-grid-community 34 + ag-grid-react 34
- État front : zustand 5
- Hash mots de passe : argon2
- Tests API : jest + supertest (config Nest par défaut) ; tests front e2e : Playwright
- Import : jszip (réparation XML Zoho) + exceljs (lecture valeurs et fonds de cellules)

Noms de packages : `@suivi/web`, `@suivi/api`, `@suivi/shared`.
Ports dev et prod : web 3000, api 3001. Préfixe API global : `/api`.
Env (`apps/api/.env`) : `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `PORT`.
Env (`apps/web/.env`) : `NEXT_PUBLIC_API_URL` (appels navigateur ; vide en prod,
même origine) et `API_INTERNAL_URL` (appels serveur→API des Server Components,
URL absolue obligatoire ; en prod `http://127.0.0.1:3001`). Les deux doivent
figurer dans `apps/web/.env.example`, dans la procédure d'installation
(10-deploy.md § 5.2) et dans l'`env` du process `suivi-web` de
`deploy/ecosystem.config.js`.

DATABASE_URL de développement (aligné sur `docker-compose.dev.yml` : utilisateur
`suivi`, mot de passe `dev`, base `suivi`) :
`postgresql://suivi:dev@localhost:5432/suivi?schema=public`.

## Gitflow (obligatoire dans chaque section)

Chaque feature : `git checkout develop && git pull && git checkout -b feature/<nom>`.
Fin de feature : tests verts → `git checkout develop && git merge --no-ff feature/<nom> && git push origin develop`.
Jamais de commit direct sur `develop` ou `main`.

## Schéma Prisma (apps/api/prisma/schema.prisma) — définitif

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

## Types partagés (packages/shared/src/index.ts) — noms exacts

```ts
export type ColumnType = 'TEXT' | 'LONGTEXT' | 'DATE' | 'TIME' | 'NUMBER' | 'SELECT' | 'LINK';

export interface UserDTO { id: string; email: string; displayName: string; cursorColor: string; }
export interface ChoiceDTO { id: string; columnId: string; label: string; bgColor: string | null; textColor: string | null; bold: boolean; position: number; archived: boolean; }
export interface ColumnDTO { id: string; key: string; label: string; type: ColumnType; position: number; width: number; visible: boolean; choices: ChoiceDTO[]; }
export type CellValue = string | number | null;
export interface CellFormat { bg?: string; }
export interface RowDTO { id: string; month: string; position: number; data: Record<string, CellValue>; formats: Record<string, CellFormat>; version: number; archived: boolean; updatedAt: string; }
export interface RowEventDTO { id: string; rowId: string; userId: string; userName: string; at: string; type: 'create' | 'update' | 'delete' | 'move' | 'archive' | 'format'; payload: unknown; }
export interface MonthInfo { month: string; count: number; }

export interface ApiError { code: ErrorCode; message: string; details?: unknown; }
export type ErrorCode =
  | 'AUTH_INVALID' | 'AUTH_REQUIRED' | 'VALIDATION_FAILED' | 'NOT_FOUND'
  | 'VERSION_CONFLICT' | 'COLUMN_HAS_DATA' | 'CHOICE_IN_USE' | 'LOCKED';

// Schémas zod exportés : loginSchema, createUserSchema, updateMeSchema,
// createColumnSchema, updateColumnSchema, createChoiceSchema, updateChoiceSchema,
// createRowSchema, patchRowSchema, moveRowSchema.
// updateColumnSchema = z.object({ label?, type?, position?, width?, visible? })
//   où type = columnTypeSchema.optional() (enum ColumnType). Le type d'une colonne
//   est TOUJOURS modifiable : PATCH /columns/:id {type} persiste le nouveau type
//   sans convertir les valeurs des lignes (les valeurs existantes sont conservées
//   telles quelles et réinterprétées par le nouveau type).
// patchRowSchema = z.object({ expectedVersion: z.number().int(),
//   patch: z.record(z.union([z.string(), z.number(), z.null()])).optional(),
//   formats: z.record(z.object({ bg: z.string().optional() }).nullable()).optional() })

// Palette pastel déterministe (24 couleurs) :
export const PASTEL_PALETTE: { bg: string; text: string }[]; // définie en Feature 1
export function pastelFor(label: string): { bg: string; text: string }; // hash djb2 % 24
```

## Erreurs et validation API (apps/api/src/common/) — mécanisme unique

Il existe **un seul** mécanisme d'erreur et **un seul** mécanisme de validation.
Les deux sont livrés par la Feature 2 et consommés tels quels par les Features 3 à 9.

`apps/api/src/common/api.exception.ts` (Feature 2, Task 2.1) :

```ts
export class ApiException extends HttpException {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly details?: unknown;
  constructor(code: ErrorCode, message: string, status: HttpStatus, details?: unknown);
}
export function authInvalid(): ApiException;
export function authRequired(message?: string): ApiException;
export function validationFailed(message: string, details?: unknown): ApiException;
export function notFound(message?: string): ApiException;
export interface ApiErrorBody { code: ErrorCode | 'INTERNAL'; message: string; details?: unknown }
export class ApiExceptionFilter implements ExceptionFilter; // enregistré dans setupApp
```

`apps/api/src/common/api-error.ts` (Feature 2, Task 2.2) :

```ts
export interface ValidationDetail { path: string; message: string }
/** 422 VALIDATION_FAILED + details: ValidationDetail[] en cas d'échec. */
export function parseOrThrow<T>(schema: ZodType<T>, input: unknown): T;
```

Interdits explicites : pas de `apiError()` retournant une `HttpException` brute
(elle court-circuiterait `ApiExceptionFilter`), pas de `ZodValidationPipe`, pas de
fichier `apps/api/src/columns/zod-parse.ts`. Toute erreur métier passe par
`ApiException` ou l'une de ses fabriques ; toute validation passe par `parseOrThrow`.

## Client HTTP web (apps/web/src/lib/api.ts) — nom et signature figés

Créé par la Feature 2 (Task 2.7), étendu par la Feature 6 (Task 6.2), consommé
sans renommage par les Features 6, 7, 8 et 9.

```ts
export const apiBaseUrl: string;               // process.env.NEXT_PUBLIC_API_URL ?? ''
export function apiUrl(path: string): string;  // `${apiBaseUrl}/api${path}`
export function serverApiBaseUrl(): string;    // Server Components ; SANS le préfixe /api
export type ApiErrorCode = ErrorCode | 'INTERNAL';

export class ApiRequestError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: ApiErrorCode, message: string, status: number, details?: unknown);
}

export function apiFetch<T>(path: string, init?: RequestInit): Promise<T>;
```

- **Nom unique de la classe : `ApiRequestError`.** `ApiClientError` et `ApiHttpError`
  n'existent pas.
- **Convention de chemin : `apiFetch` ajoute lui-même le préfixe `/api`.** Les
  appelants passent `'/auth/login'`, `'/columns'`, `'/rows?month=2026-08'` — jamais
  `'/api/...'`. `serverApiBaseUrl()` ne contient pas le préfixe : les Server
  Components écrivent `` `${serverApiBaseUrl()}/api/auth/me` ``.
- `apiFetch` pose `credentials: 'include'` et `Content-Type: application/json`,
  rend `undefined` sur 204, et lève `ApiRequestError` sur toute réponse non 2xx.

## État front (apps/web/src/lib/store.ts) — définition unique

Hook `useAppStore`, interface `AppState` (zustand 5). Créé par la Feature 6
(Task 6.1) ; la Feature 7 (Task 7.3) **ajoute** des champs, elle n'en renomme
aucun. `useGridStore` / `GridState` n'existent pas.

```ts
export type ToastKind = 'error' | 'info';
export interface ToastState { message: string; kind: ToastKind }
export type GridView = 'month' | 'archives';
export interface RowChanges {
  patch?: Record<string, CellValue>;
  formats?: Record<string, CellFormat | null>;
  version?: number;
}

export interface AppState {
  user: UserDTO | null;
  columns: ColumnDTO[];
  choicesByColumnKey: Record<string, ChoiceDTO[]>;
  rows: RowDTO[];
  monthCourant: string;
  months: MonthInfo[];
  view: GridView;
  toast: ToastState | null;

  setUser: (user: UserDTO | null) => void;
  setColumns: (columns: ColumnDTO[]) => void;
  setRows: (rows: RowDTO[]) => void;
  setMonths: (months: MonthInfo[]) => void;
  setMonthCourant: (month: string) => void;
  setView: (view: GridView) => void;
  applyRowPatch: (rowId: string, changes: RowChanges) => void;
  upsertRow: (row: RowDTO) => void;
  addRow: (row: RowDTO, index?: number) => void;
  removeRow: (rowId: string) => void;
  showToast: (message: string, kind?: ToastKind) => void;
  hideToast: () => void;
}
export const useAppStore: UseBoundStore<StoreApi<AppState>>;
```

- **Forme de la vue :** le couple (`view`, `monthCourant`). Il n'existe pas d'objet
  `{ kind: 'month'; month: string }`. Les helpers qui dépendent de la vue prennent
  `(view: GridView, month: string)`.
- **Modèle de toast unique :** un seul toast à la fois (`toast`, `showToast`,
  `hideToast`), rendu par `DataGrid.tsx`. Pas de pile `toasts: ToastItem[]`, pas de
  `pushToast` / `dismissToast`, pas de composant `Toasts.tsx`.
- Champs ajoutés par la Feature 7 (Task 7.3) : `users`, `connected`, `presence`,
  `focuses`, `locks` et leurs actions, plus `replaceRow`, `setRowLocalValue`,
  `applyRowCreated`, `applyRowUpdated`, `applyRowDeleted`, `applyRowMoved`.

## Outillage de test front — un runner, un harnais e2e

- **Vitest** est le seul runner de tests unitaires de `apps/web` :
  `apps/web/vitest.config.ts` + `apps/web/vitest.setup.ts`, scripts
  `"test": "vitest run"` / `"test:watch": "vitest"`. Créés par la Feature 6
  (Task 6.1) ; la Feature 8 élargit seulement `include` à
  `['src/**/*.spec.ts','src/**/*.spec.tsx','src/**/*.test.ts','src/**/*.test.tsx']`.
  Aucune feature n'installe jest dans `apps/web` : toutes les specs utilisent
  `import { … , vi } from 'vitest'`.
- **Playwright** : un seul fichier de configuration dans tout le dépôt,
  `apps/web/playwright.config.ts` (+ `apps/web/e2e/`), créé par la Feature 2
  (Task 2.7) avec `projects: [chromium]`, `globalSetup` (seed idempotent) et
  `webServer` démarrant l'API puis le front. Variables d'environnement :
  `E2E_WEB_URL` (défaut `http://localhost:3000`) et `E2E_API_URL` (défaut
  `http://localhost:3001`). Commande unique : `pnpm --filter @suivi/web test:e2e`.
  Les Features 6, 7 et 8 ajoutent leurs specs dans `apps/web/e2e/` sans toucher à
  la configuration.

## Routes REST (toutes sous /api, cookie JWT httpOnly `token` requis sauf login)

| Méthode + route | Corps | Réponse OK | Erreurs |
|---|---|---|---|
| POST /auth/login | {email, password} | 200 {user: UserDTO} + Set-Cookie | 401 AUTH_INVALID |
| POST /auth/logout | — | 204 | — |
| GET /auth/me | — | 200 {user: UserDTO} | 401 AUTH_REQUIRED |
| GET /users | — | UserDTO[] | |
| POST /users | {email, displayName, password, cursorColor} | 201 UserDTO | 422, email dupliqué → 422 VALIDATION_FAILED |
| PATCH /users/me | {displayName?, cursorColor?, password?} | 200 UserDTO | 422 |
| GET /columns | — | ColumnDTO[] (triées par position, avec choices triés) | |
| POST /columns | {label, type} | 201 ColumnDTO (key = slug unique auto) | 422 |
| PATCH /columns/:id | {label?, type?, position?, width?, visible?} | 200 ColumnDTO | 404 |
| DELETE /columns/:id[?force=true] | — | 204 | 409 COLUMN_HAS_DATA si données et pas force |
| POST /columns/:id/choices | {label, bgColor?, textColor?, bold?} | 201 ChoiceDTO | 422 doublon |
| PATCH /choices/:id | {label?, bgColor?, textColor?, bold?, position?, archived?} | 200 ChoiceDTO (renommage → update masse des rows en transaction) | 404 |
| DELETE /choices/:id | — | 204 | 409 CHOICE_IN_USE si utilisé |
| GET /rows?month=YYYY-MM ou ?archived=true | — | RowDTO[] (tri position) | 422 sans filtre |
| GET /rows/search?q= | — | RowDTO[] (tous mois + archives, max 200) | |
| POST /rows | {month, position?} | 201 RowDTO (position = fin de mois si absente) | 422 |
| PATCH /rows/:id | {expectedVersion, patch?, formats?} | 200 RowDTO | 409 VERSION_CONFLICT {details: {current: RowDTO, conflictKeys: string[]}} ; 404 |
| POST /rows/:id/move | {month?, position?} | 200 RowDTO | 404 |
| POST /rows/:id/archive | {archived: boolean} | 200 RowDTO | 404 |
| DELETE /rows/:id | — | 204 | 404 |
| GET /rows/:id/events | — | RowEventDTO[] (récent d'abord, max 100) | 404 |
| GET /months | — | MonthInfo[] (tri chronologique) | |

Sémantique PATCH /rows/:id (cœur de la co-édition) :
fusion clé par clé sur `data` et `formats`. Conflit (409) UNIQUEMENT si
`expectedVersion < version` ET qu'une clé du patch a été modifiée par un
event postérieur à expectedVersion. Sinon merge + `version++` + RowEvent.

## Événements Socket.IO (même origine, path /socket.io, auth par cookie JWT)

Rooms : `month:<YYYY-MM>`, `archives`.

Client → serveur :
- `room.join` `{ room: string }` (quitte l'ancienne room)
- `cell.focus` `{ rowId: string; colKey: string } | { rowId: null }`
- `cell.lock.request` `{ rowId, colKey }` → ack `{ granted: boolean; holder?: UserDTO }`
- `cell.lock.release` `{ rowId, colKey }`

Serveur → clients de la room :
- `presence` `{ users: (UserDTO & { socketId: string })[] }`
- `cell.focus` `{ userId, rowId, colKey }` (rowId null = plus de focus)
- `cell.lock` `{ rowId, colKey, user: UserDTO }` / `cell.unlock` `{ rowId, colKey }`
- `row.created` `{ row: RowDTO }` · `row.updated` `{ row: RowDTO; changedKeys: string[]; byUserId: string }`
- `row.deleted` `{ rowId }` · `row.moved` `{ row: RowDTO; fromMonth: string }`
- `config.changed` `{ scope: 'columns' | 'choices' | 'users' }` (émis à TOUTES les rooms)

Verrous : Map en mémoire du gateway, clé `${rowId}:${colKey}`, TTL 30 s
renouvelé par `cell.lock.request` répété, purge à la déconnexion.
Le service REST émet les événements row.* via le gateway après commit.

## Arborescence cible

```
apps/api/src/
  main.ts  app.module.ts
  auth/ (module, controller, service, jwt.guard, ws-jwt util)
  users/ columns/ choices/ rows/ months/
  realtime/ (gateway, locks.service, presence.service)
  events/ (row-events service)
  import/ (commande CLI import:xlsx, repair-zoho.ts, colors.ts)
  prisma/ (prisma.service)
apps/web/src/
  app/login/page.tsx
  app/(app)/layout.tsx  page.tsx  archives/page.tsx  recherche/page.tsx
  app/(app)/parametres/page.tsx  colonnes.tsx  listes.tsx  equipe.tsx
  lib/api.ts  socket.ts  store.ts (zustand)
  components/grid/ (DataGrid.tsx, SelectCellEditor.tsx, SelectCellRenderer.tsx,
    DateCellEditor.tsx, RowContextMenu.tsx, MonthTabs.tsx, PresenceBar.tsx,
    SearchBar.tsx, HighlightPalette.tsx)
deploy/ (apache-vhost.conf, ecosystem.config.js, install.md, backup.md)
```

## Couleurs initiales (données de seed/import — source spec §2.3)

Statuts : NEW #FFFF00/#FF0000/gras ; STAGING #F8B5C8/#E64219/gras ;
A SUIVRE #FFA600/#FF0000/gras ; ATT TECH, ATT PARTE, ATT 5 COM,
ATT CLIENT #F8B5C8/#E64219/gras ; ATT PV #744388/#FFFFFF/gras ;
EN COLLECTE #F9E79F/#786208 ; STAND BY #85C1E9/#002060/gras ;
A PLANIFIER #13ED0C/#FF0000/gras ; INSTALLATION #9BDEB4/#176638/gras ;
A DISTANCE neutre ; ANNULEE #FF0000/#000000/gras ; CLOTUREE #A6A6A6/#ABEBC6.

Partenaires colorés Excel : EVERLINK #229955 ; HIGHCOM #C39BD3 ;
ENTREPRISE PRO #2772A4 ; OR-TEL #F1C40F ; VIP TELECOM #AED6F1 ;
WETELGROUP #FCDAE3 (texte #000000 sauf mention). Tous les autres
partenaires : `pastelFor(label)`.

Tech : DIRECT texte #009ADF gras ; ADWEB, DELTINFO, SOSINFO, OCCITECH,
PSITEK, TOULINFO, VOSGES INFO, LAMIE texte #229955 gras ; les autres neutres.
