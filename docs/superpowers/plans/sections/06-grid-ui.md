# Section 06 — Grille tableur (front)

## Feature 6 — Grille tableur (branche `feature/grid-ui`)

**But:** livrer l'interface tableur complète — store zustand, client REST front, grille AG Grid éditable (listes colorées, dates, texte long, surlignage manuel), onglets de mois, menu contextuel de ligne, pages `/`, `/archives`, `/recherche` — avec un test Playwright prouvant qu'une édition de cellule est persistée.

**Dépend de:**
- Feature 1 (socle monorepo `@suivi/web` / `@suivi/shared`, `transpilePackages: ['@suivi/shared']`, base seedée : 16 colonnes, 5 listes colorées, utilisateur `quentin.durant49@orange.fr` / `changeme`) ;
- Feature 2 (auth : `POST /api/auth/login` qui pose le cookie JWT httpOnly `token`, page `apps/web/src/app/login/page.tsx`, et éventuellement `apps/web/src/app/(app)/layout.tsx`) ;
- Feature 3 (`GET /api/columns`, `PATCH /api/columns/:id`) ;
- Feature 4 (`GET/POST/PATCH/DELETE /api/rows`, `/rows/:id/move`, `/rows/:id/archive`, `/rows/:id/events`, `/rows/search`, `GET /api/months`).

La Feature 7 (temps réel front) branchera Socket.IO sur le store créé ici et remplacera le `PresenceBar` placeholder ; elle ajoutera aussi le rollback fin. Ici, en cas d'échec d'écriture : **toast en français + rechargement du mois**.

### Contrats consommés tels quels (`_contracts.md`)

- Types : `ColumnDTO`, `ChoiceDTO`, `RowDTO`, `RowEventDTO`, `MonthInfo`, `UserDTO`, `CellValue`, `CellFormat`, `ColumnType`, `ApiError`, `ErrorCode`.
- Routes : voir tableau des contrats. `PATCH /api/rows/:id` prend `{ expectedVersion, patch?, formats? }`, répond `200 RowDTO` ou `409 VERSION_CONFLICT`.
- `formats` : `Record<string, { bg?: string } | null>` — `null` efface le surlignage d'une colonne.
- Codes d'erreur traités dans ce périmètre : `AUTH_REQUIRED`, `VALIDATION_FAILED`, `NOT_FOUND`, `VERSION_CONFLICT`. Chacun a son test (Tasks 6.2 et 6.5).

### Fichiers créés dans cette feature (racine du repo)

```
apps/web/vitest.config.ts
apps/web/vitest.setup.ts
apps/web/src/lib/store.ts                       + store.spec.ts
apps/web/src/lib/api.ts                         + api.spec.ts        (créé OU étendu — cf. Task 6.2)
apps/web/src/components/grid/SelectCellRenderer.tsx + SelectCellRenderer.spec.tsx
apps/web/src/components/grid/SelectCellEditor.tsx   + SelectCellEditor.spec.tsx
apps/web/src/components/grid/DateCellEditor.tsx     + DateCellEditor.spec.tsx
apps/web/src/components/grid/columnDefs.ts          + columnDefs.spec.ts
apps/web/src/components/grid/cellCommit.ts          + cellCommit.spec.ts
apps/web/src/components/grid/columnLayout.ts        + columnLayout.spec.ts
apps/web/src/components/grid/MonthTabs.tsx          + MonthTabs.spec.tsx
apps/web/src/components/grid/HighlightPalette.tsx   + HighlightPalette.spec.tsx
apps/web/src/components/grid/RowContextMenu.tsx     + RowContextMenu.spec.tsx
apps/web/src/components/grid/RowHistoryPanel.tsx    + RowHistoryPanel.spec.tsx
apps/web/src/components/grid/SearchBar.tsx          + SearchBar.spec.tsx
apps/web/src/components/grid/PresenceBar.tsx
apps/web/src/components/grid/DataGrid.tsx
apps/web/src/app/(app)/page.tsx
apps/web/src/app/(app)/archives/page.tsx
apps/web/src/app/(app)/recherche/page.tsx
apps/web/e2e/grid.spec.ts
```

`columnDefs.ts`, `cellCommit.ts`, `columnLayout.ts` et `RowHistoryPanel.tsx` sont des modules utilitaires **ajoutés** à `components/grid/` ; ils ne remplacent aucun fichier de l'arborescence des contrats. Ils existent pour que la logique de la grille soit testable sans monter AG Grid dans jsdom.

Fichiers modifiés : `apps/web/package.json`, `apps/web/tsconfig.json`.
Fichier supprimé : `apps/web/src/app/page.tsx` (placeholder de la Feature 1 ; il entre en collision de route avec `app/(app)/page.tsx`, Next.js refuse deux pages sur `/`).

### Stratégie de test

- **Vitest + Testing Library** (jsdom) pour tout ce qui est pur ou React simple : store, client REST, éditeurs/renderers de cellule, construction des `ColDef`, commit optimiste, onglets, menu contextuel, palette, historique, barre de recherche.
- **AG Grid n'est pas monté dans jsdom** (le composant a besoin de mesures de layout réelles) : `DataGrid.tsx` et les trois pages sont validés par `next build` (compilation stricte) puis par le test **Playwright** de la Task 6.12.

---

### Task 6.1: Branche, dépendances front, harness Vitest et `lib/store.ts`

**Files:**
- Create: `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts`, `apps/web/src/lib/store.ts`
- Modify: `apps/web/package.json`, `apps/web/tsconfig.json`
- Test: `apps/web/src/lib/store.spec.ts`

**Interfaces:**
- Consomme : `ColumnDTO`, `ChoiceDTO`, `RowDTO`, `MonthInfo`, `UserDTO`, `CellValue`, `CellFormat` de `@suivi/shared` (Feature 1).
- Produit :
  - `export type ToastKind = 'error' | 'info'`
  - `export interface ToastState { message: string; kind: ToastKind }`
  - `export type GridView = 'month' | 'archives'`
  - `export interface RowChanges { patch?: Record<string, CellValue>; formats?: Record<string, CellFormat | null>; version?: number }`
  - `export interface AppState { user, columns, choicesByColumnKey, rows, monthCourant, months, view, toast, setUser, setColumns, setRows, setMonths, setMonthCourant, setView, applyRowPatch, upsertRow, addRow, removeRow, showToast, hideToast }`
  - `export const useAppStore` — store zustand (`create<AppState>()`), consommé par toutes les tâches suivantes **et** par la Feature 7.

- [ ] **Étape 1: créer la branche gitflow**

```bash
git checkout develop && git pull && git checkout -b feature/grid-ui
```

Attendu : `Switched to a new branch 'feature/grid-ui'`.

- [ ] **Étape 2: installer les dépendances front et déclarer les scripts de test**

```bash
pnpm --filter @suivi/web add ag-grid-community@^34.0.0 ag-grid-react@^34.0.0 zustand@^5.0.0
pnpm --filter @suivi/web add -D vitest@^3.0.0 @vitejs/plugin-react@^4.3.0 jsdom@^25.0.0 @testing-library/react@^16.1.0 @testing-library/user-event@^14.5.2
```

Ajouter les scripts dans `apps/web/package.json` (bloc `"scripts"`, à côté de `dev`/`build`/`start`) :

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

Créer `apps/web/vitest.config.ts` :

```ts
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Le package est publié en source TypeScript : on pointe le fichier
      // directement pour que Vite le transpile comme du code local.
      '@suivi/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    restoreMocks: true,
  },
});
```

Créer `apps/web/vitest.setup.ts` :

```ts
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
```

Dans `apps/web/tsconfig.json`, exclure les tests e2e Playwright du typecheck Next (ils arrivent Tasks 6.11 et 6.12) en remplaçant la clé `"exclude"` :

```json
  "exclude": ["node_modules", ".next"]
```

- [ ] **Étape 3: écrire le test du store (échec attendu)**

Créer `apps/web/src/lib/store.spec.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { ColumnDTO, RowDTO } from '@suivi/shared';
import { useAppStore } from './store';

function column(): ColumnDTO {
  return {
    id: 'col-statut',
    key: 'statut',
    label: 'INSTALLATION',
    type: 'SELECT',
    position: 11,
    width: 150,
    visible: true,
    choices: [
      {
        id: 'ch-2',
        columnId: 'col-statut',
        label: 'ANNULEE',
        bgColor: '#FF0000',
        textColor: '#000000',
        bold: true,
        position: 13,
        archived: true,
      },
      {
        id: 'ch-1',
        columnId: 'col-statut',
        label: 'NEW',
        bgColor: '#FFFF00',
        textColor: '#FF0000',
        bold: true,
        position: 0,
        archived: false,
      },
    ],
  };
}

function row(overrides: Partial<RowDTO> = {}): RowDTO {
  return {
    id: 'row-1',
    month: '2026-08',
    position: 0,
    data: { client: 'ARCADIA', statut: 'NEW' },
    formats: { num_chrono: { bg: '#FFFF00' } },
    version: 3,
    archived: false,
    updatedAt: '2026-08-10T10:00:00.000Z',
    ...overrides,
  };
}

const initial = useAppStore.getState();

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      ...initial,
      user: null,
      columns: [],
      choicesByColumnKey: {},
      rows: [],
      months: [],
      monthCourant: '2026-08',
      view: 'month',
      toast: null,
    });
  });

  it('indexe les choix par clé de colonne, triés par position, archivés compris', () => {
    useAppStore.getState().setColumns([column()]);
    const choices = useAppStore.getState().choicesByColumnKey['statut'];
    expect(choices.map((choice) => choice.label)).toEqual(['NEW', 'ANNULEE']);
  });

  it('applyRowPatch fusionne data, formats et version sans muter la ligne d’origine', () => {
    const original = row();
    useAppStore.getState().setRows([original]);
    useAppStore.getState().applyRowPatch('row-1', {
      patch: { statut: 'ATT PV' },
      version: 4,
    });
    const updated = useAppStore.getState().rows[0];
    expect(updated.data).toEqual({ client: 'ARCADIA', statut: 'ATT PV' });
    expect(updated.version).toBe(4);
    expect(original.data.statut).toBe('NEW');
  });

  it('applyRowPatch supprime un format quand la valeur est null', () => {
    useAppStore.getState().setRows([row()]);
    useAppStore.getState().applyRowPatch('row-1', { formats: { num_chrono: null } });
    expect(useAppStore.getState().rows[0].formats).toEqual({});
  });

  it('applyRowPatch ignore une ligne inconnue', () => {
    useAppStore.getState().setRows([row()]);
    useAppStore.getState().applyRowPatch('row-inconnue', { patch: { client: 'X' } });
    expect(useAppStore.getState().rows[0].data.client).toBe('ARCADIA');
  });

  it('addRow insère à la position demandée, removeRow retire la ligne', () => {
    useAppStore.getState().setRows([row(), row({ id: 'row-2', position: 1 })]);
    useAppStore.getState().addRow(row({ id: 'row-3', position: 1 }), 1);
    expect(useAppStore.getState().rows.map((r) => r.id)).toEqual([
      'row-1',
      'row-3',
      'row-2',
    ]);
    useAppStore.getState().removeRow('row-1');
    expect(useAppStore.getState().rows.map((r) => r.id)).toEqual(['row-3', 'row-2']);
  });

  it('addRow sans index ajoute en fin de liste', () => {
    useAppStore.getState().setRows([row()]);
    useAppStore.getState().addRow(row({ id: 'row-9' }));
    expect(useAppStore.getState().rows.map((r) => r.id)).toEqual(['row-1', 'row-9']);
  });

  it('upsertRow remplace une ligne existante et ajoute une ligne inconnue', () => {
    useAppStore.getState().setRows([row()]);
    useAppStore.getState().upsertRow(row({ version: 9, data: { client: 'NEO' } }));
    expect(useAppStore.getState().rows).toHaveLength(1);
    expect(useAppStore.getState().rows[0].version).toBe(9);
    useAppStore.getState().upsertRow(row({ id: 'row-7' }));
    expect(useAppStore.getState().rows).toHaveLength(2);
  });

  it('showToast / hideToast pilotent le message utilisateur', () => {
    useAppStore.getState().showToast('Enregistrement impossible.', 'error');
    expect(useAppStore.getState().toast).toEqual({
      message: 'Enregistrement impossible.',
      kind: 'error',
    });
    useAppStore.getState().hideToast();
    expect(useAppStore.getState().toast).toBeNull();
  });
});
```

- [ ] **Étape 4: lancer le test (échec attendu)**

```bash
pnpm --filter @suivi/web test -- src/lib/store.spec.ts
```

Attendu : **FAIL** — `Failed to resolve import "./store"` (le fichier n'existe pas).

- [ ] **Étape 5: implémenter le store**

Créer `apps/web/src/lib/store.ts` :

```ts
import { create } from 'zustand';
import type {
  CellFormat,
  CellValue,
  ChoiceDTO,
  ColumnDTO,
  MonthInfo,
  RowDTO,
  UserDTO,
} from '@suivi/shared';

export type ToastKind = 'error' | 'info';

export interface ToastState {
  message: string;
  kind: ToastKind;
}

export type GridView = 'month' | 'archives';

export interface RowChanges {
  patch?: Record<string, CellValue>;
  formats?: Record<string, CellFormat | null>;
  version?: number;
}

export interface AppState {
  user: UserDTO | null;
  columns: ColumnDTO[];
  /** Tous les choix (archivés compris) indexés par `Column.key`, triés par position. */
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

function indexChoices(columns: ColumnDTO[]): Record<string, ChoiceDTO[]> {
  const index: Record<string, ChoiceDTO[]> = {};
  for (const column of columns) {
    index[column.key] = [...column.choices].sort((a, b) => a.position - b.position);
  }
  return index;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const useAppStore = create<AppState>()((set) => ({
  user: null,
  columns: [],
  choicesByColumnKey: {},
  rows: [],
  monthCourant: currentMonth(),
  months: [],
  view: 'month',
  toast: null,

  setUser: (user) => set({ user }),

  setColumns: (columns) => {
    const sorted = [...columns].sort((a, b) => a.position - b.position);
    set({ columns: sorted, choicesByColumnKey: indexChoices(sorted) });
  },

  setRows: (rows) => set({ rows }),
  setMonths: (months) => set({ months }),
  setMonthCourant: (monthCourant) => set({ monthCourant }),
  setView: (view) => set({ view }),

  applyRowPatch: (rowId, changes) =>
    set((state) => ({
      rows: state.rows.map((row) => {
        if (row.id !== rowId) return row;
        const data = changes.patch ? { ...row.data, ...changes.patch } : row.data;
        let formats = row.formats;
        if (changes.formats) {
          formats = { ...row.formats };
          for (const [key, value] of Object.entries(changes.formats)) {
            if (value === null) {
              delete formats[key];
            } else {
              formats[key] = value;
            }
          }
        }
        return { ...row, data, formats, version: changes.version ?? row.version };
      }),
    })),

  upsertRow: (row) =>
    set((state) => {
      const index = state.rows.findIndex((existing) => existing.id === row.id);
      if (index === -1) return { rows: [...state.rows, row] };
      const rows = [...state.rows];
      rows[index] = row;
      return { rows };
    }),

  addRow: (row, index) =>
    set((state) => {
      if (index === undefined || index < 0 || index > state.rows.length) {
        return { rows: [...state.rows, row] };
      }
      const rows = [...state.rows];
      rows.splice(index, 0, row);
      return { rows };
    }),

  removeRow: (rowId) =>
    set((state) => ({ rows: state.rows.filter((row) => row.id !== rowId) })),

  showToast: (message, kind = 'error') => set({ toast: { message, kind } }),
  hideToast: () => set({ toast: null }),
}));
```

- [ ] **Étape 6: relancer le test**

```bash
pnpm --filter @suivi/web test -- src/lib/store.spec.ts
```

Attendu : **PASS** — 8 tests verts.

- [ ] **Étape 7: commit**

```bash
git add apps/web/package.json apps/web/tsconfig.json apps/web/vitest.config.ts apps/web/vitest.setup.ts apps/web/src/lib/store.ts apps/web/src/lib/store.spec.ts pnpm-lock.yaml && git commit -m "feat: store zustand de la grille et harness de tests vitest"
```

> À vérifier à l'exécution : `@vitejs/plugin-react` doit transformer le JSX des specs `.tsx` (Tasks 6.3+). Si Vitest se plaint de `React is not defined`, ajouter `esbuild: { jsxInject: "import React from 'react'" }` dans `vitest.config.ts` — React 19 utilise normalement le runtime automatique et cette ligne est inutile.

---

### Task 6.2: `lib/api.ts` — client REST complet et erreurs typées

**Files:**
- Modify: `apps/web/src/lib/api.ts` (créé par la Feature 2, Task 2.7)
- Test: `apps/web/src/lib/api.spec.ts`

**Consigne de réécriture (pas de fusion approximative) :** `apps/web/src/lib/api.ts` existe déjà. **Remplacer intégralement son contenu par le bloc de l'étape 3 ci-dessous**, qui reprend à l'identique la classe `ApiRequestError`, `apiBaseUrl`, `apiUrl`, `serverApiBaseUrl` et `apiFetch` de la Feature 2 — mêmes noms, même constructeur `(code, message, status, details?)`, **même convention de chemin : `apiFetch` ajoute lui-même le préfixe `/api`, les appelants passent `'/columns'`, `'/rows?month=…'`** (`_contracts.md` § « Client HTTP web »). Il ajoute par-dessus les fonctions de route de la grille. Les helpers `apiGet`/`apiPost`/`apiPatch`/`apiDel` et l'objet `api` de la Feature 2 sont conservés : les composants de la Feature 2 (`login/page.tsx`, `LogoutButton.tsx`) les importent.

**Interfaces:**
- Consomme : routes REST des contrats ; types `ColumnDTO`, `RowDTO`, `RowEventDTO`, `MonthInfo`, `UserDTO`, `CellValue`, `CellFormat`, `ErrorCode` ; variable d'environnement `NEXT_PUBLIC_API_URL`.
- Produit :
  - `export type ApiErrorCode = ErrorCode | 'INTERNAL'` et `export class ApiRequestError extends Error { readonly code: ApiErrorCode; readonly status: number; readonly details?: unknown }` (constructeur `(code, message, status, details?)`)
  - `export const apiBaseUrl: string`, `export function apiUrl(path: string): string` (= `` `${apiBaseUrl}/api${path}` ``), `export function serverApiBaseUrl(): string`
  - `export const api = { get, post, patch, del }` et `apiGet` / `apiPost` / `apiPatch` / `apiDel` (conservés de la Feature 2)
  - `export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T>`
  - `export async function login(email: string, password: string): Promise<UserDTO>`
  - `export async function logout(): Promise<void>`
  - `export async function getMe(): Promise<UserDTO>`
  - `export async function getColumns(): Promise<ColumnDTO[]>`
  - `export async function patchColumn(id: string, body: { label?: string; position?: number; width?: number; visible?: boolean }): Promise<ColumnDTO>`
  - `export async function getMonths(): Promise<MonthInfo[]>`
  - `export async function getRows(filter: { month: string } | { archived: true }): Promise<RowDTO[]>`
  - `export async function searchRows(q: string): Promise<RowDTO[]>`
  - `export async function createRow(body: { month: string; position?: number }): Promise<RowDTO>`
  - `export async function patchRow(id: string, body: { expectedVersion: number; patch?: Record<string, CellValue>; formats?: Record<string, CellFormat | null> }): Promise<RowDTO>`
  - `export async function moveRow(id: string, body: { month?: string; position?: number }): Promise<RowDTO>`
  - `export async function archiveRow(id: string, archived: boolean): Promise<RowDTO>`
  - `export async function deleteRow(id: string): Promise<void>`
  - `export async function getRowEvents(id: string): Promise<RowEventDTO[]>`

- [ ] **Étape 1: écrire le test du client (échec attendu)**

Créer `apps/web/src/lib/api.spec.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiRequestError,
  apiFetch,
  archiveRow,
  createRow,
  deleteRow,
  getColumns,
  getRowEvents,
  getRows,
  moveRow,
  patchColumn,
  patchRow,
  searchRows,
} from './api';

function mockFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () =>
    new Response(body === null ? '' : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('préfixe /api, envoie les cookies et rend le corps JSON', async () => {
    const fetchMock = mockFetch(200, [{ id: 'col-1' }]);
    const result = await getColumns();
    expect(result).toEqual([{ id: 'col-1' }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/columns');
    expect(init.credentials).toBe('include');
  });

  it('rend undefined sur un 204 sans corps', async () => {
    mockFetch(204, null);
    await expect(deleteRow('row-1')).resolves.toBeUndefined();
  });

  it('transforme un 401 en ApiRequestError AUTH_REQUIRED', async () => {
    mockFetch(401, { code: 'AUTH_REQUIRED', message: 'Authentification requise.' });
    await expect(apiFetch('/rows?month=2026-08')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      status: 401,
      message: 'Authentification requise.',
    });
  });

  it('transforme un 404 en ApiRequestError NOT_FOUND', async () => {
    mockFetch(404, { code: 'NOT_FOUND', message: 'Ligne introuvable.' });
    await expect(getRowEvents('row-x')).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('transforme un 422 en ApiRequestError VALIDATION_FAILED', async () => {
    mockFetch(422, { code: 'VALIDATION_FAILED', message: 'Mois invalide.' });
    await expect(createRow({ month: 'aout' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 422,
    });
  });

  it('transforme un 409 en ApiRequestError VERSION_CONFLICT et conserve les details', async () => {
    mockFetch(409, {
      code: 'VERSION_CONFLICT',
      message: 'Modifiée entre-temps.',
      details: { conflictKeys: ['statut'] },
    });
    try {
      await patchRow('row-1', { expectedVersion: 2, patch: { statut: 'NEW' } });
      throw new Error('patchRow aurait dû échouer');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).code).toBe('VERSION_CONFLICT');
      expect((error as ApiRequestError).details).toEqual({ conflictKeys: ['statut'] });
    }
  });

  it('déduit un code depuis le statut quand le corps n’est pas typé', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>502</html>', { status: 502 })),
    );
    await expect(apiFetch('/months')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 502,
    });
  });
});

describe('routes', () => {
  it('getRows construit ?month= ou ?archived=true', async () => {
    const fetchMock = mockFetch(200, []);
    await getRows({ month: '2026-08' });
    await getRows({ archived: true });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/rows?month=2026-08');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/rows?archived=true');
  });

  it('searchRows encode la requête', async () => {
    const fetchMock = mockFetch(200, []);
    await searchRows('ARCADIA & CO');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/rows/search?q=ARCADIA%20%26%20CO');
  });

  it('patchRow envoie expectedVersion et patch en PATCH', async () => {
    const fetchMock = mockFetch(200, { id: 'row-1', version: 3 });
    await patchRow('row-1', { expectedVersion: 2, patch: { client: 'NEO' } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/rows/row-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({
      expectedVersion: 2,
      patch: { client: 'NEO' },
    });
  });

  it('moveRow, archiveRow et patchColumn ciblent les bonnes routes', async () => {
    const fetchMock = mockFetch(200, { id: 'row-1' });
    await moveRow('row-1', { month: '2026-09' });
    await archiveRow('row-1', true);
    await patchColumn('col-1', { width: 240 });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/rows/row-1/move');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/rows/row-1/archive');
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({
      archived: true,
    });
    expect(fetchMock.mock.calls[2][0]).toBe('/api/columns/col-1');
    expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe('PATCH');
  });
});
```

- [ ] **Étape 2: lancer le test (échec attendu)**

```bash
pnpm --filter @suivi/web test -- src/lib/api.spec.ts
```

Attendu : **FAIL** — `apps/web/src/lib/api.ts` existe (Feature 2) mais n'exporte pas encore les routes de la grille : `does not provide an export named 'patchRow'`.

- [ ] **Étape 3: implémenter le client REST**

Écrire `apps/web/src/lib/api.ts` (contenu cible complet) :

```ts
import type {
  ApiError,
  CellFormat,
  CellValue,
  ColumnDTO,
  ErrorCode,
  MonthInfo,
  RowDTO,
  RowEventDTO,
  UserDTO,
} from '@suivi/shared';

/** `ErrorCode` du contrat, élargi au code technique 'INTERNAL' (erreur serveur/réseau). */
export type ApiErrorCode = ErrorCode | 'INTERNAL';

/** Erreur métier renvoyée par l'API, avec son code des contrats. */
export class ApiRequestError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** En prod NEXT_PUBLIC_API_URL est vide : même origine, Apache route /api. */
export const apiBaseUrl: string = process.env.NEXT_PUBLIC_API_URL ?? '';

/**
 * URL complète d'un chemin d'API. Les appelants passent un chemin SANS le
 * préfixe `/api` (`'/columns'`, `'/rows?month=2026-08'`).
 */
export function apiUrl(path: string): string {
  return `${apiBaseUrl}/api${path}`;
}

/**
 * Base des appels côté serveur (Server Components) : `fetch` exige une URL
 * absolue. Le préfixe `/api` n'est PAS inclus.
 */
export function serverApiBaseUrl(): string {
  return process.env.API_INTERNAL_URL ?? apiBaseUrl ?? 'http://localhost:3001';
}

function codeForStatus(status: number): ApiErrorCode {
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'VERSION_CONFLICT';
  return 'VALIDATION_FAILED';
}

function isApiError(body: unknown): body is ApiError {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { code?: unknown }).code === 'string' &&
    typeof (body as { message?: unknown }).message === 'string'
  );
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

  const text = await response.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    if (isApiError(body)) {
      throw new ApiRequestError(
        body.code,
        body.message,
        response.status,
        body.details,
      );
    }
    throw new ApiRequestError(
      codeForStatus(response.status),
      'Le serveur a refusé la requête. Réessayez dans un instant.',
      response.status,
    );
  }

  return body as T;
}

function jsonBody(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

// --- Helpers génériques (conservés de la Feature 2, Task 2.7) ----------------

export function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPatch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiDel<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: 'DELETE' });
}

export const api = {
  get: apiGet,
  post: apiPost,
  patch: apiPatch,
  del: apiDel,
} as const;

// --- Authentification -------------------------------------------------------

export async function login(email: string, password: string): Promise<UserDTO> {
  const result = await apiFetch<{ user: UserDTO }>(
    '/auth/login',
    jsonBody('POST', { email, password }),
  );
  return result.user;
}

export async function logout(): Promise<void> {
  await apiFetch<void>('/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<UserDTO> {
  const result = await apiFetch<{ user: UserDTO }>('/auth/me');
  return result.user;
}

// --- Colonnes ---------------------------------------------------------------

export async function getColumns(): Promise<ColumnDTO[]> {
  return apiFetch<ColumnDTO[]>('/columns');
}

export async function patchColumn(
  id: string,
  body: { label?: string; position?: number; width?: number; visible?: boolean },
): Promise<ColumnDTO> {
  return apiFetch<ColumnDTO>(`/columns/${id}`, jsonBody('PATCH', body));
}

// --- Mois -------------------------------------------------------------------

export async function getMonths(): Promise<MonthInfo[]> {
  return apiFetch<MonthInfo[]>('/months');
}

// --- Lignes -----------------------------------------------------------------

export async function getRows(
  filter: { month: string } | { archived: true },
): Promise<RowDTO[]> {
  const query =
    'month' in filter
      ? `month=${encodeURIComponent(filter.month)}`
      : 'archived=true';
  return apiFetch<RowDTO[]>(`/rows?${query}`);
}

export async function searchRows(q: string): Promise<RowDTO[]> {
  return apiFetch<RowDTO[]>(`/rows/search?q=${encodeURIComponent(q)}`);
}

export async function createRow(body: {
  month: string;
  position?: number;
}): Promise<RowDTO> {
  return apiFetch<RowDTO>('/rows', jsonBody('POST', body));
}

export async function patchRow(
  id: string,
  body: {
    expectedVersion: number;
    patch?: Record<string, CellValue>;
    formats?: Record<string, CellFormat | null>;
  },
): Promise<RowDTO> {
  return apiFetch<RowDTO>(`/rows/${id}`, jsonBody('PATCH', body));
}

export async function moveRow(
  id: string,
  body: { month?: string; position?: number },
): Promise<RowDTO> {
  return apiFetch<RowDTO>(`/rows/${id}/move`, jsonBody('POST', body));
}

export async function archiveRow(id: string, archived: boolean): Promise<RowDTO> {
  return apiFetch<RowDTO>(`/rows/${id}/archive`, jsonBody('POST', { archived }));
}

export async function deleteRow(id: string): Promise<void> {
  await apiFetch<void>(`/rows/${id}`, { method: 'DELETE' });
}

export async function getRowEvents(id: string): Promise<RowEventDTO[]> {
  return apiFetch<RowEventDTO[]>(`/rows/${id}/events`);
}
```

- [ ] **Étape 4: relancer le test**

```bash
pnpm --filter @suivi/web test -- src/lib/api.spec.ts
```

Attendu : **PASS** — 11 tests verts (dont un par code d'erreur : `AUTH_REQUIRED`, `NOT_FOUND`, `VALIDATION_FAILED`, `VERSION_CONFLICT`).

- [ ] **Étape 5: commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/api.spec.ts && git commit -m "feat: client REST front complet avec erreurs typees"
```

> À vérifier à l'exécution : la forme exacte du corps d'erreur produit par l'API. Si un filtre d'exception NestJS (Feature 1/2) enveloppe la réponse (`{ error: { code, message } }`), élargir `isApiError` pour lire aussi `body.error.code` — sans changer aucune signature.

---

### Task 6.3: `SelectCellRenderer` et `SelectCellEditor` (pastilles colorées)

**Files:**
- Create: `apps/web/src/components/grid/SelectCellRenderer.tsx`, `apps/web/src/components/grid/SelectCellEditor.tsx`
- Test: `apps/web/src/components/grid/SelectCellRenderer.spec.tsx`, `apps/web/src/components/grid/SelectCellEditor.spec.tsx`

**Interfaces:**
- Consomme : `ChoiceDTO`, `CellValue` (`@suivi/shared`).
- Produit :
  - `export interface SelectCellRendererProps { value: CellValue; choices: ChoiceDTO[] }`
  - `export function SelectCellRenderer(props: SelectCellRendererProps): React.JSX.Element`
  - `export interface SelectCellEditorProps { value: CellValue; choices: ChoiceDTO[]; onValueChange: (value: CellValue) => void; stopEditing: (cancel?: boolean) => void }`
  - `export function SelectCellEditor(props: SelectCellEditorProps): React.JSX.Element`
  - Attributs de test consommés par Playwright (Task 6.12) : `data-testid="select-pastille"`, `data-testid="select-editor"`, `data-testid="select-filter"`, `data-testid="select-option-<LABEL>"`.

- [ ] **Étape 1: écrire les tests du renderer (échec attendu)**

Créer `apps/web/src/components/grid/SelectCellRenderer.spec.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ChoiceDTO } from '@suivi/shared';
import { SelectCellRenderer } from './SelectCellRenderer';

const choices: ChoiceDTO[] = [
  {
    id: 'ch-1',
    columnId: 'col-statut',
    label: 'INSTALLATION',
    bgColor: '#9BDEB4',
    textColor: '#176638',
    bold: true,
    position: 0,
    archived: false,
  },
  {
    id: 'ch-2',
    columnId: 'col-statut',
    label: 'A DISTANCE',
    bgColor: null,
    textColor: null,
    bold: false,
    position: 1,
    archived: false,
  },
];

describe('SelectCellRenderer', () => {
  it('affiche une pastille aux couleurs du choix', () => {
    render(<SelectCellRenderer value="INSTALLATION" choices={choices} />);
    const pastille = screen.getByTestId('select-pastille');
    expect(pastille.textContent).toBe('INSTALLATION');
    expect(pastille.style.backgroundColor).toBe('rgb(155, 222, 180)');
    expect(pastille.style.color).toBe('rgb(23, 102, 56)');
    expect(pastille.style.fontWeight).toBe('700');
  });

  it('reste neutre pour un choix sans couleur', () => {
    render(<SelectCellRenderer value="A DISTANCE" choices={choices} />);
    const pastille = screen.getByTestId('select-pastille');
    expect(pastille.style.backgroundColor).toBe('');
    expect(pastille.style.fontWeight).toBe('400');
  });

  it('affiche telle quelle une valeur hors liste (import Excel)', () => {
    render(<SelectCellRenderer value="ATT CLIENTT" choices={choices} />);
    expect(screen.getByTestId('select-pastille').textContent).toBe('ATT CLIENTT');
  });

  it('n’affiche rien pour une cellule vide', () => {
    const { container } = render(<SelectCellRenderer value={null} choices={choices} />);
    expect(container.querySelector('[data-testid="select-pastille"]')).toBeNull();
  });
});
```

- [ ] **Étape 2: lancer le test (échec attendu)**

```bash
pnpm --filter @suivi/web test -- src/components/grid/SelectCellRenderer.spec.tsx
```

Attendu : **FAIL** — `Failed to resolve import "./SelectCellRenderer"`.

- [ ] **Étape 3: implémenter le renderer**

Créer `apps/web/src/components/grid/SelectCellRenderer.tsx` :

```tsx
'use client';

import type { CellValue, ChoiceDTO } from '@suivi/shared';

export interface SelectCellRendererProps {
  value: CellValue;
  choices: ChoiceDTO[];
}

export function findChoice(
  choices: ChoiceDTO[],
  value: CellValue,
): ChoiceDTO | undefined {
  if (value === null || value === undefined) return undefined;
  const label = String(value);
  return choices.find((choice) => choice.label === label);
}

export function SelectCellRenderer({ value, choices }: SelectCellRendererProps) {
  if (value === null || value === undefined || String(value) === '') {
    return <span />;
  }
  const choice = findChoice(choices, value);
  return (
    <span
      data-testid="select-pastille"
      style={{
        display: 'inline-block',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        padding: '1px 6px',
        borderRadius: 3,
        lineHeight: '20px',
        backgroundColor: choice?.bgColor ?? undefined,
        color: choice?.textColor ?? undefined,
        fontWeight: choice?.bold ? 700 : 400,
      }}
    >
      {String(value)}
    </span>
  );
}
```

- [ ] **Étape 4: relancer le test du renderer**

```bash
pnpm --filter @suivi/web test -- src/components/grid/SelectCellRenderer.spec.tsx
```

Attendu : **PASS** — 4 tests verts.

- [ ] **Étape 5: écrire les tests de l'éditeur (échec attendu)**

Créer `apps/web/src/components/grid/SelectCellEditor.spec.tsx` :

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChoiceDTO } from '@suivi/shared';
import { SelectCellEditor } from './SelectCellEditor';

const choices: ChoiceDTO[] = [
  {
    id: 'ch-1',
    columnId: 'col-statut',
    label: 'NEW',
    bgColor: '#FFFF00',
    textColor: '#FF0000',
    bold: true,
    position: 0,
    archived: false,
  },
  {
    id: 'ch-2',
    columnId: 'col-statut',
    label: 'INSTALLATION',
    bgColor: '#9BDEB4',
    textColor: '#176638',
    bold: true,
    position: 1,
    archived: false,
  },
  {
    id: 'ch-3',
    columnId: 'col-statut',
    label: 'ANCIEN STATUT',
    bgColor: null,
    textColor: null,
    bold: false,
    position: 2,
    archived: true,
  },
];

describe('SelectCellEditor', () => {
  it('liste les choix non archivés, pas les archivés', () => {
    render(
      <SelectCellEditor
        value={null}
        choices={choices}
        onValueChange={vi.fn()}
        stopEditing={vi.fn()}
      />,
    );
    expect(screen.getByTestId('select-option-NEW')).toBeDefined();
    expect(screen.getByTestId('select-option-INSTALLATION')).toBeDefined();
    expect(screen.queryByTestId('select-option-ANCIEN STATUT')).toBeNull();
  });

  it('filtre la liste au clavier, sans tenir compte de la casse', async () => {
    const user = userEvent.setup();
    render(
      <SelectCellEditor
        value={null}
        choices={choices}
        onValueChange={vi.fn()}
        stopEditing={vi.fn()}
      />,
    );
    await user.type(screen.getByTestId('select-filter'), 'insta');
    expect(screen.queryByTestId('select-option-NEW')).toBeNull();
    expect(screen.getByTestId('select-option-INSTALLATION')).toBeDefined();
  });

  it('remonte la valeur et ferme l’édition au clic sur un choix', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const stopEditing = vi.fn();
    render(
      <SelectCellEditor
        value={null}
        choices={choices}
        onValueChange={onValueChange}
        stopEditing={stopEditing}
      />,
    );
    await user.click(screen.getByTestId('select-option-INSTALLATION'));
    expect(onValueChange).toHaveBeenCalledWith('INSTALLATION');
    expect(stopEditing).toHaveBeenCalledWith();
  });

  it('valide au clavier : flèche bas puis Entrée', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const stopEditing = vi.fn();
    render(
      <SelectCellEditor
        value={null}
        choices={choices}
        onValueChange={onValueChange}
        stopEditing={stopEditing}
      />,
    );
    const filter = screen.getByTestId('select-filter');
    await user.type(filter, '{ArrowDown}{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('INSTALLATION');
    expect(stopEditing).toHaveBeenCalledWith();
  });

  it('Échap annule sans modifier la valeur', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const stopEditing = vi.fn();
    render(
      <SelectCellEditor
        value="NEW"
        choices={choices}
        onValueChange={onValueChange}
        stopEditing={stopEditing}
      />,
    );
    await user.type(screen.getByTestId('select-filter'), '{Escape}');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(stopEditing).toHaveBeenCalledWith(true);
  });

  it('propose « Vider la cellule » qui remonte null', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const stopEditing = vi.fn();
    render(
      <SelectCellEditor
        value="NEW"
        choices={choices}
        onValueChange={onValueChange}
        stopEditing={stopEditing}
      />,
    );
    await user.click(screen.getByTestId('select-clear'));
    expect(onValueChange).toHaveBeenCalledWith(null);
    expect(stopEditing).toHaveBeenCalledWith();
  });
});
```

- [ ] **Étape 6: lancer le test (échec attendu)**

```bash
pnpm --filter @suivi/web test -- src/components/grid/SelectCellEditor.spec.tsx
```

Attendu : **FAIL** — `Failed to resolve import "./SelectCellEditor"`.

- [ ] **Étape 7: implémenter l'éditeur**

Créer `apps/web/src/components/grid/SelectCellEditor.tsx` :

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CellValue, ChoiceDTO } from '@suivi/shared';

export interface SelectCellEditorProps {
  value: CellValue;
  choices: ChoiceDTO[];
  onValueChange: (value: CellValue) => void;
  stopEditing: (cancel?: boolean) => void;
}

export function SelectCellEditor({
  value,
  choices,
  onValueChange,
  stopEditing,
}: SelectCellEditorProps) {
  const [filter, setFilter] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const needle = filter.trim().toLocaleUpperCase('fr-FR');
    return choices
      .filter((choice) => !choice.archived)
      .filter((choice) =>
        needle === '' ? true : choice.label.toLocaleUpperCase('fr-FR').includes(needle),
      );
  }, [choices, filter]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setHighlighted(0);
  }, [filter]);

  function pick(next: CellValue): void {
    onValueChange(next);
    stopEditing();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      setHighlighted((current) => Math.min(current + 1, visible.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      setHighlighted((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      const choice = visible[highlighted];
      if (choice) pick(choice.label);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      stopEditing(true);
    }
  }

  return (
    <div
      data-testid="select-editor"
      style={{
        background: '#FFFFFF',
        border: '1px solid #D8DEE4',
        borderRadius: 4,
        boxShadow: '0 6px 18px rgba(0,0,0,0.14)',
        minWidth: 200,
        padding: 4,
      }}
    >
      <input
        ref={inputRef}
        data-testid="select-filter"
        aria-label="Filtrer les choix"
        placeholder="Filtrer…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '4px 6px',
          border: '1px solid #D8DEE4',
          borderRadius: 3,
          font: 'inherit',
        }}
      />
      <ul
        style={{
          listStyle: 'none',
          margin: '4px 0 0',
          padding: 0,
          maxHeight: 240,
          overflowY: 'auto',
        }}
      >
        {visible.map((choice, index) => (
          <li key={choice.id}>
            <button
              type="button"
              data-testid={`select-option-${choice.label}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(choice.label)}
              onMouseEnter={() => setHighlighted(index)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                cursor: 'pointer',
                padding: '3px 4px',
                background: index === highlighted ? '#EDF1F5' : 'transparent',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  padding: '1px 6px',
                  borderRadius: 3,
                  backgroundColor: choice.bgColor ?? undefined,
                  color: choice.textColor ?? undefined,
                  fontWeight: choice.bold ? 700 : 400,
                }}
              >
                {choice.label}
              </span>
            </button>
          </li>
        ))}
        {visible.length === 0 ? (
          <li style={{ padding: '4px 6px', color: '#6B7785' }}>Aucun choix</li>
        ) : null}
      </ul>
      <button
        type="button"
        data-testid="select-clear"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => pick(null)}
        style={{
          marginTop: 4,
          width: '100%',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          padding: '3px 6px',
          color: '#6B7785',
        }}
      >
        Vider la cellule
      </button>
    </div>
  );
}
```

Le `value` reçu sert de valeur courante côté AG Grid : l'éditeur ne la modifie que via `onValueChange`, donc `Échap` laisse la cellule intacte. La valeur initiale est volontairement conservée hors du filtre pour ne pas pré-filtrer la liste à l'ouverture.

- [ ] **Étape 8: relancer les deux specs**

```bash
pnpm --filter @suivi/web test -- src/components/grid/SelectCellRenderer.spec.tsx src/components/grid/SelectCellEditor.spec.tsx
```

Attendu : **PASS** — 10 tests verts.

- [ ] **Étape 9: commit**

```bash
git add apps/web/src/components/grid/SelectCellRenderer.tsx apps/web/src/components/grid/SelectCellRenderer.spec.tsx apps/web/src/components/grid/SelectCellEditor.tsx apps/web/src/components/grid/SelectCellEditor.spec.tsx && git commit -m "feat: rendu et editeur de cellule liste avec pastilles colorees"
```

> À vérifier à l'exécution : AG Grid React v34 passe les `cellEditorParams` en props du composant éditeur, et fournit `value`, `onValueChange`, `stopEditing`. Si `stopEditing` n'apparaît pas dans les props, utiliser `props.api.stopEditing()` — sans changer la signature exportée (l'appelant, `columnDefs.ts`, reste identique).

---

### Task 6.4: `DateCellEditor` et `columnDefs.ts` (génération des colonnes AG Grid)

**Files:**
- Create: `apps/web/src/components/grid/DateCellEditor.tsx`, `apps/web/src/components/grid/columnDefs.ts`
- Test: `apps/web/src/components/grid/DateCellEditor.spec.tsx`, `apps/web/src/components/grid/columnDefs.spec.ts`

**Interfaces:**
- Consomme : `SelectCellRenderer`, `SelectCellEditor` (Task 6.3) ; `ColumnDTO`, `ChoiceDTO`, `RowDTO`, `CellValue`, `ColumnType` ; types `ColDef`, `ValueGetterParams`, `ValueSetterParams`, `CellClassParams`, `ValueFormatterParams` de `ag-grid-community` (imports **de type uniquement**, effacés à la compilation : `columnDefs.ts` reste testable sans runtime AG Grid).
- Produit :
  - `export interface DateCellEditorProps { value: CellValue; onValueChange: (value: CellValue) => void; stopEditing: (cancel?: boolean) => void }`
  - `export function DateCellEditor(props: DateCellEditorProps): React.JSX.Element`
  - `export function formatDateFr(value: CellValue): string` — `'2026-08-14'` → `'14/08/2026'`
  - `export function normalizeCellValue(type: ColumnType, raw: unknown): CellValue`
  - `export function cellStyleForRow(row: RowDTO | undefined, key: string): { backgroundColor: string } | null`
  - `export function buildColumnDefs(columns: ColumnDTO[], choicesByColumnKey: Record<string, ChoiceDTO[]>): ColDef<RowDTO>[]`

- [ ] **Étape 1: écrire le test de l'éditeur de date (échec attendu)**

Créer `apps/web/src/components/grid/DateCellEditor.spec.tsx` :

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateCellEditor } from './DateCellEditor';

describe('DateCellEditor', () => {
  it('pré-remplit un input date avec la valeur ISO', () => {
    render(
      <DateCellEditor value="2026-08-14" onValueChange={vi.fn()} stopEditing={vi.fn()} />,
    );
    const input = screen.getByTestId('date-input') as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(input.value).toBe('2026-08-14');
  });

  it('remonte la nouvelle date au format ISO', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <DateCellEditor value={null} onValueChange={onValueChange} stopEditing={vi.fn()} />,
    );
    await user.type(screen.getByTestId('date-input'), '2026-09-01');
    expect(onValueChange).toHaveBeenLastCalledWith('2026-09-01');
  });

  it('remonte null quand la date est effacée', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <DateCellEditor
        value="2026-08-14"
        onValueChange={onValueChange}
        stopEditing={vi.fn()}
      />,
    );
    await user.clear(screen.getByTestId('date-input'));
    expect(onValueChange).toHaveBeenLastCalledWith(null);
  });

  it('Entrée valide, Échap annule', async () => {
    const user = userEvent.setup();
    const stopEditing = vi.fn();
    render(
      <DateCellEditor value={null} onValueChange={vi.fn()} stopEditing={stopEditing} />,
    );
    const input = screen.getByTestId('date-input');
    await user.type(input, '{Enter}');
    expect(stopEditing).toHaveBeenLastCalledWith();
    await user.type(input, '{Escape}');
    expect(stopEditing).toHaveBeenLastCalledWith(true);
  });
});
```

- [ ] **Étape 2: lancer le test (échec attendu)**

```bash
pnpm --filter @suivi/web test -- src/components/grid/DateCellEditor.spec.tsx
```

Attendu : **FAIL** — `Failed to resolve import "./DateCellEditor"`.

- [ ] **Étape 3: implémenter l'éditeur de date**

Créer `apps/web/src/components/grid/DateCellEditor.tsx` :

```tsx
'use client';

import { useEffect, useRef } from 'react';
import type { CellValue } from '@suivi/shared';

export interface DateCellEditorProps {
  value: CellValue;
  onValueChange: (value: CellValue) => void;
  stopEditing: (cancel?: boolean) => void;
}

/** Un `input[type=date]` n'accepte que le format ISO `YYYY-MM-DD`. */
function toInputValue(value: CellValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

export function DateCellEditor({
  value,
  onValueChange,
  stopEditing,
}: DateCellEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      ref={inputRef}
      data-testid="date-input"
      type="date"
      aria-label="Date"
      defaultValue={toInputValue(value)}
      onChange={(event) => onValueChange(event.target.value === '' ? null : event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          stopEditing();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          stopEditing(true);
        }
      }}
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        border: '1px solid #2772A4',
        padding: '0 4px',
        font: 'inherit',
      }}
    />
  );
}
```

- [ ] **Étape 4: relancer le test de l'éditeur de date**

```bash
pnpm --filter @suivi/web test -- src/components/grid/DateCellEditor.spec.tsx
```

Attendu : **PASS** — 4 tests verts.

- [ ] **Étape 5: écrire le test de `columnDefs` (échec attendu)**

Créer `apps/web/src/components/grid/columnDefs.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { ColumnDTO, RowDTO } from '@suivi/shared';
import {
  buildColumnDefs,
  cellStyleForRow,
  formatDateFr,
  normalizeCellValue,
} from './columnDefs';

const columns: ColumnDTO[] = [
  {
    id: 'col-impe',
    key: 'impe',
    label: 'IMPE',
    type: 'DATE',
    position: 0,
    width: 110,
    visible: true,
    choices: [],
  },
  {
    id: 'col-client',
    key: 'client',
    label: 'CLIENT',
    type: 'TEXT',
    position: 1,
    width: 220,
    visible: true,
    choices: [],
  },
  {
    id: 'col-porta',
    key: 'porta_commentaires',
    label: 'PORTA ET COMMENTAIRES IMPORTANT',
    type: 'LONGTEXT',
    position: 2,
    width: 320,
    visible: true,
    choices: [],
  },
  {
    id: 'col-statut',
    key: 'statut',
    label: 'INSTALLATION',
    type: 'SELECT',
    position: 3,
    width: 150,
    visible: true,
    choices: [],
  },
  {
    id: 'col-masquee',
    key: 'infos_facturation',
    label: 'INFOS FACTURATION',
    type: 'TEXT',
    position: 4,
    width: 220,
    visible: false,
    choices: [],
  },
];

const row: RowDTO = {
  id: 'row-1',
  month: '2026-08',
  position: 0,
  data: { impe: '2026-08-14', client: 'ARCADIA', statut: 'NEW' },
  formats: { client: { bg: '#FFFF00' } },
  version: 1,
  archived: false,
  updatedAt: '2026-08-10T10:00:00.000Z',
};

describe('formatDateFr', () => {
  it('formate une date ISO en JJ/MM/AAAA', () => {
    expect(formatDateFr('2026-08-14')).toBe('14/08/2026');
    expect(formatDateFr('2026-08-14T00:00:00.000Z')).toBe('14/08/2026');
  });

  it('rend une chaîne vide pour null et laisse passer une valeur non datée', () => {
    expect(formatDateFr(null)).toBe('');
    expect(formatDateFr('à confirmer')).toBe('à confirmer');
  });
});

describe('normalizeCellValue', () => {
  it('trime le texte et transforme le vide en null', () => {
    expect(normalizeCellValue('TEXT', '  ARCADIA  ')).toBe('ARCADIA');
    expect(normalizeCellValue('TEXT', '   ')).toBeNull();
    expect(normalizeCellValue('TEXT', undefined)).toBeNull();
  });

  it('préserve les codes textuels (zéros initiaux, « 2A »)', () => {
    expect(normalizeCellValue('TEXT', '02100')).toBe('02100');
    expect(normalizeCellValue('TEXT', '2A')).toBe('2A');
  });

  it('convertit les nombres pour une colonne NUMBER', () => {
    expect(normalizeCellValue('NUMBER', '78')).toBe(78);
    expect(normalizeCellValue('NUMBER', '12,5')).toBe(12.5);
    expect(normalizeCellValue('NUMBER', 'abc')).toBeNull();
  });
});

describe('cellStyleForRow', () => {
  it('applique le surlignage manuel de la ligne', () => {
    expect(cellStyleForRow(row, 'client')).toEqual({ backgroundColor: '#FFFF00' });
  });

  it('rend null sans surlignage ou sans ligne', () => {
    expect(cellStyleForRow(row, 'statut')).toBeNull();
    expect(cellStyleForRow(undefined, 'client')).toBeNull();
  });
});

describe('buildColumnDefs', () => {
  const defs = buildColumnDefs(columns, { statut: [] });

  it('génère une colonne par ColumnDTO, dans l’ordre des positions', () => {
    expect(defs.map((def) => def.colId)).toEqual([
      'impe',
      'client',
      'porta_commentaires',
      'statut',
      'infos_facturation',
    ]);
    expect(defs.map((def) => def.headerName)).toEqual([
      'IMPE',
      'CLIENT',
      'PORTA ET COMMENTAIRES IMPORTANT',
      'INSTALLATION',
      'INFOS FACTURATION',
    ]);
  });

  it('reprend largeur, visibilité, redimensionnement et déplacement', () => {
    expect(defs[1].width).toBe(220);
    expect(defs[1].resizable).toBe(true);
    expect(defs[1].suppressMovable).toBe(false);
    expect(defs[1].editable).toBe(true);
    expect(defs[4].hide).toBe(true);
    expect(defs[0].hide).toBe(false);
  });

  it('active la poignée de drag sur la première colonne uniquement', () => {
    expect(defs[0].rowDrag).toBe(true);
    expect(defs[1].rowDrag).toBeUndefined();
  });

  it('lit la valeur dans data.<key> via valueGetter', () => {
    const getter = defs[1].valueGetter as (params: { data?: RowDTO }) => unknown;
    expect(getter({ data: row })).toBe('ARCADIA');
    expect(getter({ data: undefined })).toBeNull();
  });

  it('écrit dans data.<key> via valueSetter, en normalisant', () => {
    const target: RowDTO = { ...row, data: { ...row.data } };
    const setter = defs[1].valueSetter as (params: {
      data: RowDTO;
      newValue: unknown;
    }) => boolean;
    expect(setter({ data: target, newValue: '  NEO  ' })).toBe(true);
    expect(target.data.client).toBe('NEO');
  });

  it('formate les dates en JJ/MM/AAAA', () => {
    const formatter = defs[0].valueFormatter as (params: { value: unknown }) => string;
    expect(formatter({ value: '2026-08-14' })).toBe('14/08/2026');
  });

  it('utilise l’éditeur popup natif pour le texte long', () => {
    expect(defs[2].cellEditor).toBe('agLargeTextCellEditor');
    expect(defs[2].cellEditorPopup).toBe(true);
  });

  it('branche renderer et éditeur maison sur les colonnes liste', () => {
    expect(typeof defs[3].cellRenderer).toBe('function');
    expect(typeof defs[3].cellEditor).toBe('function');
    expect(defs[3].cellEditorPopup).toBe(true);
    const params = defs[3].cellRendererParams as { choices: unknown[] };
    expect(params.choices).toEqual([]);
  });

  it('applique le surlignage manuel via cellStyle', () => {
    const cellStyle = defs[1].cellStyle as (params: { data?: RowDTO }) => unknown;
    expect(cellStyle({ data: row })).toEqual({ backgroundColor: '#FFFF00' });
  });
});
```

- [ ] **Étape 6: lancer le test (échec attendu)**

```bash
pnpm --filter @suivi/web test -- src/components/grid/columnDefs.spec.ts
```

Attendu : **FAIL** — `Failed to resolve import "./columnDefs"`.

- [ ] **Étape 7: implémenter `columnDefs.ts`**

Créer `apps/web/src/components/grid/columnDefs.ts` :

```ts
import type {
  CellClassParams,
  ColDef,
  ValueFormatterParams,
  ValueGetterParams,
  ValueSetterParams,
} from 'ag-grid-community';
import type {
  CellValue,
  ChoiceDTO,
  ColumnDTO,
  ColumnType,
  RowDTO,
} from '@suivi/shared';
import { SelectCellEditor } from './SelectCellEditor';
import { SelectCellRenderer } from './SelectCellRenderer';
import { DateCellEditor } from './DateCellEditor';

/** `2026-08-14` (ou son ISO complet) → `14/08/2026`. Sinon, valeur brute. */
export function formatDateFr(value: CellValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return text;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Normalise ce que l'éditeur renvoie avant de l'écrire dans `Row.data`.
 * Les codes (« 02100 », « 2A ») restent du texte : seul le type NUMBER convertit.
 */
export function normalizeCellValue(type: ColumnType, raw: unknown): CellValue {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return type === 'NUMBER' ? raw : String(raw);
  const text = String(raw).trim();
  if (text === '') return null;
  if (type === 'NUMBER') {
    const parsed = Number(text.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return text;
}

export function cellStyleForRow(
  row: RowDTO | undefined,
  key: string,
): { backgroundColor: string } | null {
  const background = row?.formats?.[key]?.bg;
  return background ? { backgroundColor: background } : null;
}

export function buildColumnDefs(
  columns: ColumnDTO[],
  choicesByColumnKey: Record<string, ChoiceDTO[]>,
): ColDef<RowDTO>[] {
  const ordered = [...columns].sort((a, b) => a.position - b.position);

  return ordered.map((column, index) => {
    const key = column.key;
    const choices = choicesByColumnKey[key] ?? [];

    const def: ColDef<RowDTO> = {
      colId: key,
      headerName: column.label,
      width: column.width,
      hide: !column.visible,
      resizable: true,
      suppressMovable: false,
      editable: true,
      sortable: false,
      valueGetter: (params: ValueGetterParams<RowDTO>) =>
        params.data ? (params.data.data[key] ?? null) : null,
      valueSetter: (params: ValueSetterParams<RowDTO>) => {
        if (!params.data) return false;
        params.data.data[key] = normalizeCellValue(column.type, params.newValue);
        return true;
      },
      cellStyle: (params: CellClassParams<RowDTO>) =>
        cellStyleForRow(params.data, key),
    };

    // La poignée de réordonnancement vit sur la première colonne du tableau.
    if (index === 0) {
      def.rowDrag = true;
    }

    if (column.type === 'SELECT') {
      def.cellRenderer = SelectCellRenderer;
      def.cellRendererParams = { choices };
      def.cellEditor = SelectCellEditor;
      def.cellEditorParams = { choices };
      def.cellEditorPopup = true;
    } else if (column.type === 'LONGTEXT') {
      def.cellEditor = 'agLargeTextCellEditor';
      def.cellEditorPopup = true;
      def.cellEditorParams = { maxLength: 5000, rows: 10, cols: 60 };
      def.tooltipValueGetter = (params: { value: CellValue }) =>
        params.value === null ? '' : String(params.value);
    } else if (column.type === 'DATE') {
      def.cellEditor = DateCellEditor;
      def.valueFormatter = (params: ValueFormatterParams<RowDTO, CellValue>) =>
        formatDateFr(params.value ?? null);
    } else if (column.type === 'NUMBER') {
      def.cellEditor = 'agNumberCellEditor';
    } else {
      def.cellEditor = 'agTextCellEditor';
    }

    return def;
  });
}
```

- [ ] **Étape 8: relancer le test**

```bash
pnpm --filter @suivi/web test -- src/components/grid/columnDefs.spec.ts
```

Attendu : **PASS** — 13 tests verts.

- [ ] **Étape 9: commit**

```bash
git add apps/web/src/components/grid/DateCellEditor.tsx apps/web/src/components/grid/DateCellEditor.spec.tsx apps/web/src/components/grid/columnDefs.ts apps/web/src/components/grid/columnDefs.spec.ts && git commit -m "feat: editeur de date et generation des colonnes AG Grid depuis ColumnDTO"
```

> À vérifier à l'exécution : les noms `tooltipValueGetter` et `agLargeTextCellEditor` en AG Grid Community v34 (le tooltip demande `tooltipShowDelay` au niveau de la grille pour s'afficher). Si `tooltipValueGetter` n'est pas typé comme attendu, retirer cette ligne : elle n'est pas fonctionnellement requise.

---

### Task 6.5: `cellCommit.ts` — édition optimiste, conflit 409 et échec réseau

**Files:**
- Create: `apps/web/src/components/grid/cellCommit.ts`
- Test: `apps/web/src/components/grid/cellCommit.spec.ts`

**Interfaces:**
- Consomme : `ApiRequestError`, `patchRow` (Task 6.2) ; `applyRowPatch`, `showToast` du store (Task 6.1) ; `RowDTO`, `CellValue`, `CellFormat`.
- Produit :
  - `export interface CommitDeps { patchRow: (id: string, body: { expectedVersion: number; patch?: Record<string, CellValue>; formats?: Record<string, CellFormat | null> }) => Promise<RowDTO>; applyRowPatch: (rowId: string, changes: { patch?: Record<string, CellValue>; formats?: Record<string, CellFormat | null>; version?: number }) => void; reload: () => Promise<void>; showToast: (message: string, kind: 'error' | 'info') => void }`
  - `export function messageForError(error: unknown): string`
  - `export async function commitCellEdit(row: RowDTO, colKey: string, value: CellValue, deps: CommitDeps): Promise<void>`
  - `export async function commitHighlight(row: RowDTO, colKey: string, color: string | null, deps: CommitDeps): Promise<void>`

- [ ] **Étape 1: écrire le test (échec attendu)**

Créer `apps/web/src/components/grid/cellCommit.spec.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import type { RowDTO } from '@suivi/shared';
import { ApiRequestError } from '../../lib/api';
import { commitCellEdit, commitHighlight, messageForError } from './cellCommit';

const row: RowDTO = {
  id: 'row-1',
  month: '2026-08',
  position: 0,
  data: { client: 'ARCADIA', statut: 'NEW' },
  formats: {},
  version: 3,
  archived: false,
  updatedAt: '2026-08-10T10:00:00.000Z',
};

function deps(patchRow: ReturnType<typeof vi.fn>) {
  return {
    patchRow,
    applyRowPatch: vi.fn(),
    reload: vi.fn(async () => undefined),
    showToast: vi.fn(),
  };
}

describe('commitCellEdit', () => {
  it('applique la valeur optimiste puis la réponse serveur', async () => {
    const server: RowDTO = { ...row, data: { ...row.data, client: 'NEO' }, version: 4 };
    const patchRow = vi.fn(async () => server);
    const d = deps(patchRow);

    await commitCellEdit(row, 'client', 'NEO', d);

    expect(d.applyRowPatch).toHaveBeenNthCalledWith(1, 'row-1', {
      patch: { client: 'NEO' },
    });
    expect(patchRow).toHaveBeenCalledWith('row-1', {
      expectedVersion: 3,
      patch: { client: 'NEO' },
    });
    expect(d.applyRowPatch).toHaveBeenNthCalledWith(2, 'row-1', {
      patch: server.data,
      version: 4,
    });
    expect(d.showToast).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('sur 409 VERSION_CONFLICT : toast explicite + rechargement du mois', async () => {
    const patchRow = vi.fn(async () => {
      throw new ApiRequestError('VERSION_CONFLICT', 'Conflit.', 409, {
        conflictKeys: ['client'],
      });
    });
    const d = deps(patchRow);

    await commitCellEdit(row, 'client', 'NEO', d);

    expect(d.showToast).toHaveBeenCalledWith(
      'Cette ligne a été modifiée par un collègue entre-temps. Le tableau a été rechargé avec la valeur à jour.',
      'error',
    );
    expect(d.reload).toHaveBeenCalledTimes(1);
  });

  it('sur 404 NOT_FOUND : message dédié + rechargement', async () => {
    const patchRow = vi.fn(async () => {
      throw new ApiRequestError('NOT_FOUND', 'Ligne introuvable.', 404);
    });
    const d = deps(patchRow);

    await commitCellEdit(row, 'client', 'NEO', d);

    expect(d.showToast).toHaveBeenCalledWith(
      "Cette ligne n'existe plus : elle a été supprimée par un collègue.",
      'error',
    );
    expect(d.reload).toHaveBeenCalledTimes(1);
  });

  it('sur 401 AUTH_REQUIRED : message de session expirée', async () => {
    const patchRow = vi.fn(async () => {
      throw new ApiRequestError('AUTH_REQUIRED', 'Authentification requise.', 401);
    });
    const d = deps(patchRow);

    await commitCellEdit(row, 'client', 'NEO', d);

    expect(d.showToast).toHaveBeenCalledWith(
      'Votre session a expiré. Reconnectez-vous pour continuer.',
      'error',
    );
  });

  it('sur 422 VALIDATION_FAILED : le message de l’API est repris tel quel', async () => {
    const patchRow = vi.fn(async () => {
      throw new ApiRequestError('VALIDATION_FAILED', 'Valeur refusée : date invalide.', 422);
    });
    const d = deps(patchRow);

    await commitCellEdit(row, 'impe', 'pas-une-date', d);

    expect(d.showToast).toHaveBeenCalledWith(
      'Valeur refusée : date invalide.',
      'error',
    );
  });

  it('sur panne réseau : message générique + rechargement', async () => {
    const patchRow = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const d = deps(patchRow);

    await commitCellEdit(row, 'client', 'NEO', d);

    expect(d.showToast).toHaveBeenCalledWith(
      "Le serveur est injoignable : la modification n'a pas été enregistrée.",
      'error',
    );
    expect(d.reload).toHaveBeenCalledTimes(1);
  });
});

describe('commitHighlight', () => {
  it('envoie un format de fond et l’applique optimistement', async () => {
    const server: RowDTO = {
      ...row,
      formats: { num_chrono: { bg: '#9BDEB4' } },
      version: 4,
    };
    const patchRow = vi.fn(async () => server);
    const d = deps(patchRow);

    await commitHighlight(row, 'num_chrono', '#9BDEB4', d);

    expect(patchRow).toHaveBeenCalledWith('row-1', {
      expectedVersion: 3,
      formats: { num_chrono: { bg: '#9BDEB4' } },
    });
    expect(d.applyRowPatch).toHaveBeenNthCalledWith(2, 'row-1', {
      formats: server.formats,
      version: 4,
    });
  });

  it('envoie null pour effacer le surlignage', async () => {
    const patchRow = vi.fn(async () => ({ ...row, formats: {}, version: 4 }));
    const d = deps(patchRow);

    await commitHighlight(row, 'num_chrono', null, d);

    expect(patchRow).toHaveBeenCalledWith('row-1', {
      expectedVersion: 3,
      formats: { num_chrono: null },
    });
  });
});

describe('messageForError', () => {
  it('rend un message français pour une erreur inconnue', () => {
    expect(messageForError(new Error('boom'))).toBe(
      "Le serveur est injoignable : la modification n'a pas été enregistrée.",
    );
  });
});
```

- [ ] **Étape 2: lancer le test (échec attendu)**

```bash
pnpm --filter @suivi/web test -- src/components/grid/cellCommit.spec.ts
```

Attendu : **FAIL** — `Failed to resolve import "./cellCommit"`.

- [ ] **Étape 3: implémenter `cellCommit.ts`**

Créer `apps/web/src/components/grid/cellCommit.ts` :

```ts
import type { CellFormat, CellValue, RowDTO } from '@suivi/shared';
import { ApiRequestError } from '../../lib/api';

export interface CommitDeps {
  patchRow: (
    id: string,
    body: {
      expectedVersion: number;
      patch?: Record<string, CellValue>;
      formats?: Record<string, CellFormat | null>;
    },
  ) => Promise<RowDTO>;
  applyRowPatch: (
    rowId: string,
    changes: {
      patch?: Record<string, CellValue>;
      formats?: Record<string, CellFormat | null>;
      version?: number;
    },
  ) => void;
  reload: () => Promise<void>;
  showToast: (message: string, kind: 'error' | 'info') => void;
}

export function messageForError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === 'VERSION_CONFLICT') {
      return 'Cette ligne a été modifiée par un collègue entre-temps. Le tableau a été rechargé avec la valeur à jour.';
    }
    if (error.code === 'NOT_FOUND') {
      return "Cette ligne n'existe plus : elle a été supprimée par un collègue.";
    }
    if (error.code === 'AUTH_REQUIRED') {
      return 'Votre session a expiré. Reconnectez-vous pour continuer.';
    }
    return error.message;
  }
  return "Le serveur est injoignable : la modification n'a pas été enregistrée.";
}

export async function commitCellEdit(
  row: RowDTO,
  colKey: string,
  value: CellValue,
  deps: CommitDeps,
): Promise<void> {
  // 1. Optimisme : la valeur saisie est visible immédiatement.
  deps.applyRowPatch(row.id, { patch: { [colKey]: value } });
  try {
    const updated = await deps.patchRow(row.id, {
      expectedVersion: row.version,
      patch: { [colKey]: value },
    });
    // 2. Vérité serveur : data fusionnée + nouvelle version.
    deps.applyRowPatch(row.id, { patch: updated.data, version: updated.version });
  } catch (error) {
    // 3. Échec : message français puis resynchronisation complète du mois.
    //    (Le rollback fin par clé arrive en Feature 7.)
    deps.showToast(messageForError(error), 'error');
    await deps.reload();
  }
}

export async function commitHighlight(
  row: RowDTO,
  colKey: string,
  color: string | null,
  deps: CommitDeps,
): Promise<void> {
  const formats: Record<string, CellFormat | null> = {
    [colKey]: color === null ? null : { bg: color },
  };
  deps.applyRowPatch(row.id, { formats });
  try {
    const updated = await deps.patchRow(row.id, {
      expectedVersion: row.version,
      formats,
    });
    deps.applyRowPatch(row.id, {
      formats: updated.formats,
      version: updated.version,
    });
  } catch (error) {
    deps.showToast(messageForError(error), 'error');
    await deps.reload();
  }
}
```

- [ ] **Étape 4: relancer le test**

```bash
pnpm --filter @suivi/web test -- src/components/grid/cellCommit.spec.ts
```

Attendu : **PASS** — 9 tests verts (un par code d'erreur du périmètre : `VERSION_CONFLICT`, `NOT_FOUND`, `AUTH_REQUIRED`, `VALIDATION_FAILED`, plus la panne réseau).

- [ ] **Étape 5: commit**

```bash
git add apps/web/src/components/grid/cellCommit.ts apps/web/src/components/grid/cellCommit.spec.ts && git commit -m "feat: commit optimiste des cellules avec gestion des conflits 409"
```

Note : `applyRowPatch` remplace `formats` clé par clé (`null` = suppression), donc renvoyer `updated.formats` en bloc après succès ne réintroduit jamais une clé effacée.

---

### Task 6.6: `MonthTabs.tsx` — onglets de mois façon tableur

**Files:**
- Create: `apps/web/src/components/grid/MonthTabs.tsx`
- Test: `apps/web/src/components/grid/MonthTabs.spec.tsx`

**Interfaces:**
- Consomme : `MonthInfo` (`@suivi/shared`), `GET /api/months` (appelée par les pages, Task 6.9).
- Produit :
  - `export function nextMonth(month: string): string` — `'2026-12'` → `'2027-01'`
  - `export function latestMonth(months: MonthInfo[], today?: Date): string`
  - `export function formatMonthLabel(month: string): string` — `'2026-08'` → `'AOUT 2026'`
  - `export interface MonthTabsProps { months: MonthInfo[]; current: string; onSelect: (month: string) => void; onCreate: (month: string) => void; onOpenArchives: () => void }`
  - `export function MonthTabs(props: MonthTabsProps): React.JSX.Element`
  - Attributs de test : `data-testid="month-tab-<YYYY-MM>"`, `data-testid="month-add"`, `data-testid="month-archives"`.

- [ ] **Étape 1: écrire le test (échec attendu)**

Créer `apps/web/src/components/grid/MonthTabs.spec.tsx` :

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MonthInfo } from '@suivi/shared';
import {
  MonthTabs,
  formatMonthLabel,
  latestMonth,
  nextMonth,
} from './MonthTabs';

const months: MonthInfo[] = [
  { month: '2026-07', count: 42 },
  { month: '2026-08', count: 17 },
];

describe('helpers de mois', () => {
  it('nextMonth passe au mois suivant et change d’année en décembre', () => {
    expect(nextMonth('2026-08')).toBe('2026-09');
    expect(nextMonth('2026-12')).toBe('2027-01');
  });

  it('latestMonth rend le mois le plus récent, ou le mois courant si la liste est vide', () => {
    expect(latestMonth(months)).toBe('2026-08');
    expect(latestMonth([], new Date('2026-03-15T12:00:00Z'))).toBe('2026-03');
  });

  it('formatMonthLabel rend le libellé des onglets Excel', () => {
    expect(formatMonthLabel('2026-08')).toBe('AOUT 2026');
    expect(formatMonthLabel('2027-01')).toBe('JANVIER 2027');
  });
});

describe('MonthTabs', () => {
  it('affiche un onglet par mois avec son compteur et marque le mois actif', () => {
    render(
      <MonthTabs
        months={months}
        current="2026-08"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onOpenArchives={vi.fn()}
      />,
    );
    expect(screen.getByTestId('month-tab-2026-07').textContent).toContain('JUILLET 2026');
    expect(screen.getByTestId('month-tab-2026-07').textContent).toContain('42');
    expect(screen.getByTestId('month-tab-2026-08').getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByTestId('month-tab-2026-07').getAttribute('aria-current')).toBeNull();
  });

  it('remonte le mois sélectionné', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <MonthTabs
        months={months}
        current="2026-08"
        onSelect={onSelect}
        onCreate={vi.fn()}
        onOpenArchives={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('month-tab-2026-07'));
    expect(onSelect).toHaveBeenCalledWith('2026-07');
  });

  it('le bouton + demande la création du mois suivant le plus récent', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <MonthTabs
        months={months}
        current="2026-07"
        onSelect={vi.fn()}
        onCreate={onCreate}
        onOpenArchives={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('month-add'));
    expect(onCreate).toHaveBeenCalledWith('2026-09');
  });

  it('donne accès aux archives', async () => {
    const user = userEvent.setup();
    const onOpenArchives = vi.fn();
    render(
      <MonthTabs
        months={months}
        current="2026-08"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onOpenArchives={onOpenArchives}
      />,
    );
    await user.click(screen.getByTestId('month-archives'));
    expect(onOpenArchives).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Étape 2: lancer le test (échec attendu)**

```bash
pnpm --filter @suivi/web test -- src/components/grid/MonthTabs.spec.tsx
```

Attendu : **FAIL** — `Failed to resolve import "./MonthTabs"`.

- [ ] **Étape 3: implémenter `MonthTabs.tsx`**

Créer `apps/web/src/components/grid/MonthTabs.tsx` :

```tsx
'use client';

import type { MonthInfo } from '@suivi/shared';

const MONTH_NAMES = [
  'JANVIER',
  'FEVRIER',
  'MARS',
  'AVRIL',
  'MAI',
  'JUIN',
  'JUILLET',
  'AOUT',
  'SEPTEMBRE',
  'OCTOBRE',
  'NOVEMBRE',
  'DECEMBRE',
];

export function nextMonth(month: string): string {
  const [year, index] = month.split('-').map((part) => Number(part));
  if (index >= 12) return `${year + 1}-01`;
  return `${year}-${String(index + 1).padStart(2, '0')}`;
}

export function latestMonth(months: MonthInfo[], today: Date = new Date()): string {
  if (months.length === 0) {
    return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return months.map((info) => info.month).sort().at(-1) as string;
}

/** `2026-08` → `AOUT 2026`, comme les onglets du classeur d'origine. */
export function formatMonthLabel(month: string): string {
  const [year, index] = month.split('-');
  const name = MONTH_NAMES[Number(index) - 1] ?? month;
  return `${name} ${year}`;
}

export interface MonthTabsProps {
  months: MonthInfo[];
  current: string;
  onSelect: (month: string) => void;
  onCreate: (month: string) => void;
  onOpenArchives: () => void;
}

export function MonthTabs({
  months,
  current,
  onSelect,
  onCreate,
  onOpenArchives,
}: MonthTabsProps) {
  const ordered = [...months].sort((a, b) => a.month.localeCompare(b.month));

  const tabStyle = (active: boolean): React.CSSProperties => ({
    border: '1px solid #D8DEE4',
    borderBottom: active ? '2px solid #2772A4' : '1px solid #D8DEE4',
    background: active ? '#FFFFFF' : '#EDF1F5',
    fontWeight: active ? 700 : 400,
    padding: '4px 10px',
    borderRadius: '4px 4px 0 0',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  return (
    <nav
      aria-label="Mois"
      style={{
        display: 'flex',
        gap: 4,
        alignItems: 'flex-end',
        overflowX: 'auto',
        padding: '6px 8px 0',
        borderTop: '1px solid #D8DEE4',
        background: '#F7F9FB',
      }}
    >
      {ordered.map((info) => {
        const active = info.month === current;
        return (
          <button
            key={info.month}
            type="button"
            data-testid={`month-tab-${info.month}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => onSelect(info.month)}
            style={tabStyle(active)}
          >
            {formatMonthLabel(info.month)}{' '}
            <span style={{ color: '#6B7785', fontWeight: 400 }}>({info.count})</span>
          </button>
        );
      })}

      <button
        type="button"
        data-testid="month-add"
        title="Créer le mois suivant"
        aria-label="Créer le mois suivant"
        onClick={() => onCreate(nextMonth(latestMonth(ordered)))}
        style={{ ...tabStyle(false), fontWeight: 700 }}
      >
        +
      </button>

      <button
        type="button"
        data-testid="month-archives"
        onClick={onOpenArchives}
        style={{ ...tabStyle(false), marginLeft: 'auto' }}
      >
        ARCHIVES
      </button>
    </nav>
  );
}
```

- [ ] **Étape 4: relancer le test**

```bash
pnpm --filter @suivi/web test -- src/components/grid/MonthTabs.spec.tsx
```

Attendu : **PASS** — 7 tests verts.

- [ ] **Étape 5: commit**

```bash
git add apps/web/src/components/grid/MonthTabs.tsx apps/web/src/components/grid/MonthTabs.spec.tsx && git commit -m "feat: onglets de mois avec creation du mois suivant"
```

---

### Task 6.7: `HighlightPalette.tsx`, `RowContextMenu.tsx` et `RowHistoryPanel.tsx`

**Files:**
- Create: `apps/web/src/components/grid/HighlightPalette.tsx`, `apps/web/src/components/grid/RowContextMenu.tsx`, `apps/web/src/components/grid/RowHistoryPanel.tsx`
- Test: `apps/web/src/components/grid/HighlightPalette.spec.tsx`, `apps/web/src/components/grid/RowContextMenu.spec.tsx`, `apps/web/src/components/grid/RowHistoryPanel.spec.tsx`

**Interfaces:**
- Consomme : `RowDTO`, `MonthInfo`, `RowEventDTO` ; `formatMonthLabel` (Task 6.6).
- Produit :
  - `export const HIGHLIGHT_COLORS: { label: string; value: string }[]` — rouge `#FF0000`, jaune `#FFFF00`, vert `#9BDEB4`, bleu `#85C1E9`, violet `#C39BD3`
  - `export interface HighlightPaletteProps { onPick: (color: string | null) => void }`
  - `export function HighlightPalette(props: HighlightPaletteProps): React.JSX.Element`
  - `export interface RowContextMenuProps { row: RowDTO; colKey: string; months: MonthInfo[]; x: number; y: number; onClose: () => void; onInsertAbove: () => void; onInsertBelow: () => void; onMoveToMonth: (month: string) => void; onToggleArchive: () => void; onDelete: () => void; onShowHistory: () => void; onHighlight: (color: string | null) => void }`
  - `export function RowContextMenu(props: RowContextMenuProps): React.JSX.Element`
  - `export interface RowHistoryPanelProps { events: RowEventDTO[]; loading: boolean; onClose: () => void }`
  - `export function RowHistoryPanel(props: RowHistoryPanelProps): React.JSX.Element`

- [ ] **Étape 1: écrire le test de la palette (échec attendu)**

Créer `apps/web/src/components/grid/HighlightPalette.spec.tsx` :

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HIGHLIGHT_COLORS, HighlightPalette } from './HighlightPalette';

describe('HighlightPalette', () => {
  it('expose les cinq couleurs de la spec', () => {
    expect(HIGHLIGHT_COLORS.map((color) => color.value)).toEqual([
      '#FF0000',
      '#FFFF00',
      '#9BDEB4',
      '#85C1E9',
      '#C39BD3',
    ]);
  });

  it('remonte la couleur choisie', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<HighlightPalette onPick={onPick} />);
    await user.click(screen.getByTestId('highlight-#9BDEB4'));
    expect(onPick).toHaveBeenCalledWith('#9BDEB4');
  });

  it('remonte null pour « Effacer »', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<HighlightPalette onPick={onPick} />);
    await user.click(screen.getByTestId('highlight-clear'));
    expect(onPick).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Étape 2: lancer le test (échec attendu)**

```bash
pnpm --filter @suivi/web test -- src/components/grid/HighlightPalette.spec.tsx
```

Attendu : **FAIL** — `Failed to resolve import "./HighlightPalette"`.

- [ ] **Étape 3: implémenter la palette**

Créer `apps/web/src/components/grid/HighlightPalette.tsx` :

```tsx
'use client';

export const HIGHLIGHT_COLORS: { label: string; value: string }[] = [
  { label: 'Rouge', value: '#FF0000' },
  { label: 'Jaune', value: '#FFFF00' },
  { label: 'Vert', value: '#9BDEB4' },
  { label: 'Bleu', value: '#85C1E9' },
  { label: 'Violet', value: '#C39BD3' },
];

export interface HighlightPaletteProps {
  onPick: (color: string | null) => void;
}

export function HighlightPalette({ onPick }: HighlightPaletteProps) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 8px' }}>
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color.value}
          type="button"
          data-testid={`highlight-${color.value}`}
          title={color.label}
          aria-label={`Surligner en ${color.label.toLowerCase()}`}
          onClick={() => onPick(color.value)}
          style={{
            width: 18,
            height: 18,
            borderRadius: 3,
            border: '1px solid #99A3AD',
            background: color.value,
            cursor: 'pointer',
          }}
        />
      ))}
      <button
        type="button"
        data-testid="highlight-clear"
        onClick={() => onPick(null)}
        style={{
          border: '1px solid #99A3AD',
          borderRadius: 3,
          background: '#FFFFFF',
          cursor: 'pointer',
          fontSize: 12,
          padding: '1px 6px',
        }}
      >
        Effacer
      </button>
    </div>
  );
}
```

- [ ] **Étape 4: relancer le test de la palette**

```bash
pnpm --filter @suivi/web test -- src/components/grid/HighlightPalette.spec.tsx
```

Attendu : **PASS** — 3 tests verts.

- [ ] **Étape 5: écrire le test du menu contextuel (échec attendu)**

Créer `apps/web/src/components/grid/RowContextMenu.spec.tsx` :

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MonthInfo, RowDTO } from '@suivi/shared';
import { RowContextMenu } from './RowContextMenu';

const row: RowDTO = {
  id: 'row-1',
  month: '2026-08',
  position: 3,
  data: { client: 'ARCADIA' },
  formats: {},
  version: 1,
  archived: false,
  updatedAt: '2026-08-10T10:00:00.000Z',
};

const months: MonthInfo[] = [
  { month: '2026-08', count: 10 },
  { month: '2026-09', count: 2 },
];

function setup(overrides: Partial<React.ComponentProps<typeof RowContextMenu>> = {}) {
  const props = {
    row,
    colKey: 'num_chrono',
    months,
    x: 100,
    y: 200,
    onClose: vi.fn(),
    onInsertAbove: vi.fn(),
    onInsertBelow: vi.fn(),
    onMoveToMonth: vi.fn(),
    onToggleArchive: vi.fn(),
    onDelete: vi.fn(),
    onShowHistory: vi.fn(),
    onHighlight: vi.fn(),
    ...overrides,
  };
  render(<RowContextMenu {...props} />);
  return props;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RowContextMenu', () => {
  it('propose l’insertion au-dessus et en-dessous', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByTestId('menu-insert-above'));
    expect(props.onInsertAbove).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('menu-insert-below'));
    expect(props.onInsertBelow).toHaveBeenCalledTimes(1);
  });

  it('ouvre le sous-menu des mois et exclut le mois courant de la ligne', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByTestId('menu-move'));
    expect(screen.queryByTestId('menu-move-2026-08')).toBeNull();
    await user.click(screen.getByTestId('menu-move-2026-09'));
    expect(props.onMoveToMonth).toHaveBeenCalledWith('2026-09');
  });

  it('archive une ligne active, désarchive une ligne archivée', async () => {
    const user = userEvent.setup();
    const props = setup();
    expect(screen.getByTestId('menu-archive').textContent).toBe('Archiver');
    await user.click(screen.getByTestId('menu-archive'));
    expect(props.onToggleArchive).toHaveBeenCalledTimes(1);
  });

  it('affiche « Désarchiver » pour une ligne archivée', () => {
    setup({ row: { ...row, archived: true } });
    expect(screen.getByTestId('menu-archive').textContent).toBe('Désarchiver');
  });

  it('demande confirmation en français avant de supprimer', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const props = setup();
    await user.click(screen.getByTestId('menu-delete'));
    expect(confirmSpy).toHaveBeenCalledWith(
      'Supprimer définitivement cette ligne ? Cette action est irréversible.',
    );
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it('ne supprime rien si la confirmation est refusée', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const props = setup();
    await user.click(screen.getByTestId('menu-delete'));
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it('ouvre l’historique et remonte un surlignage', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByTestId('menu-history'));
    expect(props.onShowHistory).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('highlight-#FFFF00'));
    expect(props.onHighlight).toHaveBeenCalledWith('#FFFF00');
  });

  it('se ferme sur Échap', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Étape 6: lancer le test (échec attendu)**

```bash
pnpm --filter @suivi/web test -- src/components/grid/RowContextMenu.spec.tsx
```

Attendu : **FAIL** — `Failed to resolve import "./RowContextMenu"`.

- [ ] **Étape 7: implémenter le menu contextuel**

Créer `apps/web/src/components/grid/RowContextMenu.tsx` :

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { MonthInfo, RowDTO } from '@suivi/shared';
import { HighlightPalette } from './HighlightPalette';
import { formatMonthLabel } from './MonthTabs';

export interface RowContextMenuProps {
  row: RowDTO;
  /** Colonne sous le curseur : c'est elle que le surlignage cible. */
  colKey: string;
  months: MonthInfo[];
  x: number;
  y: number;
  onClose: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onMoveToMonth: (month: string) => void;
  onToggleArchive: () => void;
  onDelete: () => void;
  onShowHistory: () => void;
  onHighlight: (color: string | null) => void;
}

const itemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: '5px 10px',
  font: 'inherit',
};

export function RowContextMenu({
  row,
  colKey,
  months,
  x,
  y,
  onClose,
  onInsertAbove,
  onInsertBelow,
  onMoveToMonth,
  onToggleArchive,
  onDelete,
  onShowHistory,
  onHighlight,
}: RowContextMenuProps) {
  const [moveOpen, setMoveOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function run(action: () => void): void {
    action();
    onClose();
  }

  function askDelete(): void {
    const confirmed = window.confirm(
      'Supprimer définitivement cette ligne ? Cette action est irréversible.',
    );
    if (!confirmed) return;
    run(onDelete);
  }

  return (
    <div
      role="menu"
      data-testid="row-context-menu"
      aria-label={`Actions sur la ligne ${row.position + 1}`}
      style={{
        position: 'fixed',
        top: y,
        left: x,
        zIndex: 1000,
        minWidth: 230,
        background: '#FFFFFF',
        border: '1px solid #D8DEE4',
        borderRadius: 4,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        padding: '4px 0',
        fontSize: 13,
      }}
    >
      <button type="button" data-testid="menu-insert-above" style={itemStyle} onClick={() => run(onInsertAbove)}>
        Insérer une ligne au-dessus
      </button>
      <button type="button" data-testid="menu-insert-below" style={itemStyle} onClick={() => run(onInsertBelow)}>
        Insérer une ligne en-dessous
      </button>

      <hr style={{ border: 0, borderTop: '1px solid #EDF1F5', margin: '4px 0' }} />

      <button
        type="button"
        data-testid="menu-move"
        aria-expanded={moveOpen}
        style={itemStyle}
        onClick={() => setMoveOpen((open) => !open)}
      >
        Déplacer vers un autre mois ▸
      </button>
      {moveOpen ? (
        <div style={{ paddingLeft: 12 }}>
          {months
            .filter((info) => info.month !== row.month)
            .map((info) => (
              <button
                key={info.month}
                type="button"
                data-testid={`menu-move-${info.month}`}
                style={itemStyle}
                onClick={() => run(() => onMoveToMonth(info.month))}
              >
                {formatMonthLabel(info.month)}
              </button>
            ))}
        </div>
      ) : null}

      <button type="button" data-testid="menu-archive" style={itemStyle} onClick={() => run(onToggleArchive)}>
        {row.archived ? 'Désarchiver' : 'Archiver'}
      </button>
      <button type="button" data-testid="menu-history" style={itemStyle} onClick={() => run(onShowHistory)}>
        Historique de la ligne
      </button>
      <button
        type="button"
        data-testid="menu-delete"
        style={{ ...itemStyle, color: '#C0392B' }}
        onClick={askDelete}
      >
        Supprimer la ligne
      </button>

      <hr style={{ border: 0, borderTop: '1px solid #EDF1F5', margin: '4px 0' }} />

      <div style={{ padding: '2px 10px 0', color: '#6B7785', fontSize: 12 }}>
        Surligner la colonne « {colKey} »
      </div>
      <HighlightPalette onPick={(color) => run(() => onHighlight(color))} />
    </div>
  );
}
```

- [ ] **Étape 8: relancer le test du menu**

```bash
pnpm --filter @suivi/web test -- src/components/grid/RowContextMenu.spec.tsx
```

Attendu : **PASS** — 8 tests verts.

- [ ] **Étape 9: écrire le test du panneau d'historique (échec attendu)**

Créer `apps/web/src/components/grid/RowHistoryPanel.spec.tsx` :

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RowEventDTO } from '@suivi/shared';
import { RowHistoryPanel } from './RowHistoryPanel';

const events: RowEventDTO[] = [
  {
    id: 'ev-2',
    rowId: 'row-1',
    userId: 'u-1',
    userName: 'Quentin',
    at: '2026-08-10T10:05:00.000Z',
    type: 'update',
    payload: { statut: { from: 'NEW', to: 'INSTALLATION' } },
  },
  {
    id: 'ev-1',
    rowId: 'row-1',
    userId: 'u-2',
    userName: 'Laurent',
    at: '2026-08-10T09:00:00.000Z',
    type: 'create',
    payload: {},
  },
];

describe('RowHistoryPanel', () => {
  it('affiche un état de chargement', () => {
    render(<RowHistoryPanel events={[]} loading onClose={vi.fn()} />);
    expect(screen.getByTestId('history-loading').textContent).toBe('Chargement…');
  });

  it('traduit les types d’événement et nomme l’auteur', () => {
    render(<RowHistoryPanel events={events} loading={false} onClose={vi.fn()} />);
    const types = screen.getAllByTestId('history-type').map((node) => node.textContent);
    expect(types).toEqual(['Modification', 'Création']);
    expect(screen.getAllByTestId('history-author')[0].textContent).toBe('Quentin');
  });

  it('indique quand il n’y a aucun événement', () => {
    render(<RowHistoryPanel events={[]} loading={false} onClose={vi.fn()} />);
    expect(screen.getByTestId('history-empty').textContent).toBe(
      'Aucun événement pour cette ligne.',
    );
  });

  it('se ferme au clic sur le bouton de fermeture', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RowHistoryPanel events={events} loading={false} onClose={onClose} />);
    await user.click(screen.getByTestId('history-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Étape 10: lancer le test (échec attendu)**

```bash
pnpm --filter @suivi/web test -- src/components/grid/RowHistoryPanel.spec.tsx
```

Attendu : **FAIL** — `Failed to resolve import "./RowHistoryPanel"`.

- [ ] **Étape 11: implémenter le panneau d'historique**

Créer `apps/web/src/components/grid/RowHistoryPanel.tsx` :

```tsx
'use client';

import type { RowEventDTO } from '@suivi/shared';

const TYPE_LABELS: Record<RowEventDTO['type'], string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  move: 'Déplacement',
  archive: 'Archivage',
  format: 'Surlignage',
};

export interface RowHistoryPanelProps {
  events: RowEventDTO[];
  loading: boolean;
  onClose: () => void;
}

export function RowHistoryPanel({ events, loading, onClose }: RowHistoryPanelProps) {
  return (
    <aside
      data-testid="history-panel"
      aria-label="Historique de la ligne"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 340,
        zIndex: 1100,
        background: '#FFFFFF',
        borderLeft: '1px solid #D8DEE4',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
        display: 'flex',
        flexDirection: 'column',
        fontSize: 13,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid #EDF1F5',
          fontWeight: 700,
        }}
      >
        Historique de la ligne
        <button
          type="button"
          data-testid="history-close"
          aria-label="Fermer l’historique"
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16 }}
        >
          ×
        </button>
      </header>

      <div style={{ overflowY: 'auto', padding: '8px 12px' }}>
        {loading ? <p data-testid="history-loading">Chargement…</p> : null}

        {!loading && events.length === 0 ? (
          <p data-testid="history-empty">Aucun événement pour cette ligne.</p>
        ) : null}

        {!loading
          ? events.map((event) => (
              <article
                key={event.id}
                style={{ borderBottom: '1px solid #EDF1F5', padding: '6px 0' }}
              >
                <div>
                  <strong data-testid="history-type">{TYPE_LABELS[event.type]}</strong>{' '}
                  par <span data-testid="history-author">{event.userName}</span>
                </div>
                <div style={{ color: '#6B7785' }}>
                  {new Date(event.at).toLocaleString('fr-FR')}
                </div>
                <pre
                  style={{
                    margin: '4px 0 0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    background: '#F7F9FB',
                    padding: 6,
                    borderRadius: 3,
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </article>
            ))
          : null}
      </div>
    </aside>
  );
}
```

- [ ] **Étape 12: relancer les trois specs**

```bash
pnpm --filter @suivi/web test -- src/components/grid/HighlightPalette.spec.tsx src/components/grid/RowContextMenu.spec.tsx src/components/grid/RowHistoryPanel.spec.tsx
```

Attendu : **PASS** — 15 tests verts.

- [ ] **Étape 13: commit**

```bash
git add apps/web/src/components/grid/HighlightPalette.tsx apps/web/src/components/grid/HighlightPalette.spec.tsx apps/web/src/components/grid/RowContextMenu.tsx apps/web/src/components/grid/RowContextMenu.spec.tsx apps/web/src/components/grid/RowHistoryPanel.tsx apps/web/src/components/grid/RowHistoryPanel.spec.tsx && git commit -m "feat: menu contextuel de ligne, palette de surlignage et panneau historique"
```

---

### Task 6.8: `columnLayout.ts` (debounce) et `DataGrid.tsx` (grille AG Grid)

**Files:**
- Create: `apps/web/src/components/grid/columnLayout.ts`, `apps/web/src/components/grid/DataGrid.tsx`
- Test: `apps/web/src/components/grid/columnLayout.spec.ts` + compilation `next build`

**Interfaces:**
- Consomme : `useAppStore` (6.1), `api.*` (6.2), `buildColumnDefs` (6.4), `commitCellEdit` / `commitHighlight` (6.5), `RowContextMenu` (6.7), `RowHistoryPanel` (6.7), `ColumnDTO`, `RowDTO`, `RowEventDTO`.
- Produit :
  - `export function debounce<A extends unknown[]>(fn: (...args: A) => void, delayMs: number): ((...args: A) => void) & { cancel: () => void }`
  - `export function resolveColumnId(columns: ColumnDTO[], colKey: string | null | undefined): string | null`
  - `export const suiviTheme` — thème AG Grid quartz personnalisé clair
  - `export interface DataGridProps { reload: () => Promise<void> }`
  - `export function DataGrid(props: DataGridProps): React.JSX.Element` — consommé par les trois pages (Task 6.9) et par la Feature 7.

- [ ] **Étape 1: écrire le test des utilitaires de layout (échec attendu)**

Créer `apps/web/src/components/grid/columnLayout.spec.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ColumnDTO } from '@suivi/shared';
import { debounce, resolveColumnId } from './columnLayout';

const columns: ColumnDTO[] = [
  {
    id: 'col-client',
    key: 'client',
    label: 'CLIENT',
    type: 'TEXT',
    position: 0,
    width: 220,
    visible: true,
    choices: [],
  },
];

afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  it('n’appelle la fonction qu’une fois, après le délai, avec les derniers arguments', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 400);
    debounced('client', 200);
    debounced('client', 240);
    vi.advanceTimersByTime(399);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('client', 240);
  });

  it('cancel annule l’appel en attente', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 400);
    debounced('client', 200);
    debounced.cancel();
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('resolveColumnId', () => {
  it('retrouve l’identifiant de colonne depuis sa clé', () => {
    expect(resolveColumnId(columns, 'client')).toBe('col-client');
  });

  it('rend null pour une clé inconnue, vide ou absente', () => {
    expect(resolveColumnId(columns, 'inconnue')).toBeNull();
    expect(resolveColumnId(columns, null)).toBeNull();
    expect(resolveColumnId(columns, undefined)).toBeNull();
  });
});
```

- [ ] **Étape 2: lancer le test (échec attendu)**

```bash
pnpm --filter @suivi/web test -- src/components/grid/columnLayout.spec.ts
```

Attendu : **FAIL** — `Failed to resolve import "./columnLayout"`.

- [ ] **Étape 3: implémenter `columnLayout.ts`**

Créer `apps/web/src/components/grid/columnLayout.ts` :

```ts
import type { ColumnDTO } from '@suivi/shared';

/**
 * Regroupe les rafales d'événements AG Grid (drag de redimensionnement)
 * en un seul PATCH réseau.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): ((...args: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: A): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };

  debounced.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}

/** AG Grid raisonne en `colId` (= Column.key) ; l'API attend l'`id` (cuid). */
export function resolveColumnId(
  columns: ColumnDTO[],
  colKey: string | null | undefined,
): string | null {
  if (!colKey) return null;
  return columns.find((column) => column.key === colKey)?.id ?? null;
}
```

- [ ] **Étape 4: relancer le test**

```bash
pnpm --filter @suivi/web test -- src/components/grid/columnLayout.spec.ts
```

Attendu : **PASS** — 4 tests verts.

- [ ] **Étape 5: implémenter `DataGrid.tsx`**

Créer `apps/web/src/components/grid/DataGrid.tsx` :

```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type CellContextMenuEvent,
  type CellValueChangedEvent,
  type ColumnMovedEvent,
  type ColumnResizedEvent,
  type GetRowIdParams,
  type RowDragEndEvent,
} from 'ag-grid-community';
import type { CellValue, RowDTO, RowEventDTO } from '@suivi/shared';
import * as api from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { buildColumnDefs } from './columnDefs';
import { commitCellEdit, commitHighlight, messageForError } from './cellCommit';
import { debounce, resolveColumnId } from './columnLayout';
import { RowContextMenu } from './RowContextMenu';
import { RowHistoryPanel } from './RowHistoryPanel';

// AG Grid v33+ : les modules Community doivent être enregistrés explicitement.
ModuleRegistry.registerModules([AllCommunityModule]);

/** Thème quartz personnalisé, clair, proche du rendu du classeur d'origine. */
export const suiviTheme = themeQuartz.withParams({
  accentColor: '#2772A4',
  backgroundColor: '#FFFFFF',
  foregroundColor: '#1B1B1B',
  borderColor: '#D8DEE4',
  headerBackgroundColor: '#EDF1F5',
  headerTextColor: '#1B1B1B',
  headerFontWeight: 700,
  oddRowBackgroundColor: '#FBFCFD',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSize: 13,
  rowHeight: 28,
  headerHeight: 32,
  cellHorizontalPadding: 6,
});

interface MenuState {
  row: RowDTO;
  colKey: string;
  x: number;
  y: number;
}

export interface DataGridProps {
  /** Rechargement complet de la vue courante (mois ou archives). */
  reload: () => Promise<void>;
}

export function DataGrid({ reload }: DataGridProps) {
  const columns = useAppStore((state) => state.columns);
  const choicesByColumnKey = useAppStore((state) => state.choicesByColumnKey);
  const rows = useAppStore((state) => state.rows);
  const months = useAppStore((state) => state.months);
  const toast = useAppStore((state) => state.toast);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [events, setEvents] = useState<RowEventDTO[]>([]);

  const columnDefs = useMemo(
    () => buildColumnDefs(columns, choicesByColumnKey),
    [columns, choicesByColumnKey],
  );

  const deps = useMemo(
    () => ({
      patchRow: api.patchRow,
      applyRowPatch: useAppStore.getState().applyRowPatch,
      reload,
      showToast: useAppStore.getState().showToast,
    }),
    [reload],
  );

  // --- Toast : disparition automatique après 6 s ---------------------------
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => useAppStore.getState().hideToast(), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  // --- Persistance de la largeur et de l'ordre des colonnes ----------------
  const persistWidth = useRef(
    debounce((colKey: string, width: number) => {
      const id = resolveColumnId(useAppStore.getState().columns, colKey);
      if (!id) return;
      void api.patchColumn(id, { width }).catch((error: unknown) => {
        useAppStore.getState().showToast(messageForError(error), 'error');
      });
    }, 400),
  ).current;

  const persistPosition = useRef(
    debounce((colKey: string, position: number) => {
      const id = resolveColumnId(useAppStore.getState().columns, colKey);
      if (!id) return;
      void api
        .patchColumn(id, { position })
        .then((updated) => {
          const next = useAppStore
            .getState()
            .columns.map((column) => (column.id === updated.id ? updated : column));
          useAppStore.getState().setColumns(next);
        })
        .catch((error: unknown) => {
          useAppStore.getState().showToast(messageForError(error), 'error');
        });
    }, 400),
  ).current;

  useEffect(() => () => {
    persistWidth.cancel();
    persistPosition.cancel();
  }, [persistWidth, persistPosition]);

  const onColumnResized = useCallback(
    (event: ColumnResizedEvent<RowDTO>) => {
      if (!event.finished || !event.column) return;
      persistWidth(event.column.getColId(), Math.round(event.column.getActualWidth()));
    },
    [persistWidth],
  );

  const onColumnMoved = useCallback(
    (event: ColumnMovedEvent<RowDTO>) => {
      if (!event.finished || !event.column || event.toIndex === undefined) return;
      persistPosition(event.column.getColId(), event.toIndex);
    },
    [persistPosition],
  );

  // --- Édition d'une cellule ------------------------------------------------
  const onCellValueChanged = useCallback(
    (event: CellValueChangedEvent<RowDTO, CellValue>) => {
      const colKey = event.column.getColId();
      const row = useAppStore.getState().rows.find((item) => item.id === event.data.id);
      if (!row || !colKey) return;
      void commitCellEdit(row, colKey, event.data.data[colKey] ?? null, deps);
    },
    [deps],
  );

  // --- Réordonnancement par glisser-déposer --------------------------------
  const onRowDragEnd = useCallback(
    (event: RowDragEndEvent<RowDTO>) => {
      const row = event.node.data;
      if (!row) return;
      void api
        .moveRow(row.id, { position: event.overIndex })
        .then(() => reload())
        .catch((error: unknown) => {
          useAppStore.getState().showToast(messageForError(error), 'error');
          return reload();
        });
    },
    [reload],
  );

  // --- Menu contextuel ------------------------------------------------------
  const onCellContextMenu = useCallback((event: CellContextMenuEvent<RowDTO>) => {
    const mouse = event.event as MouseEvent | null;
    if (!event.data || !mouse) return;
    setMenu({
      row: event.data,
      colKey: event.column.getColId(),
      x: mouse.clientX,
      y: mouse.clientY,
    });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const runAction = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        await reload();
      } catch (error: unknown) {
        useAppStore.getState().showToast(messageForError(error), 'error');
        await reload();
      }
    },
    [reload],
  );

  async function openHistory(row: RowDTO): Promise<void> {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      setEvents(await api.getRowEvents(row.id));
    } catch (error: unknown) {
      useAppStore.getState().showToast(messageForError(error), 'error');
      setEvents([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div
      data-testid="data-grid"
      style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}
      onClick={() => setMenu(null)}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <AgGridReact<RowDTO>
          theme={suiviTheme}
          rowData={rows}
          columnDefs={columnDefs}
          getRowId={(params: GetRowIdParams<RowDTO>) => params.data.id}
          defaultColDef={{ resizable: true, editable: true, sortable: false }}
          singleClickEdit={false}
          stopEditingWhenCellsLoseFocus
          rowDragManaged
          preventDefaultOnContextMenu
          animateRows={false}
          onCellValueChanged={onCellValueChanged}
          onColumnResized={onColumnResized}
          onColumnMoved={onColumnMoved}
          onRowDragEnd={onRowDragEnd}
          onCellContextMenu={onCellContextMenu}
        />
      </div>

      {menu ? (
        <RowContextMenu
          row={menu.row}
          colKey={menu.colKey}
          months={months}
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          onInsertAbove={() =>
            void runAction(() =>
              api.createRow({ month: menu.row.month, position: menu.row.position }),
            )
          }
          onInsertBelow={() =>
            void runAction(() =>
              api.createRow({ month: menu.row.month, position: menu.row.position + 1 }),
            )
          }
          onMoveToMonth={(month) =>
            void runAction(() => api.moveRow(menu.row.id, { month }))
          }
          onToggleArchive={() =>
            void runAction(() => api.archiveRow(menu.row.id, !menu.row.archived))
          }
          onDelete={() => void runAction(() => api.deleteRow(menu.row.id))}
          onShowHistory={() => void openHistory(menu.row)}
          onHighlight={(color) =>
            void commitHighlight(menu.row, menu.colKey, color, deps)
          }
        />
      ) : null}

      {historyOpen ? (
        <RowHistoryPanel
          events={events}
          loading={historyLoading}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}

      {toast ? (
        <div
          data-testid="toast"
          role="status"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            zIndex: 1200,
            maxWidth: 420,
            padding: '10px 14px',
            borderRadius: 4,
            color: '#FFFFFF',
            background: toast.kind === 'error' ? '#C0392B' : '#2772A4',
            boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
            fontSize: 13,
          }}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
```

Points de conception :

- `getRowId` fait de `RowDTO.id` l'identité de ligne : AG Grid met à jour les lignes existantes au lieu de tout redessiner quand le store change (indispensable pour la diffusion temps réel de la Feature 7).
- `singleClickEdit={false}` : l'édition démarre au **double clic** ou par **F2/Entrée**, comme un tableur. La navigation clavier (flèches, Tab, Entrée) est celle d'AG Grid, non réimplémentée.
- Le `valueSetter` de `columnDefs.ts` a déjà écrit la valeur normalisée dans `event.data.data[colKey]` : `onCellValueChanged` relit cette valeur normalisée plutôt que `event.newValue` brut.
- `preventDefaultOnContextMenu` supprime le menu natif du navigateur au profit de `RowContextMenu`.

- [ ] **Étape 6: vérifier que le front compile**

```bash
pnpm --filter @suivi/web build
```

Attendu : **PASS** — build Next.js en succès (aucune erreur TypeScript). Si le build échoue sur la collision `app/page.tsx` / `app/(app)/page.tsx`, c'est normal : cette collision est traitée en Task 6.9, relancer ce build après.

- [ ] **Étape 7: commit**

```bash
git add apps/web/src/components/grid/columnLayout.ts apps/web/src/components/grid/columnLayout.spec.ts apps/web/src/components/grid/DataGrid.tsx && git commit -m "feat: grille AG Grid editable avec theme quartz et persistance des colonnes"
```

> À vérifier à l'exécution : (1) le nom exact des paramètres de `themeQuartz.withParams` en v34 (`headerFontWeight`, `cellHorizontalPadding`, `oddRowBackgroundColor`) — tout paramètre non reconnu déclenche une erreur console, il suffit alors de le retirer ; (2) la présence de `finished` sur `ColumnResizedEvent`/`ColumnMovedEvent` et de `toIndex` sur `ColumnMovedEvent` ; (3) que `toIndex` corresponde bien à l'index **toutes colonnes confondues** (colonnes masquées incluses) — si les colonnes masquées décalent l'index, recalculer la position depuis `event.api.getAllGridColumns()` avant l'appel à `patchColumn`.

---

### Task 6.9: `SearchBar`, `PresenceBar` et les trois pages (`/`, `/archives`, `/recherche`)

**Files:**
- Create: `apps/web/src/components/grid/SearchBar.tsx`, `apps/web/src/components/grid/PresenceBar.tsx`, `apps/web/src/app/(app)/page.tsx`, `apps/web/src/app/(app)/archives/page.tsx`, `apps/web/src/app/(app)/recherche/page.tsx`
- Delete: `apps/web/src/app/page.tsx`
- Test: `apps/web/src/components/grid/SearchBar.spec.tsx` + compilation `next build`

**Interfaces:**
- Consomme : `useAppStore` (6.1), `api.*` (6.2), `MonthTabs` + `formatMonthLabel` (6.6), `DataGrid` (6.8).
- Produit :
  - `export interface SearchBarProps { initialQuery?: string; onSubmit?: (q: string) => void }`
  - `export function SearchBar(props: SearchBarProps): React.JSX.Element`
  - `export function PresenceBar(): React.JSX.Element` — placeholder remplacé par la Feature 7
  - Trois pages App Router : `/`, `/archives`, `/recherche`.

- [ ] **Étape 1: écrire le test de la barre de recherche (échec attendu)**

Créer `apps/web/src/components/grid/SearchBar.spec.tsx` :

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchBar } from './SearchBar';

describe('SearchBar', () => {
  it('pré-remplit le champ avec la requête initiale', () => {
    render(<SearchBar initialQuery="ARCADIA" onSubmit={vi.fn()} />);
    expect((screen.getByTestId('search-input') as HTMLInputElement).value).toBe('ARCADIA');
  });

  it('remonte la requête à la validation du formulaire', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SearchBar onSubmit={onSubmit} />);
    await user.type(screen.getByTestId('search-input'), 'NEO{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('NEO');
  });

  it('ignore une recherche vide', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SearchBar onSubmit={onSubmit} />);
    await user.type(screen.getByTestId('search-input'), '   {Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Étape 2: lancer le test (échec attendu)**

```bash
pnpm --filter @suivi/web test -- src/components/grid/SearchBar.spec.tsx
```

Attendu : **FAIL** — `Failed to resolve import "./SearchBar"`.

- [ ] **Étape 3: implémenter `SearchBar.tsx` et `PresenceBar.tsx`**

Créer `apps/web/src/components/grid/SearchBar.tsx` :

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface SearchBarProps {
  initialQuery?: string;
  /** Injecté par les tests ; sinon la barre navigue vers /recherche?q=… */
  onSubmit?: (q: string) => void;
}

export function SearchBar({ initialQuery = '', onSubmit }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed === '') return;
    if (onSubmit) {
      onSubmit(trimmed);
      return;
    }
    router.push(`/recherche?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form role="search" onSubmit={submit} style={{ display: 'flex', gap: 6 }}>
      <input
        data-testid="search-input"
        type="search"
        aria-label="Rechercher dans tous les mois"
        placeholder="Rechercher (tous les mois + archives)…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        style={{
          width: 320,
          padding: '5px 8px',
          border: '1px solid #D8DEE4',
          borderRadius: 4,
          font: 'inherit',
        }}
      />
      <button
        type="submit"
        data-testid="search-submit"
        style={{
          padding: '5px 12px',
          border: '1px solid #2772A4',
          borderRadius: 4,
          background: '#2772A4',
          color: '#FFFFFF',
          cursor: 'pointer',
        }}
      >
        Rechercher
      </button>
    </form>
  );
}
```

Créer `apps/web/src/components/grid/PresenceBar.tsx` :

```tsx
'use client';

import { useAppStore } from '../../lib/store';

/**
 * Placeholder : affiche uniquement l'utilisateur courant.
 * La Feature 7 (temps réel front) le remplace par la vraie liste de présence
 * alimentée par l'événement Socket.IO `presence`.
 */
export function PresenceBar() {
  const user = useAppStore((state) => state.user);

  return (
    <div
      data-testid="presence-bar"
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
    >
      {user ? (
        <span
          title={user.displayName}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: user.cursorColor,
            color: '#FFFFFF',
            fontWeight: 700,
          }}
        >
          {user.displayName.slice(0, 1).toLocaleUpperCase('fr-FR')}
        </span>
      ) : null}
    </div>
  );
}
```

- [ ] **Étape 4: relancer le test de la barre de recherche**

```bash
pnpm --filter @suivi/web test -- src/components/grid/SearchBar.spec.tsx
```

Attendu : **PASS** — 3 tests verts.

- [ ] **Étape 5: supprimer la page placeholder et créer la page du mois courant**

```bash
git rm -f apps/web/src/app/page.tsx
```

Attendu : le fichier disparaît (s'il a déjà été supprimé par la Feature 2, la commande échoue avec `did not match any files` — passer à la suite).

Si `apps/web/src/app/(app)/layout.tsx` **n'existe pas** (Feature 2 pas encore mergée), le créer ; sinon **ne pas y toucher** :

```tsx
import type { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>{children}</div>;
}
```

Créer `apps/web/src/app/(app)/page.tsx` :

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as api from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { DataGrid } from '../../components/grid/DataGrid';
import { MonthTabs, latestMonth } from '../../components/grid/MonthTabs';
import { PresenceBar } from '../../components/grid/PresenceBar';
import { SearchBar } from '../../components/grid/SearchBar';
import { messageForError } from '../../components/grid/cellCommit';

export default function MoisPage() {
  const router = useRouter();
  const monthCourant = useAppStore((state) => state.monthCourant);
  const months = useAppStore((state) => state.months);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const store = useAppStore.getState();
    try {
      const rows = await api.getRows({ month: store.monthCourant });
      store.setRows(rows);
    } catch (error: unknown) {
      store.showToast(messageForError(error), 'error');
    }
  }, []);

  // Chargement initial : profil, colonnes, mois, puis lignes du mois courant.
  useEffect(() => {
    let cancelled = false;
    async function bootstrap(): Promise<void> {
      const store = useAppStore.getState();
      try {
        const [user, columns, monthList] = await Promise.all([
          api.getMe(),
          api.getColumns(),
          api.getMonths(),
        ]);
        if (cancelled) return;
        store.setUser(user);
        store.setColumns(columns);
        store.setMonths(monthList);
        store.setView('month');
        const target = monthList.some((info) => info.month === store.monthCourant)
          ? store.monthCourant
          : latestMonth(monthList);
        store.setMonthCourant(target);
        store.setRows(await api.getRows({ month: target }));
        if (!cancelled) setReady(true);
      } catch (error: unknown) {
        if (error instanceof api.ApiRequestError && error.code === 'AUTH_REQUIRED') {
          router.replace('/login');
          return;
        }
        store.showToast(messageForError(error), 'error');
        if (!cancelled) setReady(true);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function selectMonth(month: string): Promise<void> {
    useAppStore.getState().setMonthCourant(month);
    await reload();
  }

  async function createMonth(month: string): Promise<void> {
    const store = useAppStore.getState();
    try {
      await api.createRow({ month });
      store.setMonths(await api.getMonths());
      store.setMonthCourant(month);
      store.setRows(await api.getRows({ month }));
    } catch (error: unknown) {
      store.showToast(messageForError(error), 'error');
    }
  }

  async function addRow(): Promise<void> {
    const store = useAppStore.getState();
    try {
      const created = await api.createRow({ month: store.monthCourant });
      store.addRow(created);
      store.setMonths(await api.getMonths());
    } catch (error: unknown) {
      store.showToast(messageForError(error), 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 12px',
          borderBottom: '1px solid #D8DEE4',
          background: '#F7F9FB',
        }}
      >
        <strong style={{ fontSize: 15 }}>Suivi commandes</strong>
        <SearchBar />
        <div style={{ marginLeft: 'auto' }}>
          <PresenceBar />
        </div>
      </header>

      {ready ? (
        <DataGrid reload={reload} />
      ) : (
        <p data-testid="grid-loading" style={{ padding: 12 }}>
          Chargement du tableau…
        </p>
      )}

      <div style={{ padding: '6px 12px', borderTop: '1px solid #EDF1F5' }}>
        <button
          type="button"
          data-testid="add-row"
          onClick={() => void addRow()}
          style={{
            padding: '5px 12px',
            border: '1px solid #2772A4',
            borderRadius: 4,
            background: '#FFFFFF',
            color: '#2772A4',
            cursor: 'pointer',
          }}
        >
          + Ajouter une ligne
        </button>
      </div>

      <MonthTabs
        months={months}
        current={monthCourant}
        onSelect={(month) => void selectMonth(month)}
        onCreate={(month) => void createMonth(month)}
        onOpenArchives={() => router.push('/archives')}
      />
    </div>
  );
}
```

- [ ] **Étape 6: créer la page Archives**

Créer `apps/web/src/app/(app)/archives/page.tsx` :

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as api from '../../../lib/api';
import { useAppStore } from '../../../lib/store';
import { DataGrid } from '../../../components/grid/DataGrid';
import { PresenceBar } from '../../../components/grid/PresenceBar';
import { SearchBar } from '../../../components/grid/SearchBar';
import { messageForError } from '../../../components/grid/cellCommit';

export default function ArchivesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const store = useAppStore.getState();
    try {
      store.setRows(await api.getRows({ archived: true }));
    } catch (error: unknown) {
      store.showToast(messageForError(error), 'error');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap(): Promise<void> {
      const store = useAppStore.getState();
      try {
        const [user, columns, monthList] = await Promise.all([
          api.getMe(),
          api.getColumns(),
          api.getMonths(),
        ]);
        if (cancelled) return;
        store.setUser(user);
        store.setColumns(columns);
        store.setMonths(monthList);
        store.setView('archives');
        store.setRows(await api.getRows({ archived: true }));
        if (!cancelled) setReady(true);
      } catch (error: unknown) {
        if (error instanceof api.ApiRequestError && error.code === 'AUTH_REQUIRED') {
          router.replace('/login');
          return;
        }
        store.showToast(messageForError(error), 'error');
        if (!cancelled) setReady(true);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 12px',
          borderBottom: '1px solid #D8DEE4',
          background: '#F7F9FB',
        }}
      >
        <strong style={{ fontSize: 15 }}>Suivi commandes — Archives</strong>
        <SearchBar />
        <button
          type="button"
          data-testid="back-to-months"
          onClick={() => router.push('/')}
          style={{
            padding: '5px 12px',
            border: '1px solid #D8DEE4',
            borderRadius: 4,
            background: '#FFFFFF',
            cursor: 'pointer',
          }}
        >
          Retour aux mois
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <PresenceBar />
        </div>
      </header>

      {ready ? (
        <DataGrid reload={reload} />
      ) : (
        <p data-testid="grid-loading" style={{ padding: 12 }}>
          Chargement des archives…
        </p>
      )}
    </div>
  );
}
```

Le menu contextuel affiche automatiquement « Désarchiver » ici : `RowContextMenu` se base sur `row.archived` (Task 6.7), qui vaut `true` pour toutes les lignes de cette vue.

- [ ] **Étape 7: créer la page Recherche**

Créer `apps/web/src/app/(app)/recherche/page.tsx` :

```tsx
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { RowDTO } from '@suivi/shared';
import * as api from '../../../lib/api';
import { useAppStore } from '../../../lib/store';
import { SearchBar } from '../../../components/grid/SearchBar';
import { formatMonthLabel } from '../../../components/grid/MonthTabs';
import { messageForError } from '../../../components/grid/cellCommit';

function groupByMonth(rows: RowDTO[]): [string, RowDTO[]][] {
  const groups = new Map<string, RowDTO[]>();
  for (const row of rows) {
    const key = row.archived ? 'archives' : row.month;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function ResultatsRecherche() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.get('q') ?? '';
  const columns = useAppStore((state) => state.columns);
  const [rows, setRows] = useState<RowDTO[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run(): Promise<void> {
      const store = useAppStore.getState();
      if (store.columns.length === 0) {
        try {
          store.setColumns(await api.getColumns());
        } catch {
          // Les colonnes servent seulement à choisir les champs affichés.
        }
      }
      if (query.trim() === '') {
        setRows([]);
        return;
      }
      setLoading(true);
      try {
        const found = await api.searchRows(query);
        if (!cancelled) setRows(found);
      } catch (error: unknown) {
        store.showToast(messageForError(error), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const preview = columns.filter((column) => column.visible).slice(0, 5);

  function openMonth(row: RowDTO): void {
    if (row.archived) {
      router.push('/archives');
      return;
    }
    useAppStore.getState().setMonthCourant(row.month);
    router.push('/');
  }

  return (
    <div style={{ padding: 12 }}>
      <SearchBar initialQuery={query} />

      {loading ? <p data-testid="search-loading">Recherche en cours…</p> : null}

      {!loading && query.trim() !== '' && rows.length === 0 ? (
        <p data-testid="search-empty">Aucun résultat pour « {query} ».</p>
      ) : null}

      {groupByMonth(rows).map(([group, groupRows]) => (
        <section key={group} data-testid={`search-group-${group}`} style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 14, margin: '0 0 6px' }}>
            {group === 'archives' ? 'ARCHIVES' : formatMonthLabel(group)} — {groupRows.length}{' '}
            ligne(s)
          </h2>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {preview.map((column) => (
                  <th
                    key={column.key}
                    style={{
                      textAlign: 'left',
                      borderBottom: '1px solid #D8DEE4',
                      padding: '4px 6px',
                    }}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupRows.map((row) => (
                <tr
                  key={row.id}
                  data-testid={`search-row-${row.id}`}
                  onClick={() => openMonth(row)}
                  style={{ cursor: 'pointer' }}
                >
                  {preview.map((column) => (
                    <td
                      key={column.key}
                      style={{ borderBottom: '1px solid #EDF1F5', padding: '4px 6px' }}
                    >
                      {row.data[column.key] === null || row.data[column.key] === undefined
                        ? ''
                        : String(row.data[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

export default function RecherchePage() {
  return (
    <Suspense fallback={<p style={{ padding: 12 }}>Chargement…</p>}>
      <ResultatsRecherche />
    </Suspense>
  );
}
```

`useSearchParams` impose le `Suspense` en App Router : sans lui, `next build` échoue au prerender.

- [ ] **Étape 8: vérifier la compilation et l'ensemble des tests unitaires**

```bash
pnpm --filter @suivi/web build && pnpm --filter @suivi/web test
```

Attendu : **PASS** — build Next.js réussi (routes `/`, `/archives`, `/recherche`, `/login` listées) et toutes les specs Vitest vertes.

- [ ] **Étape 9: commit**

```bash
git add apps/web/src/components/grid/SearchBar.tsx apps/web/src/components/grid/SearchBar.spec.tsx apps/web/src/components/grid/PresenceBar.tsx "apps/web/src/app/(app)" && git add -A apps/web/src/app && git commit -m "feat: pages mois, archives et recherche assemblant la grille"
```

---

### Task 6.10: Copier-coller cellule et colonne (AG Grid Community, sans Enterprise)

La fonctionnalité clipboard native d'AG Grid est **Enterprise** ; en Community on
l'implémente à la main via `navigator.clipboard` + l'API grille. `Ctrl+C` copie la
valeur de la cellule focalisée ; `Ctrl+V` colle le presse-papier dans la cellule
focalisée, et si plusieurs cellules d'**une seule** colonne sont sélectionnées
verticalement, applique la valeur à toutes. L'écriture réutilise l'édition optimiste
`commitCellEdit` (Task 6.5) : PATCH /rows/:id optimiste, gestion du 409 et du 404.

**Files:**
- Create: `apps/web/src/components/grid/clipboard.ts`, `apps/web/src/components/grid/clipboard.spec.ts`
- Modify: `apps/web/src/components/grid/DataGrid.tsx`

**Interfaces:**
- Consomme : `commitCellEdit` + `CommitDeps` (Task 6.5) ; `RowDTO`, `CellValue` (`@suivi/shared`) ; l'API grille AG Grid Community (`getFocusedCell`, `getDisplayedRowAtIndex`).
- Produit :
  - `export interface GridClipboardApi { getFocusedCell(): { rowIndex: number; column: { getColId(): string } } | null; getDisplayedRowAtIndex(index: number): { data?: RowDTO } | undefined }`
  - `export function cellText(value: CellValue | undefined): string`
  - `export function copyFocusedCell(api: GridClipboardApi, writeText: (text: string) => Promise<void>): Promise<boolean>`
  - `export function pasteFocusedColumn(api: GridClipboardApi, readText: () => Promise<string>, selectedRowIndexes: readonly number[], deps: CommitDeps): Promise<void>`

- [ ] **Étape 1: écrire le test (échec attendu)**

Créer `apps/web/src/components/grid/clipboard.spec.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import type { RowDTO } from '@suivi/shared';
import { cellText, copyFocusedCell, pasteFocusedColumn, type GridClipboardApi } from './clipboard';

function row(id: string, client: string | null): RowDTO {
  return {
    id,
    month: '2026-08',
    position: 0,
    data: { client },
    formats: {},
    version: 1,
    archived: false,
    updatedAt: '2026-08-10T10:00:00.000Z',
  };
}

function fakeApi(
  rows: RowDTO[],
  focused: { rowIndex: number; colId: string } | null,
): GridClipboardApi {
  return {
    getFocusedCell: () =>
      focused
        ? { rowIndex: focused.rowIndex, column: { getColId: () => focused.colId } }
        : null,
    getDisplayedRowAtIndex: (index: number) =>
      rows[index] ? { data: rows[index] } : undefined,
  };
}

function fakeDeps() {
  const patchRow = vi.fn(async (id: string) => ({ ...row(id, 'X'), version: 2 }));
  return { patchRow, applyRowPatch: vi.fn(), reload: vi.fn(async () => undefined), showToast: vi.fn() };
}

describe('cellText', () => {
  it('rend une chaîne vide pour null/undefined et convertit le reste', () => {
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
    expect(cellText(42)).toBe('42');
    expect(cellText('NEO')).toBe('NEO');
  });
});

describe('copyFocusedCell', () => {
  it('écrit la valeur de la cellule focalisée dans le presse-papier', async () => {
    const writeText = vi.fn(async () => undefined);
    const ok = await copyFocusedCell(
      fakeApi([row('r1', 'ARCADIA'), row('r2', 'NEO')], { rowIndex: 1, colId: 'client' }),
      writeText,
    );
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('NEO');
  });

  it('rend false et n’écrit rien sans cellule focalisée', async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await copyFocusedCell(fakeApi([], null), writeText)).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('pasteFocusedColumn', () => {
  it('colle sur la seule cellule focalisée quand aucune sélection multiple', async () => {
    const rows = [row('r1', 'A'), row('r2', 'B')];
    const deps = fakeDeps();
    await pasteFocusedColumn(
      fakeApi(rows, { rowIndex: 0, colId: 'client' }),
      async () => 'X',
      [],
      deps,
    );
    expect(deps.patchRow).toHaveBeenCalledTimes(1);
    expect(deps.patchRow).toHaveBeenCalledWith('r1', { expectedVersion: 1, patch: { client: 'X' } });
  });

  it('applique la valeur à toutes les lignes sélectionnées de la colonne', async () => {
    const rows = [row('r1', 'A'), row('r2', 'B'), row('r3', 'C')];
    const deps = fakeDeps();
    await pasteFocusedColumn(
      fakeApi(rows, { rowIndex: 0, colId: 'client' }),
      async () => 'X',
      [0, 1, 2],
      deps,
    );
    expect(deps.patchRow.mock.calls.map((call) => call[0])).toEqual(['r1', 'r2', 'r3']);
    expect(deps.patchRow).toHaveBeenLastCalledWith('r3', {
      expectedVersion: 1,
      patch: { client: 'X' },
    });
  });

  it('colle une chaîne vide comme valeur null', async () => {
    const rows = [row('r1', 'A')];
    const deps = fakeDeps();
    await pasteFocusedColumn(
      fakeApi(rows, { rowIndex: 0, colId: 'client' }),
      async () => '',
      [],
      deps,
    );
    expect(deps.patchRow).toHaveBeenCalledWith('r1', { expectedVersion: 1, patch: { client: null } });
  });
});
```

- [ ] **Étape 2: lancer le test (échec attendu)**

```bash
pnpm --filter @suivi/web test -- src/components/grid/clipboard.spec.ts
```

Attendu : **FAIL** — `Failed to resolve import "./clipboard"`.

- [ ] **Étape 3: implémenter `clipboard.ts`**

Créer `apps/web/src/components/grid/clipboard.ts` :

```ts
import type { CellValue, RowDTO } from '@suivi/shared';
import { commitCellEdit, type CommitDeps } from './cellCommit';

/**
 * Sous-ensemble de l'API AG Grid Community réellement utilisé par le
 * copier-coller. Le typer explicitement rend les fonctions testables sans monter
 * une vraie grille, et documente qu'on n'emploie AUCUNE API Enterprise
 * (getCellRanges, processDataFromClipboard, etc. n'existent pas en Community).
 */
export interface GridClipboardApi {
  getFocusedCell(): { rowIndex: number; column: { getColId(): string } } | null;
  getDisplayedRowAtIndex(index: number): { data?: RowDTO } | undefined;
}

/** Représentation texte d'une valeur de cellule pour le presse-papier. */
export function cellText(value: CellValue | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Ctrl+C : copie la valeur de la cellule focalisée. Rend false si rien à copier. */
export async function copyFocusedCell(
  api: GridClipboardApi,
  writeText: (text: string) => Promise<void>,
): Promise<boolean> {
  const focused = api.getFocusedCell();
  if (!focused) return false;
  const rowData = api.getDisplayedRowAtIndex(focused.rowIndex)?.data;
  if (!rowData) return false;
  await writeText(cellText(rowData.data[focused.column.getColId()]));
  return true;
}

/**
 * Ctrl+V : colle le presse-papier dans la colonne focalisée. `selectedRowIndexes`
 * est la sélection verticale suivie MANUELLEMENT par `DataGrid` (la sélection de
 * plage native est Enterprise) ; vide, seule la cellule focalisée est écrite.
 * L'écriture passe par `commitCellEdit` (optimiste + 409/404) ligne par ligne.
 */
export async function pasteFocusedColumn(
  api: GridClipboardApi,
  readText: () => Promise<string>,
  selectedRowIndexes: readonly number[],
  deps: CommitDeps,
): Promise<void> {
  const focused = api.getFocusedCell();
  if (!focused) return;
  const colKey = focused.column.getColId();
  const text = await readText();
  const value: CellValue = text === '' ? null : text;
  const indexes = selectedRowIndexes.length > 0 ? [...selectedRowIndexes] : [focused.rowIndex];
  for (const index of indexes) {
    const rowData = api.getDisplayedRowAtIndex(index)?.data;
    if (rowData) {
      await commitCellEdit(rowData, colKey, value, deps);
    }
  }
}
```

- [ ] **Étape 4: relancer le test (PASS)**

```bash
pnpm --filter @suivi/web test -- src/components/grid/clipboard.spec.ts
```

Attendu : **PASS** — 6 tests verts.

- [ ] **Étape 5: brancher le copier-coller dans `DataGrid.tsx`**

Dans `apps/web/src/components/grid/DataGrid.tsx`, compléter l'import
`ag-grid-community` avec les types d'événements et l'API grille :

```tsx
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type CellClickedEvent,
  type CellContextMenuEvent,
  type CellKeyDownEvent,
  type CellValueChangedEvent,
  type ColumnMovedEvent,
  type ColumnResizedEvent,
  type GetRowIdParams,
  type GridApi,
  type GridReadyEvent,
  type RowDragEndEvent,
} from 'ag-grid-community';
```

et ajouter, sous l'import de `./columnLayout`, l'import du module de presse-papier :

```tsx
import { copyFocusedCell, pasteFocusedColumn } from './clipboard';
```

Dans le composant `DataGrid`, ajouter (après la mémo `deps`) une référence à
l'API grille et le suivi manuel de la sélection verticale d'une colonne :

```tsx
  const gridApiRef = useRef<GridApi<RowDTO> | null>(null);
  // Sélection verticale suivie à la main (la sélection de plage est Enterprise) :
  // clic simple = 1 cellule ; Maj+clic dans la MÊME colonne = étend depuis l'ancre.
  const selectionRef = useRef<{ colKey: string; anchor: number; indexes: number[] }>({
    colKey: '',
    anchor: -1,
    indexes: [],
  });

  const onGridReady = useCallback((event: GridReadyEvent<RowDTO>) => {
    gridApiRef.current = event.api;
  }, []);

  const onCellClicked = useCallback((event: CellClickedEvent<RowDTO>) => {
    const colKey = event.column.getColId();
    const rowIndex = event.rowIndex ?? 0;
    const mouse = event.event as MouseEvent | null;
    const current = selectionRef.current;
    if (mouse?.shiftKey && current.colKey === colKey && current.anchor >= 0) {
      const lo = Math.min(current.anchor, rowIndex);
      const hi = Math.max(current.anchor, rowIndex);
      const indexes: number[] = [];
      for (let i = lo; i <= hi; i += 1) indexes.push(i);
      selectionRef.current = { colKey, anchor: current.anchor, indexes };
    } else {
      selectionRef.current = { colKey, anchor: rowIndex, indexes: [rowIndex] };
    }
  }, []);

  const onCellKeyDown = useCallback(
    (event: CellKeyDownEvent<RowDTO>) => {
      const keyboard = event.event as KeyboardEvent | null;
      if (!keyboard || !(keyboard.ctrlKey || keyboard.metaKey)) return;
      const key = keyboard.key.toLowerCase();
      if (key === 'c') {
        keyboard.preventDefault();
        void copyFocusedCell(event.api, (text) => navigator.clipboard.writeText(text));
      } else if (key === 'v') {
        keyboard.preventDefault();
        const colKey = event.api.getFocusedCell()?.column.getColId() ?? '';
        const indexes = selectionRef.current.colKey === colKey ? selectionRef.current.indexes : [];
        void pasteFocusedColumn(event.api, () => navigator.clipboard.readText(), indexes, deps);
      }
    },
    [deps],
  );
```

Enfin, activer le texte sélectionnable, l'ordre DOM garanti et brancher les trois
gestionnaires sur `<AgGridReact>` :

```tsx
        <AgGridReact<RowDTO>
          theme={suiviTheme}
          rowData={rows}
          columnDefs={columnDefs}
          getRowId={(params: GetRowIdParams<RowDTO>) => params.data.id}
          defaultColDef={{ resizable: true, editable: true, sortable: false }}
          singleClickEdit={false}
          stopEditingWhenCellsLoseFocus
          rowDragManaged
          preventDefaultOnContextMenu
          animateRows={false}
          enableCellTextSelection={true}
          ensureDomOrder={true}
          onGridReady={onGridReady}
          onCellValueChanged={onCellValueChanged}
          onColumnResized={onColumnResized}
          onColumnMoved={onColumnMoved}
          onRowDragEnd={onRowDragEnd}
          onCellClicked={onCellClicked}
          onCellKeyDown={onCellKeyDown}
          onCellContextMenu={onCellContextMenu}
        />
```

- [ ] **Étape 6: vérifier que le front compile**

```bash
pnpm --filter @suivi/web build
```

Attendu : **PASS** — build Next.js en succès, aucune erreur TypeScript.

- [ ] **Étape 7: commit**

```bash
git add apps/web/src/components/grid/clipboard.ts apps/web/src/components/grid/clipboard.spec.ts apps/web/src/components/grid/DataGrid.tsx && git commit -m "feat: copier-coller cellule et colonne en AG Grid Community (Ctrl+C/Ctrl+V)"
```

> À vérifier à l'exécution : le comportement exact de la sélection multi-cellules
> en Community. `enableCellTextSelection` active la **sélection de texte** (pour la
> copie visuelle) mais ne fournit pas d'API de plage (`getCellRanges` est
> Enterprise) : le suivi vertical repose donc entièrement sur `selectionRef`
> alimenté par `onCellClicked`/Maj+clic. Si l'UX voulue est un cliquer-glisser
> vertical, ajouter le suivi sur `onCellMouseDown`/`onCellMouseOver` selon le même
> schéma (anchor + bornes), sans jamais introduire de module Enterprise.

---

### Task 6.11: Barre du haut unifiée (header unique dans le layout `(app)`)

La spec §7 demande **un seul** header : logo/titre « Suivi commandes », recherche,
avatars des connectés (présence) et menu compte (profil + déconnexion). Aujourd'hui
`02-auth.md` place `displayName` + `LogoutButton` dans `(app)/layout.tsx`, tandis que
chaque page (`page.tsx`, `archives`, `recherche`, Task 6.9) rend **son propre** header
avec `SearchBar` et `PresenceBar` → titre en double et barre éclatée. Cette tâche
compose un header unique dans le layout et **retire** `SearchBar`/`PresenceBar` des
pages.

> Dépendance : `SearchBar` et `PresenceBar` existent (Task 6.9) ; `LogoutButton` et
> `(app)/layout.tsx` existent (Feature 2, Task 2.9). La `PresenceBar` reste le
> placeholder de la Task 6.9 ; la Feature 7 remplace **son contenu** (avatars réels
> alimentés par l'événement `presence`) sans toucher au header ni à ce fichier.

**Files:**
- Create: `apps/web/src/components/AppHeader.tsx`, `apps/web/src/components/AppHeader.spec.tsx`, `apps/web/e2e/header.spec.ts`
- Modify: `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/(app)/page.tsx`, `apps/web/src/app/(app)/archives/page.tsx`, `apps/web/src/app/(app)/recherche/page.tsx`

**Interfaces:**
- Consomme : `SearchBar` (6.9), `PresenceBar` (6.9), `LogoutButton` (Feature 2), `useAppStore` (6.1), `UserDTO` (`@suivi/shared`), `next/link`, route `/parametres` (Feature 8).
- Produit :
  - `export interface AppHeaderProps { user: UserDTO }`
  - `export function AppHeader(props: AppHeaderProps): React.JSX.Element` — header unique consommé par `(app)/layout.tsx`.

- [ ] **Étape 1: écrire le test qui échoue — `apps/web/src/components/AppHeader.spec.tsx`**

```tsx
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserDTO } from '@suivi/shared';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('../lib/api', () => ({ api: { post: vi.fn(async () => undefined) } }));

import { useAppStore } from '../lib/store';
import { AppHeader } from './AppHeader';

const user: UserDTO = {
  id: 'u1',
  email: 'quentin.durant49@orange.fr',
  displayName: 'Quentin',
  cursorColor: '#3498DB',
};

beforeEach(() => {
  useAppStore.setState({ user });
});

describe('AppHeader — barre du haut unifiée', () => {
  it('rend logo, recherche, présence et menu compte une seule fois', () => {
    render(<AppHeader user={user} />);
    expect(screen.getAllByText('Suivi commandes')).toHaveLength(1);
    expect(screen.getAllByRole('search')).toHaveLength(1);
    expect(screen.getAllByTestId('presence-bar')).toHaveLength(1);
    expect(screen.getAllByTestId('account-menu')).toHaveLength(1);
    expect(screen.getByTestId('current-user')).toHaveTextContent('Quentin');
    expect(screen.getByTestId('account-profile')).toHaveAttribute('href', '/parametres');
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument();
  });
});
```

- [ ] **Étape 2: lancer le test (échec attendu)**

```bash
pnpm --filter @suivi/web test -- src/components/AppHeader.spec.tsx
```

Attendu : **FAIL** — `Failed to resolve import "./AppHeader"`.

- [ ] **Étape 3: implémenter `AppHeader.tsx`**

Créer `apps/web/src/components/AppHeader.tsx` :

```tsx
'use client';

import Link from 'next/link';
import type { UserDTO } from '@suivi/shared';
import { LogoutButton } from './LogoutButton';
import { PresenceBar } from './grid/PresenceBar';
import { SearchBar } from './grid/SearchBar';

export interface AppHeaderProps {
  user: UserDTO;
}

export function AppHeader({ user }: AppHeaderProps) {
  return (
    <header
      data-testid="app-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '8px 12px',
        borderBottom: '1px solid #D8DEE4',
        background: '#F7F9FB',
      }}
    >
      <strong style={{ fontSize: 15 }}>Suivi commandes</strong>
      <SearchBar />
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <PresenceBar />
        <details data-testid="account-menu" style={{ position: 'relative' }}>
          <summary
            data-testid="current-user"
            style={{
              cursor: 'pointer',
              listStyle: 'none',
              color: user.cursorColor,
              fontWeight: 600,
            }}
          >
            {user.displayName}
          </summary>
          <div
            style={{
              position: 'absolute',
              right: 0,
              marginTop: 6,
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              background: '#FFFFFF',
              border: '1px solid #D8DEE4',
              borderRadius: 4,
              zIndex: 1200,
              whiteSpace: 'nowrap',
            }}
          >
            <Link href="/parametres" data-testid="account-profile">
              Profil et paramètres
            </Link>
            <LogoutButton />
          </div>
        </details>
      </div>
    </header>
  );
}
```

- [ ] **Étape 4: relancer le test (PASS)**

```bash
pnpm --filter @suivi/web test -- src/components/AppHeader.spec.tsx
```

Attendu : **PASS** — 1 test vert.

- [ ] **Étape 5: composer le header dans `(app)/layout.tsx`**

Dans `apps/web/src/app/(app)/layout.tsx`, remplacer l'import de `LogoutButton` par
celui de `AppHeader` :

```tsx
  import { AppHeader } from '../../components/AppHeader';
```

(supprimer la ligne `import { LogoutButton } from '../../components/LogoutButton';`),
puis remplacer intégralement le `return` du composant `AppLayout` par :

```tsx
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <AppHeader user={user} />
        <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
      </div>
    );
```

- [ ] **Étape 6: retirer `SearchBar`/`PresenceBar` des trois pages**

Dans `apps/web/src/app/(app)/page.tsx` : supprimer les imports
`import { PresenceBar } ...` et `import { SearchBar } ...`, puis remplacer le
`<header>…</header>` (logo + `SearchBar` + `PresenceBar`) — devenu doublon — en
faisant démarrer le rendu directement par la grille ; ajuster le conteneur racine
pour s'insérer sous le header global :

```tsx
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {ready ? (
        <DataGrid reload={reload} />
      ) : (
        <p data-testid="grid-loading" style={{ padding: 12 }}>
          Chargement du tableau…
        </p>
      )}

      <div style={{ padding: '6px 12px', borderTop: '1px solid #EDF1F5' }}>
        <button
          type="button"
          data-testid="add-row"
          onClick={() => void addRow()}
          style={{
            padding: '5px 12px',
            border: '1px solid #2772A4',
            borderRadius: 4,
            background: '#FFFFFF',
            color: '#2772A4',
            cursor: 'pointer',
          }}
        >
          + Ajouter une ligne
        </button>
      </div>

      <MonthTabs
        months={months}
        current={monthCourant}
        onSelect={(month) => void selectMonth(month)}
        onCreate={(month) => void createMonth(month)}
        onOpenArchives={() => router.push('/archives')}
      />
    </div>
  );
```

Dans `apps/web/src/app/(app)/archives/page.tsx` : supprimer les imports
`PresenceBar` et `SearchBar`, puis remplacer le `<header>…</header>` par une barre
d'action réduite (le titre et la recherche sont désormais dans le header global) :

```tsx
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 12px',
          borderBottom: '1px solid #EDF1F5',
        }}
      >
        <strong style={{ fontSize: 14 }}>Archives</strong>
        <button
          type="button"
          data-testid="back-to-months"
          onClick={() => router.push('/')}
          style={{
            padding: '5px 12px',
            border: '1px solid #D8DEE4',
            borderRadius: 4,
            background: '#FFFFFF',
            cursor: 'pointer',
          }}
        >
          Retour aux mois
        </button>
      </div>

      {ready ? (
        <DataGrid reload={reload} />
      ) : (
        <p data-testid="grid-loading" style={{ padding: 12 }}>
          Chargement des archives…
        </p>
      )}
    </div>
  );
```

Dans `apps/web/src/app/(app)/recherche/page.tsx` : supprimer l'import
`import { SearchBar } ...` et la ligne `<SearchBar initialQuery={query} />` en tête
du rendu de `ResultatsRecherche` (la recherche du header global met déjà à jour
`?q=…`, lu ici via `useSearchParams`). Le premier enfant du `return` devient
directement le bloc `{loading ? … }`.

- [ ] **Étape 7: écrire le test e2e d'unicité du header — `apps/web/e2e/header.spec.ts`**

```ts
import { expect, test } from '@playwright/test';

test('un seul header unifié sur la page du mois', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail').fill('quentin.durant49@orange.fr');
  await page.getByLabel('Mot de passe').fill('changeme');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/');

  await expect(page.getByTestId('app-header')).toHaveCount(1);
  await expect(page.getByText('Suivi commandes', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('search')).toHaveCount(1);
  await expect(page.getByTestId('presence-bar')).toHaveCount(1);
  await expect(page.getByTestId('account-menu')).toHaveCount(1);
});
```

> Les libellés `Adresse e-mail` / `Mot de passe` / bouton `Se connecter` sont ceux
> de la page `/login` (Feature 2, Task 2.8) ; les adapter si ces libellés diffèrent
> dans le fichier réellement livré.

- [ ] **Étape 8: lancer les tests (unitaires puis e2e)**

```bash
pnpm --filter @suivi/web test && pnpm --filter @suivi/web build && pnpm --filter @suivi/web test:e2e -- header.spec.ts
```

Attendu : **PASS** — specs Vitest vertes, build Next.js réussi, e2e `header.spec.ts` vert (le header et ses éléments apparaissent exactement une fois).

- [ ] **Étape 9: commit**

```bash
git add apps/web/src/components/AppHeader.tsx apps/web/src/components/AppHeader.spec.tsx apps/web/e2e/header.spec.ts "apps/web/src/app/(app)" && git commit -m "feat: header unifie (logo, recherche, presence, menu compte) dans le layout (app)"
```

---

### Task 6.12: Test Playwright de bout en bout, tests complets et merge de la feature

**Files:**
- Create: `apps/web/e2e/grid.spec.ts`
- Aucune modification de `apps/web/playwright.config.ts` : le harnais Playwright (config, `webServer` api + web, `projects`, `globalSetup`, script `test:e2e`, entrées `.gitignore`) est créé **une seule fois** par la Feature 2 (Task 2.7). Cette task ne fait qu'ajouter une spec dans `apps/web/e2e/`.
- Test: `apps/web/e2e/grid.spec.ts` (Playwright), plus l'intégralité des suites Vitest et Jest du dépôt

**Interfaces:**
- Consomme : l'application complète (API Feature 1-5 + front Tasks 6.1-6.11), la base seedée (utilisateur `quentin.durant49@orange.fr` / `changeme`, colonne `client` de type TEXT, colonne `statut` de type SELECT avec le choix `INSTALLATION` en `#9BDEB4`).
- Produit : script `pnpm --filter @suivi/web test:e2e` et la preuve fonctionnelle demandée par la spec §12 (« login → édition cellule → valeur persistée »).

- [ ] **Étape 1: vérifier le harnais Playwright existant (rien à installer, rien à créer)**

`@playwright/test`, `apps/web/playwright.config.ts`, `apps/web/e2e/global-setup.ts`,
le script `test:e2e` de `apps/web/package.json` et les entrées `.gitignore` ont été
posés par la **Feature 2, Task 2.7**. La configuration démarre elle-même l'API et le
front (`webServer`) et rejoue le seed idempotent. **Ne pas la recréer, ne pas la
modifier.** Vérifier seulement :

```bash
test -f apps/web/playwright.config.ts && pnpm --filter @suivi/web exec playwright --version
```

Attendu : le chemin existe et la version de Playwright s'affiche. Si le fichier
manque, la Feature 2 n'est pas mergée : reprendre `develop`.

- [ ] **Étape 2: écrire le test e2e (échec attendu)**

Créer `apps/web/e2e/grid.spec.ts` :

```ts
import { expect, test, type Page } from '@playwright/test';

const EMAIL = 'quentin.durant49@orange.fr';
const PASSWORD = 'changeme';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator('[data-testid="data-grid"]')).toBeVisible();
}

/** Première cellule de la colonne demandée, dans le corps de la grille. */
function cell(page: Page, colId: string) {
  return page
    .locator('.ag-center-cols-container .ag-row')
    .first()
    .locator(`[col-id="${colId}"]`);
}

test.describe('Grille de suivi des commandes', () => {
  test('une édition de cellule texte survit à un rechargement', async ({ page }) => {
    await login(page);

    // Une ligne fraîche garantit un test rejouable sans polluer les données.
    await page.locator('[data-testid="add-row"]').click();
    await expect(page.locator('.ag-center-cols-container .ag-row')).not.toHaveCount(0);

    const value = `E2E-${Date.now()}`;
    const clientCell = cell(page, 'client');
    await clientCell.dblclick();
    await page.locator('.ag-cell-editor input').fill(value);
    await page.keyboard.press('Enter');

    await expect(clientCell).toHaveText(value);

    await page.reload();
    await expect(page.locator('[data-testid="data-grid"]')).toBeVisible();
    await expect(cell(page, 'client')).toHaveText(value);
  });

  test('le changement de statut affiche la couleur du choix', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="add-row"]').click();

    const statutCell = cell(page, 'statut');
    await statutCell.dblclick();
    await expect(page.locator('[data-testid="select-editor"]')).toBeVisible();
    await page.locator('[data-testid="select-filter"]').fill('INSTALLATION');
    await page.locator('[data-testid="select-option-INSTALLATION"]').click();

    const pastille = statutCell.locator('[data-testid="select-pastille"]');
    await expect(pastille).toHaveText('INSTALLATION');
    // #9BDEB4 sur fond, #176638 en texte, gras — couleurs du contrat.
    await expect(pastille).toHaveCSS('background-color', 'rgb(155, 222, 180)');
    await expect(pastille).toHaveCSS('color', 'rgb(23, 102, 56)');
    await expect(pastille).toHaveCSS('font-weight', '700');

    await page.reload();
    await expect(
      cell(page, 'statut').locator('[data-testid="select-pastille"]'),
    ).toHaveCSS('background-color', 'rgb(155, 222, 180)');
  });
});
```

- [ ] **Étape 3: lancer le test sans l'API (échec attendu)**

```bash
pnpm --filter @suivi/web test:e2e
```

Attendu : **FAIL** — le front démarre mais l'API est absente : `login` échoue et le test s'arrête sur `expect(locator('[data-testid="data-grid"]')).toBeVisible()` (timeout). C'est le point de départ : le scénario doit maintenant passer avec la pile complète.

- [ ] **Étape 4: démarrer la pile complète puis relancer le test**

Dans un terminal séparé (base déjà migrée et seedée par la Feature 1) :

```bash
pnpm --filter @suivi/api exec prisma migrate deploy
pnpm --filter @suivi/api exec prisma db seed
pnpm --filter @suivi/api dev
```

Puis, dans le terminal principal :

```bash
pnpm --filter @suivi/web test:e2e
```

Attendu : **PASS** — 2 tests verts. Le premier prouve la persistance (édition → `PATCH /api/rows/:id` → rechargement → valeur toujours là), le second prouve le rendu coloré du statut.

- [ ] **Étape 5: commit du test e2e**

```bash
git add apps/web/e2e/grid.spec.ts && git commit -m "test: scenario playwright edition de cellule et couleur de statut"
```

- [ ] **Étape 6: lancer TOUS les tests du périmètre**

```bash
pnpm --filter @suivi/web test
pnpm --filter @suivi/shared test
pnpm --filter @suivi/api test
pnpm --filter @suivi/web build
pnpm lint
pnpm --filter @suivi/web test:e2e
```

Attendu : **PASS** intégral —

| Suite | Contenu attendu |
|---|---|
| `@suivi/web` (Vitest) | `store.spec.ts` (8), `api.spec.ts` (11), `SelectCellRenderer` (4), `SelectCellEditor` (6), `DateCellEditor` (4), `columnDefs` (13), `cellCommit` (9), `columnLayout` (4), `MonthTabs` (7), `HighlightPalette` (3), `RowContextMenu` (8), `RowHistoryPanel` (4), `SearchBar` (3), `clipboard` (6), `AppHeader` (1) — 91 tests |
| `@suivi/shared` + `@suivi/api` | suites des Features 1 à 5, toujours vertes |
| `next build` | routes `/`, `/archives`, `/recherche`, `/login`, `/parametres` |
| Playwright | `grid.spec.ts` (2) + `header.spec.ts` (1) verts, plus les specs des features précédentes |

Aucun test rouge : interdiction de merger sinon.

- [ ] **Étape 7: merge gitflow dans develop et push**

```bash
git checkout develop && git merge --no-ff feature/grid-ui -m "merge: feature/grid-ui" && git push origin develop
```

Attendu : merge commit créé sur `develop`, push accepté. La Feature 7 (temps réel front) démarre depuis ce `develop` : elle branche `socket.ts` sur `useAppStore` (`upsertRow`, `applyRowPatch`, `addRow`, `removeRow`, `setColumns`), remplace le `PresenceBar` placeholder et affine le rollback de `cellCommit.ts`.

> À vérifier à l'exécution : les sélecteurs du formulaire de connexion (`input[type="email"]`, `input[type="password"]`, `form button[type="submit"]`) dépendent de la page `/login` livrée par la Feature 2 ; si elle utilise d'autres balises, remplacer par `page.getByLabel(...)` avec les libellés réels — sans modifier le reste du scénario. Vérifier également le sélecteur de l'éditeur texte AG Grid v34 (`.ag-cell-editor input`) : selon la version, il peut s'agir de `input.ag-input-field-input`.
