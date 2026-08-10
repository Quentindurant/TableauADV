# Section 07 — Feature 7 : Co-édition visible (front)

## Feature 7 — Co-édition visible (branche `feature/coedition-ui`)

**But:** rendre la co-édition perceptible et sûre dans l'interface — client Socket.IO avec reconnexion et resynchronisation, présence en avatars, focus et verrous de cellules affichés dans la grille, édition optimiste avec rollback sur `VERSION_CONFLICT`, bandeau de perte de connexion et rechargement de configuration à chaud.

**Dépend de:**

- **Feature 0** (socle monorepo : `@suivi/web` Next.js 15 / React 19, `transpilePackages: ['@suivi/shared']`, `NEXT_PUBLIC_API_URL`).
- **Feature 1** (`@suivi/shared` : `UserDTO`, `ColumnDTO`, `RowDTO`, `CellValue`, `ErrorCode`).
- **Feature 2** (auth : cookie JWT httpOnly `token` posé par `POST /api/auth/login`).
- **Feature 3** (`GET /api/columns`, `GET /api/users`).
- **Feature 4** (`GET /api/rows`, `PATCH /api/rows/:id` avec `expectedVersion`, 409 `VERSION_CONFLICT`).
- **Feature 5** (passerelle Socket.IO : rooms, `presence`, `cell.focus`, `cell.lock` / `cell.unlock`, `row.*`, `config.changed`, ack `cell.lock.request`).
- **Feature 6** (grille AG Grid : `apps/web/src/lib/api.ts`, `apps/web/src/lib/store.ts`, `apps/web/src/components/grid/DataGrid.tsx`, `PresenceBar.tsx` en placeholder).

### Contrats consommés tels quels (`_contracts.md`)

Rooms : `month:<YYYY-MM>` et `archives`.

Client → serveur :

| Événement | Charge utile | Ack |
|---|---|---|
| `room.join` | `{ room: string }` | — |
| `cell.focus` | `{ rowId: string; colKey: string } \| { rowId: null }` | — |
| `cell.lock.request` | `{ rowId: string; colKey: string }` | `{ granted: boolean; holder?: UserDTO }` |
| `cell.lock.release` | `{ rowId: string; colKey: string }` | — |

Serveur → clients de la room :

| Événement | Charge utile |
|---|---|
| `presence` | `{ users: (UserDTO & { socketId: string })[] }` |
| `cell.focus` | `{ userId: string; rowId: string \| null; colKey: string \| null }` |
| `cell.lock` | `{ rowId: string; colKey: string; user: UserDTO }` |
| `cell.unlock` | `{ rowId: string; colKey: string }` |
| `row.created` | `{ row: RowDTO }` |
| `row.updated` | `{ row: RowDTO; changedKeys: string[]; byUserId: string }` |
| `row.deleted` | `{ rowId: string }` |
| `row.moved` | `{ row: RowDTO; fromMonth: string }` |
| `config.changed` | `{ scope: 'columns' \| 'choices' \| 'users' }` |

Route REST du cœur de la feature : `PATCH /api/rows/:id` corps `{ expectedVersion, patch?, formats? }` → 200 `RowDTO`, ou 409 `{ code: 'VERSION_CONFLICT', message, details: { current: RowDTO, conflictKeys: string[] } }`.

### Surface consommée de la Feature 6 (signatures exactes attendues)

Ces symboles sont produits par la Feature 6 ; cette section les consomme sans
les redéfinir.

Ces signatures sont figées par `_contracts.md` (§ « Client HTTP web » et § « État
front »). Elles ne sont ni à vérifier ni à adapter : elles sont recopiées mot pour
mot depuis la Feature 6.

```ts
// apps/web/src/lib/api.ts (Feature 6, Task 6.2)
export class ApiRequestError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: ErrorCode, message: string, status: number, details?: unknown);
}
// apiUrl(path) = `${NEXT_PUBLIC_API_URL ?? ''}/api${path}` : les appelants passent
// un chemin SANS le préfixe /api (`'/rows?month=2026-08'`, `'/columns'`).
// apiFetch envoie credentials: 'include', pose Content-Type: application/json,
// rend undefined sur 204 et lève ApiRequestError sur toute réponse non 2xx.
export function apiUrl(path: string): string;
export function apiFetch<T>(path: string, init?: RequestInit): Promise<T>;
```

```ts
// apps/web/src/lib/store.ts (Feature 6, Task 6.1) — état existant, complété par cette feature
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

export const useAppStore: UseBoundStore<StoreApi<AppState>>;
```

**Conséquences directes pour cette section :**

- la vue courante est portée par **deux** champs, `view: 'month' | 'archives'` et
  `monthCourant: string` — il n'existe pas d'objet `{ kind, month }`. Tous les
  helpers de la Task 7.1 prennent donc `(view: GridView, month: string)` ;
- l'utilisateur connecté est `user` (pas `me`), posé par `setUser` ;
- le modèle de toast est **unique** (`toast: ToastState | null`, `showToast(message, kind?)`,
  `hideToast()`), et il est déjà rendu par `DataGrid.tsx` (Feature 6, Task 6.8) :
  cette section n'ajoute **ni** pile de toasts **ni** composant `Toasts.tsx` ;
- `users: UserDTO[]` / `setUsers` n'existent pas encore : ils sont **ajoutés** par la
  Task 7.3, comme le reste de la tranche co-édition.

```tsx
// apps/web/src/components/grid/DataGrid.tsx (Feature 6, Task 6.8)
// Grille AG Grid 34 : row data = RowDTO, getRowId = (params) => params.data.id,
// colId de chaque colonne = ColumnDTO.key, et un état local `gridApi: GridApi | null`
// renseigné dans onGridReady. La vue est lue dans le store, pas passée en prop.
export interface DataGridProps {
  reload: () => Promise<void>;
}
export function DataGrid(props: DataGridProps): React.JSX.Element;
```

### Fichiers de la feature (racine du repo)

```
apps/web/src/lib/coedition.ts                         (create) + coedition.spec.ts
apps/web/src/lib/socket.ts                            (create) + socket.spec.ts
apps/web/src/lib/coedition-sync.ts                    (create) + coedition-sync.spec.ts
apps/web/src/lib/coedition-cell.ts                    (create) + coedition-cell.spec.ts
apps/web/src/components/grid/cellCommit.ts            (modify) + cellCommit.coedition.spec.ts
apps/web/src/lib/store.ts                             (modify) + store.coedition.spec.ts
apps/web/src/components/grid/PresenceBar.tsx          (modify) + PresenceBar.spec.tsx
apps/web/src/components/grid/ConnectionBanner.tsx     (create)
apps/web/src/components/grid/useCoedition.ts          (create) + useCoedition.spec.tsx
apps/web/src/components/grid/coedition.css            (create)
apps/web/src/components/grid/DataGrid.tsx             (modify)
apps/web/src/app/(app)/layout.tsx                     (modify)
apps/web/playwright.config.ts                         (aucune modification — créé en Feature 2, Task 2.7)
apps/web/e2e/coedition.spec.ts                        (create)
apps/api/prisma/seed-e2e.ts                           (create)
```

---

### Task 7.1: Branche, outillage de test front et helpers purs de co-édition

- **Files:**
  - Create: `apps/web/src/lib/coedition.ts`
  - Modify: `apps/web/package.json` (ajout de `socket.io-client` uniquement)
  - Test: `apps/web/src/lib/coedition.spec.ts`
- **Interfaces:**
  - Consomme : `RowDTO`, `UserDTO` de `@suivi/shared` (Feature 1) ; `type GridView = 'month' | 'archives'` de `apps/web/src/lib/store.ts` (Feature 6, Task 6.1) — **cette section ne redéfinit pas `GridView`**, la vue est le couple (`view`, `monthCourant`) du store.
  - Produit (utilisé par toutes les tâches suivantes) :
    - `roomForView(view: GridView, month: string): string`
    - `rowsQueryForView(view: GridView, month: string): string`
    - `rowBelongsToView(row: RowDTO, view: GridView, month: string): boolean`
    - `upsertRow(rows: RowDTO[], row: RowDTO): RowDTO[]`
    - `removeRow(rows: RowDTO[], rowId: string): RowDTO[]`
    - `uniquePresence(users: UserDTO[], meId: string | null): UserDTO[]`
    - `initialsOf(displayName: string): string`
    - `cellKey(rowId: string, colKey: string): string`

- [ ] **Étape 1: créer la branche gitflow**

  ```bash
  git checkout develop && git pull && git checkout -b feature/coedition-ui
  ```

- [ ] **Étape 2: installer la seule dépendance manquante**

  Le harnais de test front existe déjà : la Feature 6 (Task 6.1) a installé **Vitest**
  (`vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`,
  `@testing-library/user-event`), créé `apps/web/vitest.config.ts` /
  `apps/web/vitest.setup.ts` et posé les scripts `"test": "vitest run"` /
  `"test:watch": "vitest"`. **Ne rien réinstaller, ne créer aucune config de test,
  ne pas toucher aux scripts** : toutes les specs de cette section sont écrites pour
  Vitest (`import { … , vi } from 'vitest'`, `vi.mock`, `vi.fn`, `vi.mocked`) et sont
  collectées par le `include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx']` existant.

  Seule dépendance à ajouter :

  ```bash
  pnpm --filter @suivi/web add socket.io-client@4
  ```

- [ ] **Étape 3: écrire le test des helpers purs (échec attendu)**

  Créer `apps/web/src/lib/coedition.spec.ts` :

  ```ts
  import { describe, expect, it } from 'vitest';
  import type { RowDTO, UserDTO } from '@suivi/shared';
  import {
    cellKey,
    initialsOf,
    removeRow,
    roomForView,
    rowBelongsToView,
    rowsQueryForView,
    uniquePresence,
    upsertRow,
  } from './coedition';
  import type { GridView } from './store';

  function row(over: Partial<RowDTO> = {}): RowDTO {
    return {
      id: 'row1',
      month: '2026-08',
      position: 1,
      data: {},
      formats: {},
      version: 0,
      archived: false,
      updatedAt: '2026-08-10T10:00:00.000Z',
      ...over,
    };
  }

  function user(over: Partial<UserDTO> = {}): UserDTO {
    return {
      id: 'u1',
      email: 'alice@test.fr',
      displayName: 'Alice Martin',
      cursorColor: '#FF0000',
      ...over,
    };
  }

  const monthView: GridView = 'month';
  const archivesView: GridView = 'archives';
  const MOIS = '2026-08';

  describe('roomForView / rowsQueryForView', () => {
    it('mappe une vue mensuelle sur la room month:<YYYY-MM>', () => {
      expect(roomForView(monthView, MOIS)).toBe('month:2026-08');
      expect(rowsQueryForView(monthView, MOIS)).toBe('/rows?month=2026-08');
    });

    it('mappe la vue archives sur la room archives', () => {
      expect(roomForView(archivesView, MOIS)).toBe('archives');
      expect(rowsQueryForView(archivesView, MOIS)).toBe('/rows?archived=true');
    });
  });

  describe('rowBelongsToView', () => {
    it('accepte une ligne non archivée du bon mois', () => {
      expect(rowBelongsToView(row(), monthView, MOIS)).toBe(true);
    });

    it('refuse une ligne d’un autre mois', () => {
      expect(rowBelongsToView(row({ month: '2026-07' }), monthView, MOIS)).toBe(false);
    });

    it('refuse une ligne archivée dans une vue mensuelle', () => {
      expect(rowBelongsToView(row({ archived: true }), monthView, MOIS)).toBe(false);
    });

    it('accepte toute ligne archivée dans la vue archives, quel que soit le mois', () => {
      expect(rowBelongsToView(row({ archived: true, month: '2025-03' }), archivesView, MOIS)).toBe(true);
      expect(rowBelongsToView(row({ archived: false }), archivesView, MOIS)).toBe(false);
    });
  });

  describe('upsertRow / removeRow', () => {
    it('insère une nouvelle ligne en respectant l’ordre des positions', () => {
      const rows = [row({ id: 'a', position: 1 }), row({ id: 'c', position: 3 })];
      const next = upsertRow(rows, row({ id: 'b', position: 2 }));
      expect(next.map((r) => r.id)).toEqual(['a', 'b', 'c']);
      expect(rows).toHaveLength(2); // immuable
    });

    it('remplace une ligne existante et la repositionne', () => {
      const rows = [row({ id: 'a', position: 1 }), row({ id: 'b', position: 2 })];
      const next = upsertRow(rows, row({ id: 'a', position: 9, version: 4 }));
      expect(next.map((r) => r.id)).toEqual(['b', 'a']);
      expect(next.find((r) => r.id === 'a')?.version).toBe(4);
    });

    it('départage deux positions identiques par id (ordre stable)', () => {
      const rows = [row({ id: 'zz', position: 1 })];
      const next = upsertRow(rows, row({ id: 'aa', position: 1 }));
      expect(next.map((r) => r.id)).toEqual(['aa', 'zz']);
    });

    it('supprime une ligne par id sans muter le tableau source', () => {
      const rows = [row({ id: 'a' }), row({ id: 'b' })];
      expect(removeRow(rows, 'a').map((r) => r.id)).toEqual(['b']);
      expect(removeRow(rows, 'inconnu')).toHaveLength(2);
      expect(rows).toHaveLength(2);
    });
  });

  describe('uniquePresence', () => {
    it('retire l’utilisateur courant et dédoublonne les sockets multiples', () => {
      const users = [
        user({ id: 'me' }),
        user({ id: 'u2', displayName: 'Bob' }),
        user({ id: 'u2', displayName: 'Bob' }),
      ];
      const result = uniquePresence(users, 'me');
      expect(result.map((u) => u.id)).toEqual(['u2']);
    });

    it('garde tout le monde quand l’utilisateur courant est inconnu', () => {
      const result = uniquePresence([user({ id: 'u1' }), user({ id: 'u2' })], null);
      expect(result.map((u) => u.id)).toEqual(['u1', 'u2']);
    });
  });

  describe('initialsOf', () => {
    it('prend la première lettre du prénom et du dernier mot', () => {
      expect(initialsOf('Alice Martin')).toBe('AM');
      expect(initialsOf('  jean  pierre  dupont ')).toBe('JD');
    });

    it('prend les deux premières lettres d’un nom unique', () => {
      expect(initialsOf('Quentin')).toBe('QU');
    });

    it('retombe sur « ? » pour un nom vide', () => {
      expect(initialsOf('   ')).toBe('?');
    });
  });

  describe('cellKey', () => {
    it('compose la clé rowId:colKey utilisée pour les verrous', () => {
      expect(cellKey('row1', 'statut')).toBe('row1:statut');
    });
  });
  ```

- [ ] **Étape 4: lancer le test**

  ```bash
  pnpm --filter @suivi/web test -- coedition.spec.ts
  ```

  Résultat attendu : **FAIL** — `Cannot find module './coedition' from 'src/lib/coedition.spec.ts'`.

- [ ] **Étape 5: implémenter les helpers**

  Créer `apps/web/src/lib/coedition.ts` :

  ```ts
  import type { RowDTO, UserDTO } from '@suivi/shared';
  import type { GridView } from './store';

  // La vue courante est le couple (view, monthCourant) du store de la Feature 6 :
  // `view` vaut 'month' | 'archives', `month` porte le mois affiché.

  /** Room Socket.IO correspondant à la vue (contrats : month:<YYYY-MM> | archives). */
  export function roomForView(view: GridView, month: string): string {
    return view === 'archives' ? 'archives' : `month:${month}`;
  }

  /** Chemin REST de rechargement complet des lignes de la vue. */
  export function rowsQueryForView(view: GridView, month: string): string {
    return view === 'archives' ? '/rows?archived=true' : `/rows?month=${month}`;
  }

  /** Une ligne reçue par socket doit-elle apparaître dans la vue courante ? */
  export function rowBelongsToView(row: RowDTO, view: GridView, month: string): boolean {
    if (view === 'archives') {
      return row.archived;
    }
    return !row.archived && row.month === month;
  }

  function byPosition(a: RowDTO, b: RowDTO): number {
    return a.position - b.position || a.id.localeCompare(b.id);
  }

  /** Insère ou remplace une ligne, tableau trié par position (immuable). */
  export function upsertRow(rows: RowDTO[], row: RowDTO): RowDTO[] {
    const index = rows.findIndex((r) => r.id === row.id);
    const next = index === -1 ? [...rows, row] : rows.map((r) => (r.id === row.id ? row : r));
    return next.sort(byPosition);
  }

  /** Retire une ligne par id (immuable). */
  export function removeRow(rows: RowDTO[], rowId: string): RowDTO[] {
    return rows.filter((r) => r.id !== rowId);
  }

  /**
   * Présence affichable : sans l'utilisateur courant (il se voit déjà) et
   * dédoublonnée — un même membre peut avoir plusieurs sockets dans la room.
   */
  export function uniquePresence(users: UserDTO[], meId: string | null): UserDTO[] {
    const seen = new Set<string>();
    const result: UserDTO[] = [];
    for (const user of users) {
      if (user.id === meId || seen.has(user.id)) {
        continue;
      }
      seen.add(user.id);
      result.push(user);
    }
    return result;
  }

  /** Initiales affichées dans l'avatar de présence. */
  export function initialsOf(displayName: string): string {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return '?';
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /** Clé de cellule utilisée pour les verrous (identique au serveur). */
  export function cellKey(rowId: string, colKey: string): string {
    return `${rowId}:${colKey}`;
  }
  ```

- [ ] **Étape 6: relancer le test**

  ```bash
  pnpm --filter @suivi/web test -- coedition.spec.ts
  ```

  Résultat attendu : **PASS** — 15 tests verts.

- [ ] **Étape 7: commit**

  ```bash
  git add apps/web/package.json apps/web/src/lib/coedition.ts apps/web/src/lib/coedition.spec.ts pnpm-lock.yaml
  git commit -m "feat(web): socket.io-client et helpers purs de co-édition"
  ```

---

### Task 7.2: Client Socket.IO (`lib/socket.ts`) — connexion, rooms, reconnexion

- **Files:**
  - Create: `apps/web/src/lib/socket.ts`
  - Test: `apps/web/src/lib/socket.spec.ts`
- **Interfaces:**
  - Consomme : `socket.io-client@4` (`io`), `UserDTO` / `RowDTO` de `@suivi/shared`, `NEXT_PUBLIC_API_URL`.
  - Produit :
    - `interface LockAck { granted: boolean; holder?: UserDTO }`
    - `interface ServerEvents { presence: ...; 'cell.focus': ...; 'cell.lock': ...; 'cell.unlock': ...; 'row.created': ...; 'row.updated': ...; 'row.deleted': ...; 'row.moved': ...; 'config.changed': ... }`
    - `getSocket(): Socket`
    - `joinRoom(room: string): void`
    - `onEvent<E extends keyof ServerEvents>(event: E, handler: (payload: ServerEvents[E]) => void): () => void`
    - `onConnectionChange(handler: (connected: boolean) => void): () => void`
    - `onReconnect(handler: () => void): () => void`
    - `emitCellFocus(payload: { rowId: string; colKey: string } | { rowId: null }): void`
    - `requestCellLock(rowId: string, colKey: string): Promise<LockAck>`
    - `releaseCellLock(rowId: string, colKey: string): void`
    - `disconnectSocket(): void`
    - `__resetSocketForTests(): void`

- [ ] **Étape 1: écrire le test du client socket (échec attendu)**

  Créer `apps/web/src/lib/socket.spec.ts` :

  ```ts
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import { io } from 'socket.io-client';
  import type { Socket } from 'socket.io-client';
  import {
    __resetSocketForTests,
    emitCellFocus,
    getSocket,
    joinRoom,
    onConnectionChange,
    onEvent,
    onReconnect,
    releaseCellLock,
    requestCellLock,
  } from './socket';

  vi.mock('socket.io-client');

  type Handler = (...args: unknown[]) => void;

  function createFakeSocket() {
    const handlers = new Map<string, Handler[]>();
    const emitWithAck = vi.fn().mockResolvedValue({ granted: true });
    const fake = {
      connected: false,
      emit: vi.fn(),
      emitWithAck,
      timeout: vi.fn(() => ({ emitWithAck })),
      disconnect: vi.fn(),
      on: vi.fn((event: string, handler: Handler) => {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        return fake;
      }),
      off: vi.fn((event: string, handler: Handler) => {
        handlers.set(event, (handlers.get(event) ?? []).filter((h) => h !== handler));
        return fake;
      }),
      trigger(event: string, ...args: unknown[]) {
        for (const handler of [...(handlers.get(event) ?? [])]) {
          handler(...args);
        }
      },
    };
    return fake;
  }

  let fakeSocket: ReturnType<typeof createFakeSocket>;

  beforeEach(() => {
    __resetSocketForTests();
    fakeSocket = createFakeSocket();
    vi.mocked(io).mockReturnValue(fakeSocket as unknown as Socket);
  });

  describe('getSocket', () => {
    it('ouvre une seule connexion, path /socket.io et withCredentials', () => {
      const first = getSocket();
      const second = getSocket();
      expect(first).toBe(second);
      expect(io).toHaveBeenCalledTimes(1);
      const options = vi.mocked(io).mock.calls[0].at(-1) as Record<string, unknown>;
      expect(options).toMatchObject({
        path: '/socket.io',
        withCredentials: true,
        reconnection: true,
      });
    });
  });

  describe('joinRoom', () => {
    it("n'émet rien tant que le socket n'est pas connecté, puis rejoint à la connexion", () => {
      joinRoom('month:2026-08');
      expect(fakeSocket.emit).not.toHaveBeenCalledWith('room.join', expect.anything());

      fakeSocket.connected = true;
      fakeSocket.trigger('connect');
      expect(fakeSocket.emit).toHaveBeenCalledWith('room.join', { room: 'month:2026-08' });
    });

    it('émet immédiatement quand le socket est déjà connecté', () => {
      getSocket();
      fakeSocket.connected = true;
      joinRoom('archives');
      expect(fakeSocket.emit).toHaveBeenCalledWith('room.join', { room: 'archives' });
    });

    it('re-rejoint automatiquement la dernière room à chaque reconnexion', () => {
      joinRoom('month:2026-08');
      fakeSocket.connected = true;
      fakeSocket.trigger('connect');
      fakeSocket.connected = false;
      fakeSocket.trigger('disconnect', 'transport close');
      fakeSocket.emit.mockClear();
      fakeSocket.connected = true;
      fakeSocket.trigger('connect');
      expect(fakeSocket.emit).toHaveBeenCalledWith('room.join', { room: 'month:2026-08' });
    });
  });

  describe('onConnectionChange / onReconnect', () => {
    it('signale les transitions connecté / déconnecté', () => {
      const seen: boolean[] = [];
      const off = onConnectionChange((connected) => seen.push(connected));
      fakeSocket.trigger('connect');
      fakeSocket.trigger('disconnect', 'transport close');
      fakeSocket.trigger('connect');
      expect(seen).toEqual([true, false, true]);
      off();
      fakeSocket.trigger('disconnect', 'transport close');
      expect(seen).toEqual([true, false, true]);
    });

    it('ne déclenche onReconnect qu’à partir de la DEUXIÈME connexion', () => {
      const handler = vi.fn();
      onReconnect(handler);
      fakeSocket.trigger('connect');
      expect(handler).not.toHaveBeenCalled();
      fakeSocket.trigger('disconnect', 'transport close');
      fakeSocket.trigger('connect');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('onEvent', () => {
    it('abonne un handler typé et rend une fonction de désabonnement', () => {
      const handler = vi.fn();
      const off = onEvent('row.updated', handler);
      fakeSocket.trigger('row.updated', { row: { id: 'r1' }, changedKeys: ['client'], byUserId: 'u1' });
      expect(handler).toHaveBeenCalledWith({
        row: { id: 'r1' },
        changedKeys: ['client'],
        byUserId: 'u1',
      });
      off();
      fakeSocket.trigger('row.updated', { row: { id: 'r2' }, changedKeys: [], byUserId: 'u1' });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('cell.focus et verrous', () => {
    it('émet cell.focus avec la cellule pointée puis le blur', () => {
      getSocket();
      fakeSocket.connected = true;
      emitCellFocus({ rowId: 'r1', colKey: 'client' });
      emitCellFocus({ rowId: null });
      expect(fakeSocket.emit).toHaveBeenCalledWith('cell.focus', { rowId: 'r1', colKey: 'client' });
      expect(fakeSocket.emit).toHaveBeenCalledWith('cell.focus', { rowId: null });
    });

    it('demande un verrou et rend l’ack du serveur', async () => {
      getSocket();
      fakeSocket.connected = true;
      const holder = { id: 'u2', email: 'b@test.fr', displayName: 'Bob', cursorColor: '#00FF00' };
      fakeSocket.emitWithAck.mockResolvedValueOnce({ granted: false, holder });
      await expect(requestCellLock('r1', 'client')).resolves.toEqual({ granted: false, holder });
      expect(fakeSocket.emitWithAck).toHaveBeenCalledWith('cell.lock.request', {
        rowId: 'r1',
        colKey: 'client',
      });
    });

    it('refuse le verrou (granted: false) si le socket est déconnecté', async () => {
      getSocket();
      fakeSocket.connected = false;
      await expect(requestCellLock('r1', 'client')).resolves.toEqual({ granted: false });
      expect(fakeSocket.emitWithAck).not.toHaveBeenCalled();
    });

    it('refuse le verrou quand l’ack expire (timeout serveur)', async () => {
      getSocket();
      fakeSocket.connected = true;
      fakeSocket.emitWithAck.mockRejectedValueOnce(new Error('operation has timed out'));
      await expect(requestCellLock('r1', 'client')).resolves.toEqual({ granted: false });
    });

    it('libère le verrou', () => {
      getSocket();
      fakeSocket.connected = true;
      releaseCellLock('r1', 'client');
      expect(fakeSocket.emit).toHaveBeenCalledWith('cell.lock.release', {
        rowId: 'r1',
        colKey: 'client',
      });
    });
  });
  ```

- [ ] **Étape 2: lancer le test**

  ```bash
  pnpm --filter @suivi/web test -- socket.spec.ts
  ```

  Résultat attendu : **FAIL** — `Cannot find module './socket' from 'src/lib/socket.spec.ts'`.

- [ ] **Étape 3: implémenter le client socket**

  Créer `apps/web/src/lib/socket.ts` :

  ```ts
  'use client';

  import { io, type Socket } from 'socket.io-client';
  import type { RowDTO, UserDTO } from '@suivi/shared';

  /** Ack du serveur à cell.lock.request (contrats Feature 5). */
  export interface LockAck {
    granted: boolean;
    holder?: UserDTO;
  }

  /** Charges utiles serveur → client, strictement conformes aux contrats. */
  export interface ServerEvents {
    presence: { users: (UserDTO & { socketId: string })[] };
    'cell.focus': { userId: string; rowId: string | null; colKey: string | null };
    'cell.lock': { rowId: string; colKey: string; user: UserDTO };
    'cell.unlock': { rowId: string; colKey: string };
    'row.created': { row: RowDTO };
    'row.updated': { row: RowDTO; changedKeys: string[]; byUserId: string };
    'row.deleted': { rowId: string };
    'row.moved': { row: RowDTO; fromMonth: string };
    'config.changed': { scope: 'columns' | 'choices' | 'users' };
  }

  /** Délai maximal d'attente de l'ack d'un verrou (ms). */
  export const LOCK_ACK_TIMEOUT_MS = 3_000;

  let socket: Socket | null = null;
  let currentRoom: string | null = null;
  let hasConnectedOnce = false;
  const connectionHandlers = new Set<(connected: boolean) => void>();
  const reconnectHandlers = new Set<() => void>();

  /**
   * Ouvre (ou réutilise) l'unique connexion Socket.IO.
   * Même hôte que l'API : en production NEXT_PUBLIC_API_URL est vide et le
   * socket tape la même origine, proxyfiée par Apache sur /socket.io.
   */
  export function getSocket(): Socket {
    if (socket) {
      return socket;
    }
    const options = {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 5_000,
    } as const;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    socket = baseUrl ? io(baseUrl, options) : io(options);

    socket.on('connect', () => {
      if (currentRoom) {
        socket?.emit('room.join', { room: currentRoom });
      }
      const isReconnect = hasConnectedOnce;
      hasConnectedOnce = true;
      for (const handler of [...connectionHandlers]) {
        handler(true);
      }
      if (isReconnect) {
        for (const handler of [...reconnectHandlers]) {
          handler();
        }
      }
    });

    socket.on('disconnect', () => {
      for (const handler of [...connectionHandlers]) {
        handler(false);
      }
    });

    return socket;
  }

  /** Mémorise la room de la vue et la rejoint (maintenant ou à la connexion). */
  export function joinRoom(room: string): void {
    currentRoom = room;
    const current = getSocket();
    if (current.connected) {
      current.emit('room.join', { room });
    }
  }

  /** Abonnement typé à un événement serveur ; rend la fonction de désabonnement. */
  export function onEvent<E extends keyof ServerEvents>(
    event: E,
    handler: (payload: ServerEvents[E]) => void,
  ): () => void {
    const current = getSocket();
    const listener = handler as (...args: unknown[]) => void;
    current.on(event as string, listener);
    return () => {
      current.off(event as string, listener);
    };
  }

  /** Notifie chaque transition connecté (true) / déconnecté (false). */
  export function onConnectionChange(handler: (connected: boolean) => void): () => void {
    getSocket();
    connectionHandlers.add(handler);
    return () => {
      connectionHandlers.delete(handler);
    };
  }

  /** Notifie chaque RE-connexion (jamais la première connexion). */
  export function onReconnect(handler: () => void): () => void {
    getSocket();
    reconnectHandlers.add(handler);
    return () => {
      reconnectHandlers.delete(handler);
    };
  }

  /** Signale la cellule focalisée (ou son abandon) aux collègues de la room. */
  export function emitCellFocus(payload: { rowId: string; colKey: string } | { rowId: null }): void {
    const current = getSocket();
    if (current.connected) {
      current.emit('cell.focus', payload);
    }
  }

  /**
   * Demande le verrou d'une cellule. Toute impossibilité (socket coupé, ack
   * expiré) vaut refus : on ne laisse jamais éditer sans verrou accordé.
   */
  export async function requestCellLock(rowId: string, colKey: string): Promise<LockAck> {
    const current = getSocket();
    if (!current.connected) {
      return { granted: false };
    }
    try {
      const ack = (await current
        .timeout(LOCK_ACK_TIMEOUT_MS)
        .emitWithAck('cell.lock.request', { rowId, colKey })) as LockAck;
      return ack;
    } catch {
      return { granted: false };
    }
  }

  /** Libère le verrou d'une cellule (fin d'édition, annulation). */
  export function releaseCellLock(rowId: string, colKey: string): void {
    const current = getSocket();
    if (current.connected) {
      current.emit('cell.lock.release', { rowId, colKey });
    }
  }

  /** Ferme la connexion (déconnexion applicative / logout). */
  export function disconnectSocket(): void {
    socket?.disconnect();
    socket = null;
    currentRoom = null;
    hasConnectedOnce = false;
  }

  /** Réinitialise l'état de module — usage strictement réservé aux tests. */
  export function __resetSocketForTests(): void {
    socket = null;
    currentRoom = null;
    hasConnectedOnce = false;
    connectionHandlers.clear();
    reconnectHandlers.clear();
  }
  ```

- [ ] **Étape 4: relancer le test**

  ```bash
  pnpm --filter @suivi/web test -- socket.spec.ts
  ```

  Résultat attendu : **PASS** — 11 tests verts.

- [ ] **Étape 5: commit**

  ```bash
  git add apps/web/src/lib/socket.ts apps/web/src/lib/socket.spec.ts
  git commit -m "feat(web): client Socket.IO typé (rooms, reconnexion, verrous)"
  ```

> À vérifier à l'exécution : (1) `socket.timeout(ms).emitWithAck(...)` existe depuis socket.io-client 4.6 — si la version installée est antérieure, remplacer par `new Promise((resolve) => current.emit('cell.lock.request', payload, resolve))` avec un `setTimeout` de repli ; (2) `io(options)` sans URL cible bien l'origine courante en navigateur (comportement documenté) — sinon utiliser `io(window.location.origin, options)`.

---

### Task 7.3: Store zustand — tranche co-édition et application des événements `row.*`

- **Files:**
  - Modify: `apps/web/src/lib/store.ts`
  - Test: `apps/web/src/lib/store.coedition.spec.ts`
- **Interfaces:**
  - Consomme : `AppState` / `useAppStore` (Feature 6), helpers `rowBelongsToView`, `upsertRow`, `removeRow`, `uniquePresence`, `cellKey` (Task 7.1).
  - Produit (ajouts à `AppState`, utilisés par les Tasks 7.4 → 7.9) :
    - `interface RemoteFocus { userId: string; rowId: string; colKey: string }`
    - `interface RemoteLock { rowId: string; colKey: string; user: UserDTO }`
    - champs : `users: UserDTO[]`, `connected: boolean`, `presence: UserDTO[]`, `focuses: Record<string, RemoteFocus>` (clé = `userId`), `locks: Record<string, RemoteLock>` (clé = `rowId:colKey`)
    - actions : `setConnected(connected: boolean): void`, `setPresence(users: UserDTO[]): void`, `setRemoteFocus(userId: string, rowId: string | null, colKey: string | null): void`, `setLock(lock: RemoteLock): void`, `clearLock(rowId: string, colKey: string): void`, `clearCoedition(): void`, `setUsers(users: UserDTO[]): void`, `replaceRow(row: RowDTO): void`, `setRowLocalValue(rowId: string, colKey: string, value: CellValue): void`, `applyRowCreated(row: RowDTO): void`, `applyRowUpdated(row: RowDTO, byUserId: string): void`, `applyRowDeleted(rowId: string): void`, `applyRowMoved(row: RowDTO): void`

- [ ] **Étape 1: écrire le test de la tranche co-édition (échec attendu)**

  Créer `apps/web/src/lib/store.coedition.spec.ts` :

  ```ts
  import { beforeEach, describe, expect, it } from 'vitest';
  import type { RowDTO, UserDTO } from '@suivi/shared';
  import { useAppStore } from './store';

  function row(over: Partial<RowDTO> = {}): RowDTO {
    return {
      id: 'row1',
      month: '2026-08',
      position: 1,
      data: { client: 'ARCADIA' },
      formats: {},
      version: 1,
      archived: false,
      updatedAt: '2026-08-10T10:00:00.000Z',
      ...over,
    };
  }

  const me: UserDTO = {
    id: 'me',
    email: 'me@test.fr',
    displayName: 'Moi Même',
    cursorColor: '#123456',
  };
  const bob: UserDTO = {
    id: 'bob',
    email: 'bob@test.fr',
    displayName: 'Bob Dupont',
    cursorColor: '#00FF00',
  };

  beforeEach(() => {
    useAppStore.setState({
      user: me,
      users: [me, bob],
      columns: [],
      rows: [],
      view: 'month',
      monthCourant: '2026-08',
      connected: true,
      presence: [],
      focuses: {},
      locks: {},
      toast: null,
    });
  });

  describe('présence et connexion', () => {
    it('mémorise l’état de connexion', () => {
      useAppStore.getState().setConnected(false);
      expect(useAppStore.getState().connected).toBe(false);
    });

    it('exclut l’utilisateur courant et dédoublonne la présence', () => {
      useAppStore.getState().setPresence([me, bob, bob]);
      expect(useAppStore.getState().presence.map((u) => u.id)).toEqual(['bob']);
    });
  });

  describe('focus distant', () => {
    it('enregistre le focus d’un collègue puis l’efface au blur', () => {
      useAppStore.getState().setRemoteFocus('bob', 'row1', 'client');
      expect(useAppStore.getState().focuses.bob).toEqual({
        userId: 'bob',
        rowId: 'row1',
        colKey: 'client',
      });
      useAppStore.getState().setRemoteFocus('bob', null, null);
      expect(useAppStore.getState().focuses.bob).toBeUndefined();
    });

    it('remplace le focus précédent du même collègue (une cellule à la fois)', () => {
      useAppStore.getState().setRemoteFocus('bob', 'row1', 'client');
      useAppStore.getState().setRemoteFocus('bob', 'row2', 'statut');
      expect(Object.keys(useAppStore.getState().focuses)).toEqual(['bob']);
      expect(useAppStore.getState().focuses.bob.rowId).toBe('row2');
    });
  });

  describe('verrous distants', () => {
    it('indexe un verrou par rowId:colKey puis le libère', () => {
      useAppStore.getState().setLock({ rowId: 'row1', colKey: 'statut', user: bob });
      expect(useAppStore.getState().locks['row1:statut'].user.id).toBe('bob');
      useAppStore.getState().clearLock('row1', 'statut');
      expect(useAppStore.getState().locks['row1:statut']).toBeUndefined();
    });

    it('clearCoedition remet à zéro présence, focus et verrous', () => {
      useAppStore.getState().setPresence([bob]);
      useAppStore.getState().setRemoteFocus('bob', 'row1', 'client');
      useAppStore.getState().setLock({ rowId: 'row1', colKey: 'statut', user: bob });
      useAppStore.getState().clearCoedition();
      expect(useAppStore.getState().presence).toEqual([]);
      expect(useAppStore.getState().focuses).toEqual({});
      expect(useAppStore.getState().locks).toEqual({});
    });
  });

  describe('row.created', () => {
    it('insère une ligne appartenant à la vue courante', () => {
      useAppStore.getState().applyRowCreated(row({ id: 'new', position: 2 }));
      expect(useAppStore.getState().rows.map((r) => r.id)).toEqual(['new']);
    });

    it('ignore une ligne d’un autre mois', () => {
      useAppStore.getState().applyRowCreated(row({ id: 'other', month: '2026-07' }));
      expect(useAppStore.getState().rows).toEqual([]);
    });
  });

  describe('row.updated', () => {
    it('applique la mise à jour d’un collègue', () => {
      useAppStore.setState({ rows: [row()] });
      useAppStore.getState().applyRowUpdated(
        row({ data: { client: 'BOULANGERIE' }, version: 2 }),
        'bob',
      );
      expect(useAppStore.getState().rows[0].data.client).toBe('BOULANGERIE');
      expect(useAppStore.getState().rows[0].version).toBe(2);
    });

    it('ignore l’écho de sa propre modification (déjà appliquée localement)', () => {
      useAppStore.setState({ rows: [row({ data: { client: 'LOCAL' }, version: 5 }) ] });
      useAppStore.getState().applyRowUpdated(row({ data: { client: 'ECHO' }, version: 5 }), 'me');
      expect(useAppStore.getState().rows[0].data.client).toBe('LOCAL');
    });

    it('ignore une version plus ancienne que celle déjà connue', () => {
      useAppStore.setState({ rows: [row({ version: 7, data: { client: 'RECENT' } })] });
      useAppStore.getState().applyRowUpdated(row({ version: 3, data: { client: 'VIEUX' } }), 'bob');
      expect(useAppStore.getState().rows[0].data.client).toBe('RECENT');
    });

    it('ignore la mise à jour d’une ligne absente de la vue', () => {
      useAppStore.getState().applyRowUpdated(row({ month: '2026-07' }), 'bob');
      expect(useAppStore.getState().rows).toEqual([]);
    });
  });

  describe('row.deleted', () => {
    it('retire la ligne supprimée', () => {
      useAppStore.setState({ rows: [row(), row({ id: 'row2', position: 2 })] });
      useAppStore.getState().applyRowDeleted('row1');
      expect(useAppStore.getState().rows.map((r) => r.id)).toEqual(['row2']);
    });
  });

  describe('row.moved', () => {
    it('fait ENTRER dans la vue une ligne déplacée vers le mois courant', () => {
      useAppStore.setState({ rows: [] });
      useAppStore.getState().applyRowMoved(row({ id: 'entrante', month: '2026-08' }));
      expect(useAppStore.getState().rows.map((r) => r.id)).toEqual(['entrante']);
    });

    it('fait SORTIR de la vue une ligne déplacée vers un autre mois', () => {
      useAppStore.setState({ rows: [row({ id: 'sortante' })] });
      useAppStore.getState().applyRowMoved(row({ id: 'sortante', month: '2026-09' }));
      expect(useAppStore.getState().rows).toEqual([]);
    });

    it('fait sortir de la vue mensuelle une ligne archivée', () => {
      useAppStore.setState({ rows: [row({ id: 'archivee' })] });
      useAppStore.getState().applyRowMoved(row({ id: 'archivee', archived: true }));
      expect(useAppStore.getState().rows).toEqual([]);
    });
  });

  describe('écriture locale optimiste', () => {
    it('setRowLocalValue change une valeur sans toucher à la version', () => {
      useAppStore.setState({ rows: [row()] });
      useAppStore.getState().setRowLocalValue('row1', 'client', 'SAISIE');
      expect(useAppStore.getState().rows[0].data.client).toBe('SAISIE');
      expect(useAppStore.getState().rows[0].version).toBe(1);
    });

    it('replaceRow remplace la ligne quelles que soient les règles de vue', () => {
      useAppStore.setState({ rows: [row()] });
      useAppStore.getState().replaceRow(row({ version: 9, data: { client: 'SERVEUR' } }));
      expect(useAppStore.getState().rows[0].version).toBe(9);
      expect(useAppStore.getState().rows[0].data.client).toBe('SERVEUR');
    });
  });
  ```

- [ ] **Étape 2: lancer le test**

  ```bash
  pnpm --filter @suivi/web test -- store.coedition.spec.ts
  ```

  Résultat attendu : **FAIL** — `useAppStore.getState().setConnected is not a function` (la tranche co-édition n'existe pas encore).

- [ ] **Étape 3: étendre le store**

  Dans `apps/web/src/lib/store.ts`, compléter les imports en tête de fichier :

  ```ts
  import type { CellValue, RowDTO, UserDTO } from '@suivi/shared';
  import { cellKey, removeRow, rowBelongsToView, uniquePresence, upsertRow } from './coedition';
  ```

  Ajouter les types exportés avant l'interface `AppState` :

  ```ts
  /** Cellule pointée par un collègue (une seule à la fois par utilisateur). */
  export interface RemoteFocus {
    userId: string;
    rowId: string;
    colKey: string;
  }

  /** Cellule verrouillée par un collègue en cours d'édition. */
  export interface RemoteLock {
    rowId: string;
    colKey: string;
    user: UserDTO;
  }

  ```

  Ajouter les champs et actions à l'interface `AppState` :

  ```ts
    // --- co-édition (Feature 7) ---
    /** Annuaire complet de l'équipe (GET /users), rechargé sur config.changed. */
    users: UserDTO[];
    connected: boolean;
    presence: UserDTO[];
    /** clé = userId */
    focuses: Record<string, RemoteFocus>;
    /** clé = `${rowId}:${colKey}` */
    locks: Record<string, RemoteLock>;
    setUsers(users: UserDTO[]): void;
    setConnected(connected: boolean): void;
    setPresence(users: UserDTO[]): void;
    setRemoteFocus(userId: string, rowId: string | null, colKey: string | null): void;
    setLock(lock: RemoteLock): void;
    clearLock(rowId: string, colKey: string): void;
    clearCoedition(): void;
    replaceRow(row: RowDTO): void;
    setRowLocalValue(rowId: string, colKey: string, value: CellValue): void;
    applyRowCreated(row: RowDTO): void;
    applyRowUpdated(row: RowDTO, byUserId: string): void;
    applyRowDeleted(rowId: string): void;
    applyRowMoved(row: RowDTO): void;
  ```

  Ajouter enfin dans le corps de `create<AppState>()((set, get) => ({ ... }))`,
  à la suite des champs existants de la Feature 6 :

  ```ts
    users: [],
    connected: false,
    presence: [],
    focuses: {},
    locks: {},

    setUsers: (users) => set({ users }),

    setConnected: (connected) => set({ connected }),

    setPresence: (users) => set({ presence: uniquePresence(users, get().user?.id ?? null) }),

    setRemoteFocus: (userId, rowId, colKey) =>
      set((state) => {
        const focuses = { ...state.focuses };
        if (rowId === null || colKey === null) {
          delete focuses[userId];
        } else {
          focuses[userId] = { userId, rowId, colKey };
        }
        return { focuses };
      }),

    setLock: (lock) =>
      set((state) => ({
        locks: { ...state.locks, [cellKey(lock.rowId, lock.colKey)]: lock },
      })),

    clearLock: (rowId, colKey) =>
      set((state) => {
        const locks = { ...state.locks };
        delete locks[cellKey(rowId, colKey)];
        return { locks };
      }),

    clearCoedition: () => set({ presence: [], focuses: {}, locks: {} }),

    replaceRow: (row) => set((state) => ({ rows: upsertRow(state.rows, row) })),

    setRowLocalValue: (rowId, colKey, value) =>
      set((state) => ({
        rows: state.rows.map((r) =>
          r.id === rowId ? { ...r, data: { ...r.data, [colKey]: value } } : r,
        ),
      })),

    applyRowCreated: (row) =>
      set((state) =>
        rowBelongsToView(row, state.view, state.monthCourant)
          ? { rows: upsertRow(state.rows, row) }
          : {},
      ),

    // L'écho de sa propre modification est ignoré : la valeur est déjà posée
    // localement (optimisme) puis confirmée par la réponse du PATCH.
    applyRowUpdated: (row, byUserId) =>
      set((state) => {
        if (byUserId === state.user?.id) {
          return {};
        }
        if (!rowBelongsToView(row, state.view, state.monthCourant)) {
          return {};
        }
        const known = state.rows.find((r) => r.id === row.id);
        if (known && known.version > row.version) {
          return {};
        }
        return { rows: upsertRow(state.rows, row) };
      }),

    applyRowDeleted: (rowId) => set((state) => ({ rows: removeRow(state.rows, rowId) })),

    // row.moved peut faire ENTRER la ligne dans la vue comme l'en faire SORTIR.
    applyRowMoved: (row) =>
      set((state) =>
        rowBelongsToView(row, state.view, state.monthCourant)
          ? { rows: upsertRow(state.rows, row) }
          : { rows: removeRow(state.rows, row.id) },
      ),
  ```

- [ ] **Étape 4: relancer le test**

  ```bash
  pnpm --filter @suivi/web test -- store.coedition.spec.ts
  ```

  Résultat attendu : **PASS** — 16 tests verts.

- [ ] **Étape 5: commit**

  ```bash
  git add apps/web/src/lib/store.ts apps/web/src/lib/store.coedition.spec.ts
  git commit -m "feat(web): tranche co-édition du store (présence, focus, verrous, événements row.*)"
  ```

> Le store de la Feature 6 est déclaré `create<AppState>()((set) => ({ … }))` : ajouter `get` à la signature (`(set, get)`) — `setPresence` en a besoin pour lire `get().user?.id`. C'est la seule modification de la ligne `create` ; aucun champ existant n'est touché.

---

### Task 7.4: Resynchronisation (reconnexion) et rechargement de configuration

- **Files:**
  - Create: `apps/web/src/lib/coedition-sync.ts`
  - Test: `apps/web/src/lib/coedition-sync.spec.ts`
- **Interfaces:**
  - Consomme : `apiFetch`, `ApiRequestError` (Feature 6), `useAppStore` (Task 7.3), `roomForView`, `rowsQueryForView` (Task 7.1), `GridView` (Feature 6), `joinRoom` (Task 7.2).
  - Produit :
    - `const RESYNC_ERROR_MESSAGE = 'Impossible de recharger les données — nouvelle tentative à la prochaine reconnexion'`
    - `resyncView(view: GridView, month: string, deps?: SyncDeps): Promise<void>`
    - `refreshConfig(scope: 'columns' | 'choices' | 'users', deps?: SyncDeps): Promise<void>`
    - `interface SyncDeps { redirectToLogin?: () => void }`

- [ ] **Étape 1: écrire le test de resynchronisation (échec attendu)**

  Créer `apps/web/src/lib/coedition-sync.spec.ts` :

  ```ts
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import type { ColumnDTO, RowDTO, UserDTO } from '@suivi/shared';
  import { ApiRequestError, apiFetch } from './api';
  import { RESYNC_ERROR_MESSAGE, refreshConfig, resyncView } from './coedition-sync';
  import { joinRoom } from './socket';
  import { useAppStore } from './store';

  vi.mock('./api');
  vi.mock('./socket');

  const column: ColumnDTO = {
    id: 'c1',
    key: 'client',
    label: 'CLIENT',
    type: 'TEXT',
    position: 1,
    width: 150,
    visible: true,
    choices: [],
  };

  const rowFromServer: RowDTO = {
    id: 'row1',
    month: '2026-08',
    position: 1,
    data: { client: 'ARCADIA' },
    formats: {},
    version: 3,
    archived: false,
    updatedAt: '2026-08-10T10:00:00.000Z',
  };

  const bob: UserDTO = {
    id: 'bob',
    email: 'bob@test.fr',
    displayName: 'Bob Dupont',
    cursorColor: '#00FF00',
  };

  beforeEach(() => {
    useAppStore.setState({
      user: null,
      users: [],
      columns: [],
      rows: [],
      view: 'month',
      monthCourant: '2026-08',
      connected: true,
      presence: [],
      focuses: {},
      locks: {},
      toast: null,
    });
  });

  describe('resyncView', () => {
    it('re-rejoint la room et recharge colonnes + lignes de la vue mensuelle', async () => {
      vi.mocked(apiFetch).mockImplementation(async (path: string) => {
        if (path === '/columns') return [column] as never;
        if (path === '/rows?month=2026-08') return [rowFromServer] as never;
        throw new Error(`chemin inattendu: ${path}`);
      });

      await resyncView('month', '2026-08');

      expect(joinRoom).toHaveBeenCalledWith('month:2026-08');
      expect(useAppStore.getState().columns).toEqual([column]);
      expect(useAppStore.getState().rows).toEqual([rowFromServer]);
    });

    it('recharge les archives dans la vue archives', async () => {
      vi.mocked(apiFetch).mockResolvedValue([] as never);
      await resyncView('archives', '2026-08');
      expect(joinRoom).toHaveBeenCalledWith('archives');
      expect(apiFetch).toHaveBeenCalledWith('/rows?archived=true');
    });

    it('purge focus et verrous périmés avant de recharger', async () => {
      useAppStore.setState({
        focuses: { bob: { userId: 'bob', rowId: 'row1', colKey: 'client' } },
        locks: { 'row1:client': { rowId: 'row1', colKey: 'client', user: bob } },
      });
      vi.mocked(apiFetch).mockResolvedValue([] as never);
      await resyncView('month', '2026-08');
      expect(useAppStore.getState().focuses).toEqual({});
      expect(useAppStore.getState().locks).toEqual({});
    });

    it('affiche un toast et conserve les données en cas d’échec réseau', async () => {
      useAppStore.setState({ rows: [rowFromServer] });
      vi.mocked(apiFetch).mockRejectedValue(new Error('Failed to fetch'));

      await resyncView('month', '2026-08');

      expect(useAppStore.getState().rows).toEqual([rowFromServer]);
      expect(useAppStore.getState().toast?.message).toBe(RESYNC_ERROR_MESSAGE);
      expect(useAppStore.getState().toast?.kind).toBe('error');
    });

    it('redirige vers /login quand la session a expiré (AUTH_REQUIRED)', async () => {
      const error = new ApiRequestError('AUTH_REQUIRED', 'Vous devez être connecté', 401);
      vi.mocked(apiFetch).mockRejectedValue(error);
      const redirectToLogin = vi.fn();

      await resyncView('month', '2026-08', { redirectToLogin });

      expect(redirectToLogin).toHaveBeenCalledTimes(1);
      expect(useAppStore.getState().toast).toBeNull();
    });
  });

  describe('refreshConfig', () => {
    it('recharge les colonnes pour le scope columns', async () => {
      vi.mocked(apiFetch).mockResolvedValue([column] as never);
      await refreshConfig('columns');
      expect(apiFetch).toHaveBeenCalledWith('/columns');
      expect(useAppStore.getState().columns).toEqual([column]);
    });

    it('recharge les colonnes pour le scope choices (les choix y sont imbriqués)', async () => {
      vi.mocked(apiFetch).mockResolvedValue([column] as never);
      await refreshConfig('choices');
      expect(apiFetch).toHaveBeenCalledWith('/columns');
      expect(useAppStore.getState().columns).toEqual([column]);
    });

    it('recharge les membres pour le scope users', async () => {
      vi.mocked(apiFetch).mockResolvedValue([bob] as never);
      await refreshConfig('users');
      expect(apiFetch).toHaveBeenCalledWith('/users');
      expect(useAppStore.getState().users).toEqual([bob]);
    });

    it('affiche un toast en cas d’échec', async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error('Failed to fetch'));
      await refreshConfig('columns');
      expect(useAppStore.getState().toast?.message).toBe(RESYNC_ERROR_MESSAGE);
    });
  });
  ```

- [ ] **Étape 2: lancer le test**

  ```bash
  pnpm --filter @suivi/web test -- coedition-sync.spec.ts
  ```

  Résultat attendu : **FAIL** — `Cannot find module './coedition-sync' from 'src/lib/coedition-sync.spec.ts'`.

- [ ] **Étape 3: implémenter la resynchronisation**

  Créer `apps/web/src/lib/coedition-sync.ts` :

  ```ts
  'use client';

  import type { ColumnDTO, RowDTO, UserDTO } from '@suivi/shared';
  import { ApiRequestError, apiFetch } from './api';
  import { roomForView, rowsQueryForView } from './coedition';
  import type { GridView } from './store';
  import { joinRoom } from './socket';
  import { useAppStore } from './store';

  export const RESYNC_ERROR_MESSAGE =
    'Impossible de recharger les données — nouvelle tentative à la prochaine reconnexion';

  export interface SyncDeps {
    /** Injectable pour les tests ; par défaut, navigation vers /login. */
    redirectToLogin?: () => void;
  }

  function defaultRedirectToLogin(): void {
    if (typeof window !== 'undefined') {
      window.location.assign('/login');
    }
  }

  function handleSyncError(error: unknown, deps: SyncDeps): void {
    const redirect = deps.redirectToLogin ?? defaultRedirectToLogin;
    if (error instanceof ApiRequestError && error.code === 'AUTH_REQUIRED') {
      redirect();
      return;
    }
    useAppStore.getState().showToast(RESYNC_ERROR_MESSAGE, 'error');
  }

  /**
   * Resynchronisation complète après une reconnexion du socket : la room est
   * rejointe et l'état affiché est reconstruit depuis le serveur (les
   * événements survenus pendant la coupure sont définitivement perdus).
   */
  export async function resyncView(
    view: GridView,
    month: string,
    deps: SyncDeps = {},
  ): Promise<void> {
    joinRoom(roomForView(view, month));
    // Les focus/verrous mémorisés datent d'avant la coupure : ils sont faux.
    useAppStore.getState().clearCoedition();
    try {
      const [columns, rows] = await Promise.all([
        apiFetch<ColumnDTO[]>('/columns'),
        apiFetch<RowDTO[]>(rowsQueryForView(view, month)),
      ]);
      useAppStore.getState().setColumns(columns);
      useAppStore.getState().setRows(rows);
    } catch (error) {
      handleSyncError(error, deps);
    }
  }

  /** Réaction à config.changed : recharge la configuration concernée. */
  export async function refreshConfig(
    scope: 'columns' | 'choices' | 'users',
    deps: SyncDeps = {},
  ): Promise<void> {
    try {
      if (scope === 'users') {
        useAppStore.getState().setUsers(await apiFetch<UserDTO[]>('/users'));
        return;
      }
      // Les choix de listes sont imbriqués dans ColumnDTO.choices : un seul
      // appel couvre les scopes « columns » et « choices ».
      useAppStore.getState().setColumns(await apiFetch<ColumnDTO[]>('/columns'));
    } catch (error) {
      handleSyncError(error, deps);
    }
  }
  ```

- [ ] **Étape 4: relancer le test**

  ```bash
  pnpm --filter @suivi/web test -- coedition-sync.spec.ts
  ```

  Résultat attendu : **PASS** — 9 tests verts.

- [ ] **Étape 5: commit**

  ```bash
  git add apps/web/src/lib/coedition-sync.ts apps/web/src/lib/coedition-sync.spec.ts
  git commit -m "feat(web): resynchronisation complète à la reconnexion et rechargement de config"
  ```


---

### Task 7.5: PresenceBar réelle et bandeau de connexion perdue

- **Files:**
  - Modify: `apps/web/src/components/grid/PresenceBar.tsx`, `apps/web/src/app/(app)/layout.tsx`
  - Create: `apps/web/src/components/grid/ConnectionBanner.tsx`, `apps/web/src/components/grid/presence-bar.css`
  - Test: `apps/web/src/components/grid/PresenceBar.spec.tsx`
- **Interfaces:**
  - Consomme : `useAppStore` avec `presence`, `connected` (Task 7.3), `initialsOf` (Task 7.1). Les toasts sont ceux de la Feature 6 (`toast` / `showToast` / `hideToast`, rendus par `DataGrid.tsx`) : rien n'est ajouté ici.
  - Produit :
    - `PresenceBar(): JSX.Element` (export nommé **et** par défaut)
    - `CONNECTION_LOST_MESSAGE = 'Connexion perdue — reconnexion...'`
    - `ConnectionBanner(): JSX.Element | null` (export nommé et par défaut)

- [ ] **Étape 1: écrire le test des composants (échec attendu)**

  Créer `apps/web/src/components/grid/PresenceBar.spec.tsx` :

  ```tsx
  import { beforeEach, describe, expect, it } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import type { UserDTO } from '@suivi/shared';
  import { useAppStore } from '../../lib/store';
  import { ConnectionBanner, CONNECTION_LOST_MESSAGE } from './ConnectionBanner';
  import { PresenceBar } from './PresenceBar';

  const me: UserDTO = { id: 'me', email: 'me@test.fr', displayName: 'Moi Même', cursorColor: '#123456' };
  const bob: UserDTO = { id: 'bob', email: 'bob@test.fr', displayName: 'Bob Dupont', cursorColor: '#00FF00' };
  const zoe: UserDTO = { id: 'zoe', email: 'zoe@test.fr', displayName: 'Zoé', cursorColor: '#FF00FF' };

  beforeEach(() => {
    useAppStore.setState({
      user: me,
      users: [me, bob, zoe],
      columns: [],
      rows: [],
      view: 'month',
      monthCourant: '2026-08',
      connected: true,
      presence: [],
      focuses: {},
      locks: {},
      toast: null,
    });
  });

  describe('PresenceBar', () => {
    it("affiche un avatar par collègue avec ses initiales, sa couleur et son nom en infobulle", () => {
      useAppStore.setState({ presence: [bob, zoe] });
      render(<PresenceBar />);

      const avatarBob = screen.getByTestId('presence-bob');
      expect(avatarBob).toHaveTextContent('BD');
      expect(avatarBob).toHaveAttribute('title', 'Bob Dupont');
      expect(avatarBob).toHaveStyle({ backgroundColor: '#00FF00' });

      const avatarZoe = screen.getByTestId('presence-zoe');
      expect(avatarZoe).toHaveTextContent('ZO');
      expect(avatarZoe).toHaveAttribute('title', 'Zoé');
    });

    it('affiche « Seul(e) sur cette vue » quand personne d’autre n’est connecté', () => {
      render(<PresenceBar />);
      expect(screen.getByTestId('presence-bar')).toHaveTextContent('Seul(e) sur cette vue');
    });
  });

  describe('ConnectionBanner', () => {
    it('reste invisible tant que le socket est connecté', () => {
      render(<ConnectionBanner />);
      expect(screen.queryByTestId('connection-banner')).toBeNull();
    });

    it('affiche le bandeau de reconnexion quand le socket tombe', () => {
      useAppStore.setState({ connected: false });
      render(<ConnectionBanner />);
      const banner = screen.getByTestId('connection-banner');
      expect(banner).toHaveTextContent(CONNECTION_LOST_MESSAGE);
      expect(banner).toHaveAttribute('role', 'status');
    });
  });

  ```

- [ ] **Étape 2: lancer le test**

  ```bash
  pnpm --filter @suivi/web test -- PresenceBar.spec.tsx
  ```

  Résultat attendu : **FAIL** — `Cannot find module './ConnectionBanner'` ; le placeholder `PresenceBar` de la Feature 6 n'expose pas `presence-bar`.

- [ ] **Étape 3: implémenter les deux composants et leur CSS**

  Créer `apps/web/src/components/grid/presence-bar.css` :

  ```css
  .presence-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #555;
  }

  .presence-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.55);
    cursor: default;
    user-select: none;
  }

  .connection-banner {
    padding: 6px 12px;
    background: #ffa600;
    color: #7a3d00;
    font-weight: 700;
    font-size: 13px;
    text-align: center;
  }

  ```

  Remplacer intégralement `apps/web/src/components/grid/PresenceBar.tsx` :

  ```tsx
  'use client';

  import { initialsOf } from '../../lib/coedition';
  import { useAppStore } from '../../lib/store';
  import './presence-bar.css';

  /**
   * Avatars des collègues présents dans la room de la vue courante.
   * L'utilisateur connecté n'y figure pas (filtré par le store).
   */
  export function PresenceBar() {
    const presence = useAppStore((state) => state.presence);

    return (
      <div className="presence-bar" data-testid="presence-bar" aria-label="Collègues connectés">
        {presence.length === 0 ? (
          <span className="presence-empty">Seul(e) sur cette vue</span>
        ) : (
          presence.map((user) => (
            <span
              key={user.id}
              className="presence-avatar"
              data-testid={`presence-${user.id}`}
              title={user.displayName}
              aria-label={user.displayName}
              style={{ backgroundColor: user.cursorColor }}
            >
              {initialsOf(user.displayName)}
            </span>
          ))
        )}
      </div>
    );
  }

  export default PresenceBar;
  ```

  Créer `apps/web/src/components/grid/ConnectionBanner.tsx` :

  ```tsx
  'use client';

  import { useAppStore } from '../../lib/store';
  import './presence-bar.css';

  export const CONNECTION_LOST_MESSAGE = 'Connexion perdue — reconnexion...';

  /** Bandeau permanent tant que le socket n'est pas reconnecté. */
  export function ConnectionBanner() {
    const connected = useAppStore((state) => state.connected);

    if (connected) {
      return null;
    }

    return (
      <div className="connection-banner" data-testid="connection-banner" role="status">
        {CONNECTION_LOST_MESSAGE}
      </div>
    );
  }

  export default ConnectionBanner;
  ```

- [ ] **Étape 4: brancher le bandeau dans le layout applicatif**

  `apps/web/src/app/(app)/layout.tsx` porte la **barre du haut unifiée** (Feature 6,
  Task 6.11) : il rend `<AppHeader user={user} />`, lequel contient déjà le logo, la
  `SearchBar`, la `PresenceBar` et le menu compte (profil + `LogoutButton`). La
  `PresenceBar` est donc montée **une seule fois**, dans ce header ; la présente task
  n'en change pas l'emplacement, elle remplace seulement son **contenu** (avatars
  réels) via le fichier `PresenceBar.tsx` ci-dessus. La seule modification du layout
  ici est l'insertion de `<ConnectionBanner />` juste sous `<AppHeader />`. Le toast
  est déjà rendu par `DataGrid.tsx` (Feature 6, Task 6.8) : rien à ajouter.

  Contenu final complet du fichier :

  ```tsx
  import { cookies } from 'next/headers';
  import { redirect } from 'next/navigation';
  import type { ReactNode } from 'react';
  import type { UserDTO } from '@suivi/shared';
  import { AppHeader } from '../../components/AppHeader';
  import ConnectionBanner from '../../components/grid/ConnectionBanner';
  import { serverApiBaseUrl } from '../../lib/api';

  /**
   * Vérifie la session côté serveur : le middleware ne contrôle que la
   * PRÉSENCE du cookie, jamais sa validité (il ne peut pas vérifier la
   * signature JWT). C'est ce fetch qui tranche.
   */
  async function fetchCurrentUser(): Promise<UserDTO | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get('token');
    if (!token) {
      return null;
    }
    const response = await fetch(`${serverApiBaseUrl()}/api/auth/me`, {
      headers: { cookie: `token=${token.value}` },
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { user: UserDTO };
    return body.user;
  }

  export default async function AppLayout({ children }: { children: ReactNode }) {
    const user = await fetchCurrentUser();
    if (!user) {
      redirect('/login');
    }

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
        <ConnectionBanner />
        <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
      </div>
    );
  }
  ```

- [ ] **Étape 5: relancer le test**

  ```bash
  pnpm --filter @suivi/web test -- PresenceBar.spec.tsx
  ```

  Résultat attendu : **PASS** — 4 tests verts.

- [ ] **Étape 6: commit**

  ```bash
  git add apps/web/src/components/grid/PresenceBar.tsx apps/web/src/components/grid/PresenceBar.spec.tsx apps/web/src/components/grid/ConnectionBanner.tsx apps/web/src/components/grid/presence-bar.css "apps/web/src/app/(app)/layout.tsx"
  git commit -m "feat(web): présence en avatars et bandeau de connexion perdue"
  ```

> À vérifier à l'exécution : `toHaveStyle({ backgroundColor: '#00FF00' })` — jsdom normalise parfois la couleur en `rgb(0, 255, 0)` ; si l'assertion échoue, comparer `avatarBob.style.backgroundColor` à `'rgb(0, 255, 0)'`. Par ailleurs, l'import d'un `.css` depuis `src/components` est supporté par l'App Router de Next 15 ; en cas de refus au build, déplacer le contenu de `presence-bar.css` dans le CSS global importé par `app/layout.tsx`.

---

### Task 7.6: Décoration des cellules — focus distant et verrou

- **Files:**
  - Create: `apps/web/src/lib/coedition-cell.ts`, `apps/web/src/components/grid/coedition.css`
  - Test: `apps/web/src/lib/coedition-cell.spec.ts`
- **Interfaces:**
  - Consomme : `RemoteFocus`, `RemoteLock` (Task 7.3), `cellKey` (Task 7.1), `UserDTO`.
  - Produit :
    - `interface CellCoeditionState { focuses: Record<string, RemoteFocus>; locks: Record<string, RemoteLock>; presence: UserDTO[]; meId: string | null }`
    - `interface CellDecoration { focusedBy: UserDTO | null; lockedBy: UserDTO | null }`
    - `decorateCell(rowId: string, colKey: string, state: CellCoeditionState): CellDecoration`
    - `cellStyleFor(decoration: CellDecoration): Record<string, string> | null`
    - `isLockedByOther(rowId: string, colKey: string, state: CellCoeditionState): boolean`
    - classes CSS `coedition-focus` et `coedition-locked`, variables `--coedition-color` / `--coedition-label`

- [ ] **Étape 1: écrire le test de décoration (échec attendu)**

  Créer `apps/web/src/lib/coedition-cell.spec.ts` :

  ```ts
  import { describe, expect, it } from 'vitest';
  import type { UserDTO } from '@suivi/shared';
  import {
    cellStyleFor,
    decorateCell,
    isLockedByOther,
    type CellCoeditionState,
  } from './coedition-cell';

  const bob: UserDTO = { id: 'bob', email: 'bob@test.fr', displayName: 'Bob Dupont', cursorColor: '#00FF00' };
  const me: UserDTO = { id: 'me', email: 'me@test.fr', displayName: 'Moi Même', cursorColor: '#123456' };

  function state(over: Partial<CellCoeditionState> = {}): CellCoeditionState {
    return { focuses: {}, locks: {}, presence: [bob], meId: 'me', ...over };
  }

  describe('decorateCell', () => {
    it('ne décore pas une cellule libre', () => {
      expect(decorateCell('row1', 'client', state())).toEqual({ focusedBy: null, lockedBy: null });
    });

    it('associe le focus distant à l’utilisateur présent correspondant', () => {
      const decoration = decorateCell(
        'row1',
        'client',
        state({ focuses: { bob: { userId: 'bob', rowId: 'row1', colKey: 'client' } } }),
      );
      expect(decoration.focusedBy).toEqual(bob);
      expect(decoration.lockedBy).toBeNull();
    });

    it('ignore le focus d’un utilisateur absent de la présence', () => {
      const decoration = decorateCell(
        'row1',
        'client',
        state({
          presence: [],
          focuses: { bob: { userId: 'bob', rowId: 'row1', colKey: 'client' } },
        }),
      );
      expect(decoration.focusedBy).toBeNull();
    });

    it('ignore le focus sur une AUTRE cellule', () => {
      const decoration = decorateCell(
        'row1',
        'statut',
        state({ focuses: { bob: { userId: 'bob', rowId: 'row1', colKey: 'client' } } }),
      );
      expect(decoration.focusedBy).toBeNull();
    });

    it('remonte le détenteur du verrou', () => {
      const decoration = decorateCell(
        'row1',
        'client',
        state({ locks: { 'row1:client': { rowId: 'row1', colKey: 'client', user: bob } } }),
      );
      expect(decoration.lockedBy).toEqual(bob);
    });

    it('ignore un verrou détenu par soi-même (édition en cours locale)', () => {
      const decoration = decorateCell(
        'row1',
        'client',
        state({ locks: { 'row1:client': { rowId: 'row1', colKey: 'client', user: me } } }),
      );
      expect(decoration.lockedBy).toBeNull();
    });
  });

  describe('isLockedByOther', () => {
    it('vrai uniquement quand un collègue détient le verrou', () => {
      const locked = state({ locks: { 'row1:client': { rowId: 'row1', colKey: 'client', user: bob } } });
      expect(isLockedByOther('row1', 'client', locked)).toBe(true);
      expect(isLockedByOther('row1', 'statut', locked)).toBe(false);
      const mine = state({ locks: { 'row1:client': { rowId: 'row1', colKey: 'client', user: me } } });
      expect(isLockedByOther('row1', 'client', mine)).toBe(false);
    });
  });

  describe('cellStyleFor', () => {
    it('rend null quand rien n’est à décorer', () => {
      expect(cellStyleFor({ focusedBy: null, lockedBy: null })).toBeNull();
    });

    it('expose la couleur du collègue et son nom en variables CSS', () => {
      expect(cellStyleFor({ focusedBy: bob, lockedBy: null })).toEqual({
        '--coedition-color': '#00FF00',
        '--coedition-label': '"Bob Dupont"',
      });
    });

    it('donne la priorité au verrou sur le focus', () => {
      const other: UserDTO = { ...bob, id: 'zoe', displayName: 'Zoé', cursorColor: '#FF00FF' };
      expect(cellStyleFor({ focusedBy: other, lockedBy: bob })).toEqual({
        '--coedition-color': '#00FF00',
        '--coedition-label': '"Bob Dupont"',
      });
    });

    it('échappe les guillemets du nom dans l’étiquette CSS', () => {
      const tricky: UserDTO = { ...bob, displayName: 'Bob "Le Grand"' };
      expect(cellStyleFor({ focusedBy: tricky, lockedBy: null })).toEqual({
        '--coedition-color': '#00FF00',
        '--coedition-label': '"Bob \\"Le Grand\\""',
      });
    });
  });
  ```

- [ ] **Étape 2: lancer le test**

  ```bash
  pnpm --filter @suivi/web test -- coedition-cell.spec.ts
  ```

  Résultat attendu : **FAIL** — `Cannot find module './coedition-cell' from 'src/lib/coedition-cell.spec.ts'`.

- [ ] **Étape 3: implémenter la décoration**

  Créer `apps/web/src/lib/coedition-cell.ts` :

  ```ts
  import type { UserDTO } from '@suivi/shared';
  import { cellKey } from './coedition';
  import type { RemoteFocus, RemoteLock } from './store';

  /** Sous-ensemble du store nécessaire pour décorer une cellule. */
  export interface CellCoeditionState {
    focuses: Record<string, RemoteFocus>;
    locks: Record<string, RemoteLock>;
    presence: UserDTO[];
    meId: string | null;
  }

  export interface CellDecoration {
    /** Collègue dont le curseur est sur la cellule (bordure + étiquette). */
    focusedBy: UserDTO | null;
    /** Collègue qui édite la cellule (hachures + non éditable). */
    lockedBy: UserDTO | null;
  }

  export function decorateCell(
    rowId: string,
    colKey: string,
    state: CellCoeditionState,
  ): CellDecoration {
    const focus = Object.values(state.focuses).find(
      (f) => f.rowId === rowId && f.colKey === colKey && f.userId !== state.meId,
    );
    const focusedBy = focus
      ? (state.presence.find((user) => user.id === focus.userId) ?? null)
      : null;

    const lock = state.locks[cellKey(rowId, colKey)];
    const lockedBy = lock && lock.user.id !== state.meId ? lock.user : null;

    return { focusedBy, lockedBy };
  }

  export function isLockedByOther(
    rowId: string,
    colKey: string,
    state: CellCoeditionState,
  ): boolean {
    return decorateCell(rowId, colKey, state).lockedBy !== null;
  }

  /**
   * Variables CSS injectées en style inline sur la cellule AG Grid.
   * `--coedition-label` contient une chaîne CSS déjà entre guillemets, prête
   * pour `content: var(--coedition-label)`.
   */
  export function cellStyleFor(decoration: CellDecoration): Record<string, string> | null {
    const user = decoration.lockedBy ?? decoration.focusedBy;
    if (!user) {
      return null;
    }
    const label = user.displayName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return {
      '--coedition-color': user.cursorColor,
      '--coedition-label': `"${label}"`,
    };
  }
  ```

  Créer `apps/web/src/components/grid/coedition.css` :

  ```css
  /* Cellule pointée par un collègue : bordure 2px à sa couleur + étiquette. */
  .coedition-focus {
    position: relative;
    box-shadow: inset 0 0 0 2px var(--coedition-color, #888);
  }

  .coedition-focus::after {
    content: var(--coedition-label, "");
    position: absolute;
    top: -15px;
    left: -2px;
    z-index: 5;
    padding: 0 4px;
    border-radius: 2px;
    background: var(--coedition-color, #888);
    color: #fff;
    font-size: 10px;
    line-height: 15px;
    white-space: nowrap;
    pointer-events: none;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
  }

  /* Cellule en cours d'édition par un collègue : hachures + curseur interdit. */
  .coedition-locked {
    cursor: not-allowed;
    background-image: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 4px,
      var(--coedition-color, #888) 4px,
      var(--coedition-color, #888) 6px
    );
  }

  /* L'étiquette de focus doit pouvoir déborder de la cellule. */
  .ag-theme-quartz .ag-cell.coedition-focus {
    overflow: visible;
  }
  ```

- [ ] **Étape 4: relancer le test**

  ```bash
  pnpm --filter @suivi/web test -- coedition-cell.spec.ts
  ```

  Résultat attendu : **PASS** — 11 tests verts.

- [ ] **Étape 5: commit**

  ```bash
  git add apps/web/src/lib/coedition-cell.ts apps/web/src/lib/coedition-cell.spec.ts apps/web/src/components/grid/coedition.css
  git commit -m "feat(web): décoration des cellules focalisées et verrouillées par un collègue"
  ```

> À vérifier à l'exécution : (1) `content: var(--coedition-label)` fonctionne dans les navigateurs cibles (Chrome/Firefox récents) — si l'étiquette n'apparaît pas, remplacer le pseudo-élément par un `cellRenderer` ajoutant un `<span class="coedition-tag">` ; (2) le sélecteur `.ag-theme-quartz` doit correspondre au thème AG Grid retenu en Feature 6 (`ag-theme-quartz` par défaut en v34) — sinon adapter le nom de classe.

---

### Task 7.7: Hook `useCoedition` — abonnements, focus émis et verrous d'édition

- **Files:**
  - Create: `apps/web/src/components/grid/useCoedition.ts`
  - Test: `apps/web/src/components/grid/useCoedition.spec.tsx`
- **Interfaces:**
  - Consomme : `joinRoom`, `onEvent`, `onConnectionChange`, `onReconnect`, `emitCellFocus`, `requestCellLock`, `releaseCellLock` (Task 7.2) ; `useAppStore` (Task 7.3) ; `resyncView`, `refreshConfig` (Task 7.4) ; `decorateCell`, `cellStyleFor`, `isLockedByOther` (Task 7.6) ; `roomForView` (Task 7.1), `GridView` (Feature 6).
  - Produit :
    - `const LOCK_RENEW_INTERVAL_MS = 10_000`
    - `const lockedToastMessage(displayName: string): string` → `` `${displayName} édite cette cellule` ``
    - `interface CoeditionBindings { onCellFocused; onCellEditingStarted; onCellEditingStopped; cellClassRules; cellStyle; isCellEditable }`
    - `useCoedition(view: GridView, month: string, gridApi: GridApi | null): CoeditionBindings`

- [ ] **Étape 1: écrire le test du hook (échec attendu)**

  Créer `apps/web/src/components/grid/useCoedition.spec.tsx` :

  ```tsx
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
  import { act, renderHook } from '@testing-library/react';
  import type { UserDTO } from '@suivi/shared';
  import {
    emitCellFocus,
    joinRoom,
    onConnectionChange,
    onEvent,
    onReconnect,
    releaseCellLock,
    requestCellLock,
  } from '../../lib/socket';
  import { refreshConfig, resyncView } from '../../lib/coedition-sync';
  import { useAppStore } from '../../lib/store';
  import { LOCK_RENEW_INTERVAL_MS, lockedToastMessage, useCoedition } from './useCoedition';

  vi.mock('../../lib/socket');
  vi.mock('../../lib/coedition-sync', () => ({
    resyncView: vi.fn().mockResolvedValue(undefined),
    refreshConfig: vi.fn().mockResolvedValue(undefined),
  }));

  // Le module est mocké ci-dessus : l'import statique rend les mocks eux-mêmes.
  const sync = { resyncView: vi.mocked(resyncView), refreshConfig: vi.mocked(refreshConfig) };

  const me: UserDTO = { id: 'me', email: 'me@test.fr', displayName: 'Moi Même', cursorColor: '#123456' };
  const bob: UserDTO = { id: 'bob', email: 'bob@test.fr', displayName: 'Bob Dupont', cursorColor: '#00FF00' };

  /** Faux GridApi : uniquement les méthodes utilisées par le hook. */
  function fakeGridApi() {
    return {
      stopEditing: vi.fn(),
      refreshCells: vi.fn(),
      flashCells: vi.fn(),
      getDisplayedRowAtIndex: vi.fn(() => ({ data: { id: 'row1' } })),
    };
  }

  /** Capture les handlers passés à onEvent pour pouvoir les déclencher. */
  function serverEmit(event: string, payload: unknown): void {
    for (const call of vi.mocked(onEvent).mock.calls) {
      if (call[0] === event) {
        (call[1] as (p: unknown) => void)(payload);
      }
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.setState({
      user: me,
      users: [me, bob],
      columns: [],
      rows: [],
      view: 'month',
      monthCourant: '2026-08',
      connected: true,
      presence: [],
      focuses: {},
      locks: {},
      toast: null,
    });
    vi.mocked(onEvent).mockReturnValue(() => undefined);
    vi.mocked(onConnectionChange).mockReturnValue(() => undefined);
    vi.mocked(onReconnect).mockReturnValue(() => undefined);
    vi.mocked(requestCellLock).mockResolvedValue({ granted: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('abonnements', () => {
    it('rejoint la room de la vue au montage', () => {
      renderHook(() => useCoedition('month', '2026-08', fakeGridApi() as never));
      expect(joinRoom).toHaveBeenCalledWith('month:2026-08');
    });

    it('alimente le store depuis presence, cell.focus, cell.lock et cell.unlock', () => {
      renderHook(() => useCoedition('month', '2026-08', fakeGridApi() as never));

      act(() => serverEmit('presence', { users: [{ ...me, socketId: 's1' }, { ...bob, socketId: 's2' }] }));
      expect(useAppStore.getState().presence.map((u) => u.id)).toEqual(['bob']);

      act(() => serverEmit('cell.focus', { userId: 'bob', rowId: 'row1', colKey: 'client' }));
      expect(useAppStore.getState().focuses.bob.colKey).toBe('client');

      act(() => serverEmit('cell.lock', { rowId: 'row1', colKey: 'statut', user: bob }));
      expect(useAppStore.getState().locks['row1:statut'].user.id).toBe('bob');

      act(() => serverEmit('cell.unlock', { rowId: 'row1', colKey: 'statut' }));
      expect(useAppStore.getState().locks['row1:statut']).toBeUndefined();
    });

    it('applique les événements row.* au store', () => {
      const row = {
        id: 'row9',
        month: '2026-08',
        position: 1,
        data: { client: 'ARCADIA' },
        formats: {},
        version: 1,
        archived: false,
        updatedAt: '2026-08-10T10:00:00.000Z',
      };
      renderHook(() => useCoedition('month', '2026-08', fakeGridApi() as never));

      act(() => serverEmit('row.created', { row }));
      expect(useAppStore.getState().rows.map((r) => r.id)).toEqual(['row9']);

      act(() =>
        serverEmit('row.updated', {
          row: { ...row, data: { client: 'BOULANGERIE' }, version: 2 },
          changedKeys: ['client'],
          byUserId: 'bob',
        }),
      );
      expect(useAppStore.getState().rows[0].data.client).toBe('BOULANGERIE');

      act(() => serverEmit('row.moved', { row: { ...row, month: '2026-09' }, fromMonth: '2026-08' }));
      expect(useAppStore.getState().rows).toEqual([]);

      act(() => serverEmit('row.created', { row }));
      act(() => serverEmit('row.deleted', { rowId: 'row9' }));
      expect(useAppStore.getState().rows).toEqual([]);
    });

    it('recharge la configuration sur config.changed', () => {
      renderHook(() => useCoedition('month', '2026-08', fakeGridApi() as never));
      act(() => serverEmit('config.changed', { scope: 'choices' }));
      expect(sync.refreshConfig).toHaveBeenCalledWith('choices');
      act(() => serverEmit('config.changed', { scope: 'users' }));
      expect(sync.refreshConfig).toHaveBeenCalledWith('users');
    });

    it('resynchronise complètement à la reconnexion et suit l’état de connexion', () => {
      renderHook(() => useCoedition('month', '2026-08', fakeGridApi() as never));

      const connectionHandler = vi.mocked(onConnectionChange).mock.calls[0][0];
      act(() => connectionHandler(false));
      expect(useAppStore.getState().connected).toBe(false);

      const reconnectHandler = vi.mocked(onReconnect).mock.calls[0][0];
      act(() => reconnectHandler());
      expect(sync.resyncView).toHaveBeenCalledWith('month', '2026-08');
    });
  });

  describe('focus émis', () => {
    it('émet cell.focus à chaque changement de cellule focalisée', () => {
      const api = fakeGridApi();
      const { result } = renderHook(() =>
        useCoedition('month', '2026-08', api as never),
      );

      act(() =>
        result.current.onCellFocused({
          api,
          rowIndex: 0,
          column: { getColId: () => 'client' },
        } as never),
      );
      expect(emitCellFocus).toHaveBeenCalledWith({ rowId: 'row1', colKey: 'client' });

      act(() => result.current.onCellFocused({ api, rowIndex: null, column: null } as never));
      expect(emitCellFocus).toHaveBeenCalledWith({ rowId: null });
    });
  });

  describe('verrous d’édition', () => {
    it('laisse éditer quand le verrou est accordé et le renouvelle toutes les 10 s', async () => {
      const api = fakeGridApi();
      const { result } = renderHook(() =>
        useCoedition('month', '2026-08', api as never),
      );

      await act(async () => {
        await result.current.onCellEditingStarted({
          data: { id: 'row1' },
          column: { getColId: () => 'client' },
        } as never);
      });

      expect(requestCellLock).toHaveBeenCalledWith('row1', 'client');
      expect(api.stopEditing).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(LOCK_RENEW_INTERVAL_MS * 2);
      });
      expect(requestCellLock).toHaveBeenCalledTimes(3); // 1 demande + 2 renouvellements
    });

    it('annule l’édition, prévient et marque la cellule quand le verrou est refusé (équivalent LOCKED)', async () => {
      vi.mocked(requestCellLock).mockResolvedValue({ granted: false, holder: bob });
      const api = fakeGridApi();
      const { result } = renderHook(() =>
        useCoedition('month', '2026-08', api as never),
      );

      await act(async () => {
        await result.current.onCellEditingStarted({
          data: { id: 'row1' },
          column: { getColId: () => 'client' },
        } as never);
      });

      expect(api.stopEditing).toHaveBeenCalledWith(true);
      expect(useAppStore.getState().toast?.message).toBe(lockedToastMessage('Bob Dupont'));
      expect(useAppStore.getState().locks['row1:client'].user.id).toBe('bob');
    });

    it('libère le verrou et arrête le renouvellement à la fin de l’édition', async () => {
      const api = fakeGridApi();
      const { result } = renderHook(() =>
        useCoedition('month', '2026-08', api as never),
      );

      await act(async () => {
        await result.current.onCellEditingStarted({
          data: { id: 'row1' },
          column: { getColId: () => 'client' },
        } as never);
      });
      vi.mocked(requestCellLock).mockClear();

      act(() =>
        result.current.onCellEditingStopped({
          data: { id: 'row1' },
          column: { getColId: () => 'client' },
        } as never),
      );

      expect(releaseCellLock).toHaveBeenCalledWith('row1', 'client');
      act(() => {
        vi.advanceTimersByTime(LOCK_RENEW_INTERVAL_MS * 3);
      });
      expect(requestCellLock).not.toHaveBeenCalled();
    });
  });

  describe('éditabilité et classes', () => {
    it('interdit l’édition d’une cellule verrouillée par un collègue', () => {
      useAppStore.getState().setLock({ rowId: 'row1', colKey: 'client', user: bob });
      const { result } = renderHook(() =>
        useCoedition('month', '2026-08', fakeGridApi() as never),
      );
      const params = { data: { id: 'row1' }, column: { getColId: () => 'client' } } as never;
      expect(result.current.isCellEditable(params)).toBe(false);

      const free = { data: { id: 'row1' }, column: { getColId: () => 'statut' } } as never;
      expect(result.current.isCellEditable(free)).toBe(true);
    });

    it('applique les classes coedition-focus / coedition-locked et le style', () => {
      useAppStore.getState().setPresence([bob]);
      useAppStore.getState().setRemoteFocus('bob', 'row1', 'client');
      useAppStore.getState().setLock({ rowId: 'row1', colKey: 'statut', user: bob });
      const { result } = renderHook(() =>
        useCoedition('month', '2026-08', fakeGridApi() as never),
      );

      const focused = { data: { id: 'row1' }, column: { getColId: () => 'client' } } as never;
      const locked = { data: { id: 'row1' }, column: { getColId: () => 'statut' } } as never;

      expect(result.current.cellClassRules['coedition-focus'](focused)).toBe(true);
      expect(result.current.cellClassRules['coedition-locked'](focused)).toBe(false);
      expect(result.current.cellClassRules['coedition-locked'](locked)).toBe(true);
      expect(result.current.cellStyle(focused)).toEqual({
        '--coedition-color': '#00FF00',
        '--coedition-label': '"Bob Dupont"',
      });
    });
  });
  ```

- [ ] **Étape 2: lancer le test**

  ```bash
  pnpm --filter @suivi/web test -- useCoedition.spec.tsx
  ```

  Résultat attendu : **FAIL** — `Cannot find module './useCoedition' from 'src/components/grid/useCoedition.spec.tsx'`.

- [ ] **Étape 3: implémenter le hook**

  Créer `apps/web/src/components/grid/useCoedition.ts` :

  ```ts
  'use client';

  import { useCallback, useEffect, useMemo, useRef } from 'react';
  import type {
    CellClassParams,
    CellEditingStartedEvent,
    CellEditingStoppedEvent,
    CellFocusedEvent,
    EditableCallbackParams,
    GridApi,
  } from 'ag-grid-community';
  import type { RowDTO } from '@suivi/shared';
  import { roomForView } from '../../lib/coedition';
  import type { GridView } from '../../lib/store';
  import { cellStyleFor, decorateCell, isLockedByOther } from '../../lib/coedition-cell';
  import { refreshConfig, resyncView } from '../../lib/coedition-sync';
  import {
    emitCellFocus,
    joinRoom,
    onConnectionChange,
    onEvent,
    onReconnect,
    releaseCellLock,
    requestCellLock,
  } from '../../lib/socket';
  import { useAppStore } from '../../lib/store';

  /** Renouvellement du verrou pendant la frappe (TTL serveur : 30 s). */
  export const LOCK_RENEW_INTERVAL_MS = 10_000;

  export function lockedToastMessage(displayName: string): string {
    return `${displayName} édite cette cellule`;
  }

  export interface CoeditionBindings {
    onCellFocused: (event: CellFocusedEvent) => void;
    onCellEditingStarted: (event: CellEditingStartedEvent) => Promise<void>;
    onCellEditingStopped: (event: CellEditingStoppedEvent) => void;
    cellClassRules: Record<string, (params: CellClassParams) => boolean>;
    cellStyle: (params: CellClassParams) => Record<string, string> | null;
    isCellEditable: (params: EditableCallbackParams) => boolean;
  }

  /** Sous-ensemble du store lu à chaud (hors cycle React) par AG Grid. */
  function currentCellState() {
    const state = useAppStore.getState();
    return {
      focuses: state.focuses,
      locks: state.locks,
      presence: state.presence,
      meId: state.user?.id ?? null,
    };
  }

  function colIdOf(column: { getColId(): string } | string | null | undefined): string | null {
    if (!column) {
      return null;
    }
    return typeof column === 'string' ? column : column.getColId();
  }

  export function useCoedition(
    view: GridView,
    month: string,
    gridApi: GridApi | null,
  ): CoeditionBindings {
    const gridApiRef = useRef<GridApi | null>(gridApi);
    gridApiRef.current = gridApi;
    const viewRef = useRef<{ view: GridView; month: string }>({ view, month });
    viewRef.current = { view, month };
    const renewTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const editing = useRef<{ rowId: string; colKey: string } | null>(null);
    const lastFocus = useRef<string | null>(null);

    // 1. Room de la vue (re-jointe automatiquement à chaque reconnexion).
    useEffect(() => {
      joinRoom(roomForView(view, month));
    }, [view, month]);

    // 2. Abonnements socket — montés une seule fois.
    useEffect(() => {
      const store = useAppStore.getState;
      const unsubscribes = [
        onConnectionChange((connected) => store().setConnected(connected)),
        onReconnect(() => {
          void resyncView(viewRef.current.view, viewRef.current.month);
        }),
        onEvent('presence', ({ users }) => store().setPresence(users)),
        onEvent('cell.focus', ({ userId, rowId, colKey }) =>
          store().setRemoteFocus(userId, rowId, colKey),
        ),
        onEvent('cell.lock', (lock) => store().setLock(lock)),
        onEvent('cell.unlock', ({ rowId, colKey }) => store().clearLock(rowId, colKey)),
        onEvent('row.created', ({ row }) => store().applyRowCreated(row)),
        onEvent('row.updated', ({ row, byUserId }) => store().applyRowUpdated(row, byUserId)),
        onEvent('row.deleted', ({ rowId }) => store().applyRowDeleted(rowId)),
        onEvent('row.moved', ({ row }) => store().applyRowMoved(row)),
        onEvent('config.changed', ({ scope }) => {
          void refreshConfig(scope);
        }),
      ];
      return () => {
        for (const unsubscribe of unsubscribes) {
          unsubscribe();
        }
      };
    }, []);

    // 3. Redessin des cellules quand focus/verrous distants changent.
    useEffect(() => {
      return useAppStore.subscribe((state, previous) => {
        if (
          state.focuses !== previous.focuses ||
          state.locks !== previous.locks ||
          state.presence !== previous.presence
        ) {
          gridApiRef.current?.refreshCells({ force: true });
        }
      });
    }, []);

    // 4. Arrêt du renouvellement de verrou au démontage.
    useEffect(() => {
      return () => {
        if (renewTimer.current) {
          clearInterval(renewTimer.current);
          renewTimer.current = null;
        }
        if (editing.current) {
          releaseCellLock(editing.current.rowId, editing.current.colKey);
          editing.current = null;
        }
      };
    }, []);

    const onCellFocused = useCallback((event: CellFocusedEvent) => {
      const colKey = colIdOf(event.column as never);
      const rowId =
        event.rowIndex === null || event.rowIndex === undefined
          ? null
          : ((event.api.getDisplayedRowAtIndex(event.rowIndex)?.data as RowDTO | undefined)?.id ??
            null);

      if (rowId === null || colKey === null) {
        if (lastFocus.current !== null) {
          lastFocus.current = null;
          emitCellFocus({ rowId: null });
        }
        return;
      }
      const signature = `${rowId}:${colKey}`;
      if (signature === lastFocus.current) {
        return;
      }
      lastFocus.current = signature;
      emitCellFocus({ rowId, colKey });
    }, []);

    const onCellEditingStarted = useCallback(async (event: CellEditingStartedEvent) => {
      const rowId = (event.data as RowDTO | undefined)?.id;
      const colKey = colIdOf(event.column as never);
      if (!rowId || !colKey) {
        return;
      }

      const ack = await requestCellLock(rowId, colKey);
      if (!ack.granted) {
        gridApiRef.current?.stopEditing(true);
        if (ack.holder) {
          useAppStore.getState().setLock({ rowId, colKey, user: ack.holder });
          useAppStore.getState().showToast(lockedToastMessage(ack.holder.displayName), 'error');
        } else {
          useAppStore
            .getState()
            .showToast('Édition impossible — connexion au serveur perdue', 'error');
        }
        return;
      }

      editing.current = { rowId, colKey };
      if (renewTimer.current) {
        clearInterval(renewTimer.current);
      }
      // Le TTL serveur est de 30 s : on le repousse toutes les 10 s de frappe.
      renewTimer.current = setInterval(() => {
        void requestCellLock(rowId, colKey);
      }, LOCK_RENEW_INTERVAL_MS);
    }, []);

    const onCellEditingStopped = useCallback((event: CellEditingStoppedEvent) => {
      if (renewTimer.current) {
        clearInterval(renewTimer.current);
        renewTimer.current = null;
      }
      const rowId = (event.data as RowDTO | undefined)?.id ?? editing.current?.rowId;
      const colKey = colIdOf(event.column as never) ?? editing.current?.colKey ?? null;
      editing.current = null;
      if (rowId && colKey) {
        releaseCellLock(rowId, colKey);
      }
    }, []);

    const cellClassRules = useMemo(
      () => ({
        'coedition-focus': (params: CellClassParams) => {
          const rowId = (params.data as RowDTO | undefined)?.id;
          const colKey = colIdOf(params.column as never);
          if (!rowId || !colKey) {
            return false;
          }
          return decorateCell(rowId, colKey, currentCellState()).focusedBy !== null;
        },
        'coedition-locked': (params: CellClassParams) => {
          const rowId = (params.data as RowDTO | undefined)?.id;
          const colKey = colIdOf(params.column as never);
          if (!rowId || !colKey) {
            return false;
          }
          return decorateCell(rowId, colKey, currentCellState()).lockedBy !== null;
        },
      }),
      [],
    );

    const cellStyle = useCallback((params: CellClassParams) => {
      const rowId = (params.data as RowDTO | undefined)?.id;
      const colKey = colIdOf(params.column as never);
      if (!rowId || !colKey) {
        return null;
      }
      return cellStyleFor(decorateCell(rowId, colKey, currentCellState()));
    }, []);

    const isCellEditable = useCallback((params: EditableCallbackParams) => {
      const rowId = (params.data as RowDTO | undefined)?.id;
      const colKey = colIdOf(params.column as never);
      if (!rowId || !colKey) {
        return true;
      }
      return !isLockedByOther(rowId, colKey, currentCellState());
    }, []);

    return {
      onCellFocused,
      onCellEditingStarted,
      onCellEditingStopped,
      cellClassRules,
      cellStyle,
      isCellEditable,
    };
  }
  ```

- [ ] **Étape 4: relancer le test**

  ```bash
  pnpm --filter @suivi/web test -- useCoedition.spec.tsx
  ```

  Résultat attendu : **PASS** — 10 tests verts.

- [ ] **Étape 5: brancher le hook dans la grille**

  Dans `apps/web/src/components/grid/DataGrid.tsx`, ajouter les imports :

  ```tsx
  import './coedition.css';
  import { useCoedition } from './useCoedition';
  ```

  Dans le corps du composant, à côté des autres lectures du store (`columns`,
  `rows`, …), lire la vue et le mois puis monter le hook après la récupération
  de `gridApi` :

  ```tsx
  const view = useAppStore((state) => state.view);
  const monthCourant = useAppStore((state) => state.monthCourant);
  const coedition = useCoedition(view, monthCourant, gridApi);
  ```

  La Feature 6 passe `defaultColDef` en objet littéral inline
  (`defaultColDef={{ resizable: true, editable: true, sortable: false }}`).
  Le remplacer par un `useMemo` déclaré au-dessus du `return` — **contenu complet** :

  ```tsx
  const defaultColDef = useMemo(
    () => ({
      resizable: true,
      sortable: false,
      editable: coedition.isCellEditable,
      cellClassRules: coedition.cellClassRules,
      cellStyle: coedition.cellStyle,
    }),
    [coedition],
  );
  ```

  puis, dans le JSX, remplacer la ligne `defaultColDef={{ ... }}` par
  `defaultColDef={defaultColDef}` et ajouter les trois événements. Le bloc
  `<AgGridReact>` devient (contenu complet, props de la Feature 6 conservées) :

  ```tsx
  <AgGridReact<RowDTO>
    theme={suiviTheme}
    rowData={rows}
    columnDefs={columnDefs}
    getRowId={(params: GetRowIdParams<RowDTO>) => params.data.id}
    defaultColDef={defaultColDef}
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
    onCellFocused={coedition.onCellFocused}
    onCellEditingStarted={coedition.onCellEditingStarted}
    onCellEditingStopped={coedition.onCellEditingStopped}
  />
  ```

  Si la Feature 6 définit déjà `cellStyle` (couleurs des choix de listes) sur
  les colonnes de type `SELECT`, composer les deux dans le `colDef` généré :

  ```tsx
  cellStyle: (params) => ({
    ...(choiceStyle(params) ?? {}),
    ...(coedition.cellStyle(params) ?? {}),
  }),
  ```

- [ ] **Étape 6: vérifier le build et lancer tous les tests front**

  ```bash
  pnpm --filter @suivi/web test && pnpm --filter @suivi/web build
  ```

  Résultat attendu : **PASS** — tous les specs verts, `Compiled successfully`.

- [ ] **Étape 7: commit**

  ```bash
  git add apps/web/src/components/grid/useCoedition.ts apps/web/src/components/grid/useCoedition.spec.tsx apps/web/src/components/grid/DataGrid.tsx
  git commit -m "feat(web): hook de co-édition (focus émis, verrous, redessin) branché sur AG Grid"
  ```

> À vérifier à l'exécution : (1) en AG Grid 34, `CellFocusedEvent.column` est un objet `Column` (avec `getColId()`) ou une chaîne selon l'appel — `colIdOf` traite les deux cas ; (2) `onCellEditingStarted` est synchrone côté AG Grid : rendre un `Promise` est toléré (le retour est ignoré), mais `stopEditing(true)` est appelé un tick plus tard, ce qui laisse voir l'éditeur un instant — si ce clignotement gêne, précharger le verrou depuis `onCellKeyDown`/`onCellDoubleClicked` ; (3) `api.refreshCells({ force: true })` réévalue bien `cellStyle` et `cellClassRules` (comportement documenté) — sinon ajouter `api.redrawRows()`.

---

### Task 7.8: Édition optimiste et conflit `VERSION_CONFLICT` (409) — évolution de `cellCommit.ts`

> **Un seul chemin d'écriture de cellule.** La Feature 6 (Task 6.5) a livré
> `apps/web/src/components/grid/cellCommit.ts` (`commitCellEdit`, `commitHighlight`,
> `messageForError`) : édition optimiste, 409 et échec réseau, avec rollback grossier
> (`reload()` du mois). Cette task **remplace** ce rollback grossier par le rollback fin
> annoncé en Feature 6 (« Le rollback fin par clé arrive en Feature 7 ») en ajoutant
> `applyCellEdit` **dans ce même fichier**, et rebranche `onCellValueChanged` dessus.
> Aucun fichier `coedition-edit.ts` n'est créé : ce serait une seconde implémentation
> concurrente du même chemin d'écriture.

- **Files:**
  - Modify: `apps/web/src/components/grid/cellCommit.ts` (ajout de `applyCellEdit` ; `commitHighlight` et `messageForError` conservés tels quels), `apps/web/src/components/grid/DataGrid.tsx`
  - Test: `apps/web/src/components/grid/cellCommit.coedition.spec.ts`
- **Interfaces:**
  - Consomme : `apiFetch`, `ApiRequestError` (Feature 6) ; `useAppStore` avec `setRowLocalValue`, `replaceRow` (Task 7.3) et `showToast` (Feature 6) ; contrat `PATCH /rows/:id` → 409 `{ code: 'VERSION_CONFLICT', details: { current: RowDTO; conflictKeys: string[] } }`.
  - Produit :
    - `const CONFLICT_MESSAGE = 'Modifié par un collègue entre-temps'`
    - `const EDIT_FAILED_MESSAGE = 'Modification non enregistrée — vérifiez votre connexion'`
    - `interface CellEditDeps { flashCell?: (rowId: string, colKey: string) => void }`
    - `applyCellEdit(rowId: string, colKey: string, value: CellValue, deps?: CellEditDeps): Promise<void>`

- [ ] **Étape 1: écrire le test de l'édition optimiste (échec attendu)**

  Créer `apps/web/src/components/grid/cellCommit.coedition.spec.ts` :

  ```ts
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import type { RowDTO } from '@suivi/shared';
  import { ApiRequestError, apiFetch } from '../../lib/api';
  import { CONFLICT_MESSAGE, EDIT_FAILED_MESSAGE, applyCellEdit } from './cellCommit';
  import { useAppStore } from '../../lib/store';

  vi.mock('../../lib/api');

  function row(over: Partial<RowDTO> = {}): RowDTO {
    return {
      id: 'row1',
      month: '2026-08',
      position: 1,
      data: { client: 'ANCIEN' },
      formats: {},
      version: 4,
      archived: false,
      updatedAt: '2026-08-10T10:00:00.000Z',
      ...over,
    };
  }

  function conflictError(current: RowDTO, conflictKeys: string[]): ApiRequestError {
    return new ApiRequestError(
      'VERSION_CONFLICT',
      'Cette ligne a été modifiée entre-temps',
      409,
      { current, conflictKeys },
    );
  }

  beforeEach(() => {
    useAppStore.setState({
      user: { id: 'me', email: 'me@test.fr', displayName: 'Moi', cursorColor: '#123456' },
      users: [],
      columns: [],
      rows: [row()],
      view: 'month',
      monthCourant: '2026-08',
      connected: true,
      presence: [],
      focuses: {},
      locks: {},
      toast: null,
    });
  });

  describe('applyCellEdit — succès', () => {
    it('envoie le PATCH avec expectedVersion et applique la ligne renvoyée', async () => {
      vi.mocked(apiFetch).mockResolvedValue(
        row({ data: { client: 'NOUVEAU' }, version: 5 }) as never,
      );

      await applyCellEdit('row1', 'client', 'NOUVEAU');

      expect(apiFetch).toHaveBeenCalledWith('/rows/row1', {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion: 4, patch: { client: 'NOUVEAU' } }),
      });
      expect(useAppStore.getState().rows[0].data.client).toBe('NOUVEAU');
      expect(useAppStore.getState().rows[0].version).toBe(5);
      expect(useAppStore.getState().toast).toBeNull();
    });

    it('affiche la valeur immédiatement (optimisme) avant la réponse du serveur', async () => {
      let resolveFetch: (value: unknown) => void = () => undefined;
      vi.mocked(apiFetch).mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        }) as never,
      );

      const pending = applyCellEdit('row1', 'client', 'OPTIMISTE');
      expect(useAppStore.getState().rows[0].data.client).toBe('OPTIMISTE');

      resolveFetch(row({ data: { client: 'OPTIMISTE' }, version: 5 }));
      await pending;
      expect(useAppStore.getState().rows[0].version).toBe(5);
    });

    it('ne fait rien si la ligne a disparu de la vue', async () => {
      useAppStore.setState({ rows: [] });
      await applyCellEdit('row1', 'client', 'X');
      expect(apiFetch).not.toHaveBeenCalled();
    });
  });

  describe('applyCellEdit — VERSION_CONFLICT (409)', () => {
    it('remplace la valeur affichée par details.current, prévient et fait clignoter la cellule', async () => {
      const serverRow = row({ data: { client: 'VALEUR COLLEGUE' }, version: 9 });
      vi.mocked(apiFetch).mockRejectedValue(conflictError(serverRow, ['client']));
      const flashCell = vi.fn();

      await applyCellEdit('row1', 'client', 'MA SAISIE', { flashCell });

      expect(useAppStore.getState().rows[0].data.client).toBe('VALEUR COLLEGUE');
      expect(useAppStore.getState().rows[0].version).toBe(9);
      expect(useAppStore.getState().toast?.message).toBe(CONFLICT_MESSAGE);
      expect(useAppStore.getState().toast?.kind).toBe('error');
      expect(flashCell).toHaveBeenCalledWith('row1', 'client');
    });

    it('revient à la valeur précédente si le serveur n’a pas joint details.current', async () => {
      const error = new ApiRequestError('VERSION_CONFLICT', 'Cette ligne a été modifiée entre-temps', 409);
      vi.mocked(apiFetch).mockRejectedValue(error);

      await applyCellEdit('row1', 'client', 'MA SAISIE');

      expect(useAppStore.getState().rows[0].data.client).toBe('ANCIEN');
      expect(useAppStore.getState().toast?.message).toBe(CONFLICT_MESSAGE);
    });
  });

  describe('applyCellEdit — autres erreurs', () => {
    it('annule la saisie et prévient en cas de panne réseau', async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error('Failed to fetch'));
      const flashCell = vi.fn();

      await applyCellEdit('row1', 'client', 'MA SAISIE', { flashCell });

      expect(useAppStore.getState().rows[0].data.client).toBe('ANCIEN');
      expect(useAppStore.getState().toast?.message).toBe(EDIT_FAILED_MESSAGE);
      expect(flashCell).toHaveBeenCalledWith('row1', 'client');
    });

    it('annule la saisie en cas de 422 VALIDATION_FAILED et affiche le message serveur', async () => {
      const error = new ApiRequestError(
        'VALIDATION_FAILED',
        'La valeur « 12/45/2026 » n’est pas une date valide',
        422,
      );
      vi.mocked(apiFetch).mockRejectedValue(error);

      await applyCellEdit('row1', 'client', '12/45/2026');

      expect(useAppStore.getState().rows[0].data.client).toBe('ANCIEN');
      expect(useAppStore.getState().toast?.message).toBe(
        'La valeur « 12/45/2026 » n’est pas une date valide',
      );
    });
  });
  ```

- [ ] **Étape 2: lancer le test**

  ```bash
  pnpm --filter @suivi/web test -- cellCommit.coedition.spec.ts
  ```

  Résultat attendu : **FAIL** — `cellCommit.ts does not provide an export named 'applyCellEdit'`.

- [ ] **Étape 3: implémenter l'édition optimiste**

  Modifier `apps/web/src/components/grid/cellCommit.ts` : compléter les imports en tête de
  fichier (`apiFetch` et `useAppStore` s'ajoutent à `ApiRequestError` déjà importé), puis
  **ajouter** le bloc ci-dessous à la suite de `commitHighlight`. Ne rien supprimer :
  `commitHighlight` et `messageForError` restent utilisés par la palette de surlignage
  (Feature 6, Task 6.7).

  ```ts
  import { apiFetch } from '../../lib/api';
  import { useAppStore } from '../../lib/store';

  export const CONFLICT_MESSAGE = 'Modifié par un collègue entre-temps';
  export const EDIT_FAILED_MESSAGE = 'Modification non enregistrée — vérifiez votre connexion';

  export interface CellEditDeps {
    /** Clignotement AG Grid de la cellule rejetée (injectable pour les tests). */
    flashCell?: (rowId: string, colKey: string) => void;
  }

  interface VersionConflictDetails {
    current: RowDTO;
    conflictKeys: string[];
  }

  /**
   * Écrit une cellule : affichage optimiste immédiat, PATCH avec
   * `expectedVersion`, puis confirmation (nouvelle version) ou rollback.
   */
  export async function applyCellEdit(
    rowId: string,
    colKey: string,
    value: CellValue,
    deps: CellEditDeps = {},
  ): Promise<void> {
    const store = useAppStore.getState();
    const known = store.rows.find((r) => r.id === rowId);
    if (!known) {
      return;
    }
    const previousValue = known.data[colKey] ?? null;
    const expectedVersion = known.version;

    store.setRowLocalValue(rowId, colKey, value);

    try {
      const updated = await apiFetch<RowDTO>(`/rows/${rowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion, patch: { [colKey]: value } }),
      });
      useAppStore.getState().replaceRow(updated);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'VERSION_CONFLICT') {
        const details = error.details as VersionConflictDetails | undefined;
        if (details?.current) {
          useAppStore.getState().replaceRow(details.current);
        } else {
          useAppStore.getState().setRowLocalValue(rowId, colKey, previousValue);
        }
        useAppStore.getState().showToast(CONFLICT_MESSAGE, 'error');
        deps.flashCell?.(rowId, colKey);
        return;
      }

      useAppStore.getState().setRowLocalValue(rowId, colKey, previousValue);
      const message =
        error instanceof ApiRequestError ? error.message : EDIT_FAILED_MESSAGE;
      useAppStore.getState().showToast(message, 'error');
      deps.flashCell?.(rowId, colKey);
    }
  }
  ```

- [ ] **Étape 4: relancer le test**

  ```bash
  pnpm --filter @suivi/web test -- cellCommit.coedition.spec.ts
  ```

  Résultat attendu : **PASS** — 7 tests verts.

- [ ] **Étape 5: brancher l'édition optimiste dans la grille**

  Dans `apps/web/src/components/grid/DataGrid.tsx`, remplacer le corps de
  `onCellValueChanged` posé par la Feature 6 par :

  ```tsx
  import { applyCellEdit } from './cellCommit';

  const flashCell = useCallback(
    (rowId: string, colKey: string) => {
      const node = gridApi?.getRowNode(rowId);
      if (node) {
        gridApi?.flashCells({ rowNodes: [node], columns: [colKey] });
      }
    },
    [gridApi],
  );

  const onCellValueChanged = useCallback(
    (event: CellValueChangedEvent) => {
      const rowId = (event.data as RowDTO).id;
      const colKey = event.column.getColId();
      void applyCellEdit(rowId, colKey, event.newValue as CellValue, { flashCell });
    },
    [flashCell],
  );
  ```

- [ ] **Étape 6: vérifier build et tests front**

  ```bash
  pnpm --filter @suivi/web test && pnpm --filter @suivi/web build
  ```

  Résultat attendu : **PASS** — tous les specs verts, build compilé.

- [ ] **Étape 7: commit**

  ```bash
  git add apps/web/src/components/grid/cellCommit.ts apps/web/src/components/grid/cellCommit.coedition.spec.ts apps/web/src/components/grid/DataGrid.tsx
  git commit -m "feat(web): édition optimiste avec rollback et flash sur VERSION_CONFLICT"
  ```

> À vérifier à l'exécution : `gridApi.getRowNode(id)` suppose que la Feature 6 a bien défini `getRowId: (params) => params.data.id` sur AG Grid ; sinon récupérer le nœud via `gridApi.forEachNode`. `flashCells({ rowNodes, columns })` est l'API AG Grid 34 (l'ancienne signature `flashCells({ rowNodes, columns })` est inchangée depuis la v27).

---

### Task 7.9: Test Playwright à deux navigateurs, vérification complète et merge

- **Files:**
  - Create: `apps/web/e2e/coedition.spec.ts`, `apps/api/prisma/seed-e2e.ts`
  - Modify: `apps/api/package.json` (script `seed:e2e`)
  - Aucune modification de `apps/web/playwright.config.ts` : le harnais e2e front est créé une seule fois par la Feature 2 (Task 2.7).
  - Test: `apps/web/e2e/coedition.spec.ts` (2 contextes navigateur), puis `pnpm -r test` + `pnpm --filter @suivi/api test:e2e`
- **Interfaces:**
  - Consomme : `POST /api/auth/login` (Feature 2), `POST /api/rows` et `DELETE /api/rows/:id` (Feature 4), l'application complète (Features 6 et 7).
  - Produit : scénario e2e « présence + verrou + diffusion » du contrat de tests de la spec §12, scripts `pnpm --filter @suivi/api seed:e2e` et `pnpm --filter @suivi/web test:e2e`.

- [ ] **Étape 1: seed des deux utilisateurs e2e**

  Créer `apps/api/prisma/seed-e2e.ts` :

  ```ts
  import { PrismaClient } from '@prisma/client';
  import * as argon2 from 'argon2';

  /**
   * Deux comptes stables pour les tests Playwright de co-édition.
   * Idempotent : rejouable autant de fois que nécessaire.
   */
  const USERS = [
    {
      email: 'alice.e2e@test.fr',
      displayName: 'Alice Martin',
      cursorColor: '#E74C3C',
    },
    {
      email: 'bob.e2e@test.fr',
      displayName: 'Bob Dupont',
      cursorColor: '#27AE60',
    },
  ];

  export const E2E_PASSWORD = 'motdepasse-e2e';

  async function main(): Promise<void> {
    const prisma = new PrismaClient();
    try {
      const passwordHash = await argon2.hash(E2E_PASSWORD);
      for (const user of USERS) {
        await prisma.user.upsert({
          where: { email: user.email },
          update: { displayName: user.displayName, cursorColor: user.cursorColor, passwordHash },
          create: { ...user, passwordHash },
        });
        console.log(`utilisateur e2e prêt : ${user.email}`);
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  void main();
  ```

  Ajouter dans `apps/api/package.json`, bloc `scripts` :

  ```json
  "seed:e2e": "ts-node prisma/seed-e2e.ts"
  ```

  Exécuter :

  ```bash
  pnpm --filter @suivi/api seed:e2e
  ```

  Résultat attendu : deux lignes `utilisateur e2e prêt : ...`.

- [ ] **Étape 2: vérifier le harnais Playwright (rien à créer, rien à modifier)**

  `apps/web/playwright.config.ts` est créé **une seule fois**, par la Feature 2
  (Task 2.7) : `testDir: './e2e'`, `workers: 1`, `fullyParallel: false`,
  `projects: [chromium]`, `baseURL = E2E_WEB_URL ?? 'http://localhost:3000'`,
  `webServer` démarrant l'API puis le front, et `globalSetup` rejouant le seed.
  Ce fichier couvre tel quel le scénario à deux contextes navigateur de cette task :
  **ne pas le recréer, ne pas le modifier**. Les scripts `test:e2e` et les entrées
  `.gitignore` sont également déjà en place.

  ```bash
  test -f apps/web/playwright.config.ts && pnpm --filter @suivi/web exec playwright --version
  ```

  Attendu : le chemin existe et la version de Playwright s'affiche.

- [ ] **Étape 3: écrire le test à deux contextes navigateur (échec attendu)**

  Créer `apps/web/e2e/coedition.spec.ts` :

  ```ts
  import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

  const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
  const PASSWORD = 'motdepasse-e2e';
  const ALICE = 'alice.e2e@test.fr';
  const BOB = 'bob.e2e@test.fr';

  const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

  interface LoggedUser {
    id: string;
    displayName: string;
  }

  /**
   * Connecte un contexte navigateur via l'API : le cookie httpOnly `token`
   * est posé dans le pot de cookies partagé du contexte, donc utilisable
   * ensuite par les pages ET par le socket.
   */
  async function loginContext(context: BrowserContext, email: string): Promise<LoggedUser> {
    const response = await context.request.post(`${API_URL}/api/auth/login`, {
      data: { email, password: PASSWORD },
    });
    expect(response.ok(), `login ${email} : ${response.status()}`).toBe(true);
    const body = (await response.json()) as { user: LoggedUser };
    return body.user;
  }

  function cellLocator(page: Page, rowId: string, colKey: string) {
    return page.locator(`.ag-row[row-id="${rowId}"] .ag-cell[col-id="${colKey}"]`).first();
  }

  test.describe('Co-édition à deux navigateurs', () => {
    let rowId = '';
    let apiAlice: APIRequestContext;

    test('présence, verrou visible et diffusion sans rechargement', async ({ browser }) => {
      const contextA = await browser.newContext();
      const contextB = await browser.newContext();

      const alice = await loginContext(contextA, ALICE);
      const bob = await loginContext(contextB, BOB);
      apiAlice = contextA.request;

      // Ligne de travail créée via l'API dans le mois courant (vue « / »).
      const created = await apiAlice.post(`${API_URL}/api/rows`, {
        data: { month: CURRENT_MONTH },
      });
      expect(created.ok()).toBe(true);
      rowId = ((await created.json()) as { id: string }).id;

      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();
      await pageA.goto('/');
      await pageB.goto('/');

      // 1. A voit la présence de B (avatar avec ses initiales et sa couleur).
      const avatarBob = pageA.getByTestId(`presence-${bob.id}`);
      await expect(avatarBob).toBeVisible();
      await expect(avatarBob).toHaveText('BD');
      await expect(avatarBob).toHaveAttribute('title', 'Bob Dupont');

      // Symétriquement, B voit Alice.
      await expect(pageB.getByTestId(`presence-${alice.id}`)).toBeVisible();

      // 2. B entre en édition sur la cellule CLIENT : A la voit verrouillée.
      const cellB = cellLocator(pageB, rowId, 'client');
      await cellB.dblclick();
      const cellA = cellLocator(pageA, rowId, 'client');
      await expect(cellA).toHaveClass(/coedition-locked/);

      // 3. B valide sa saisie : A reçoit la nouvelle valeur SANS rechargement.
      await pageB.keyboard.type('ARCADIA');
      await pageB.keyboard.press('Enter');
      await expect(cellA).toHaveText('ARCADIA');

      // 4. Le verrou est relâché à la fin de l'édition.
      await expect(cellA).not.toHaveClass(/coedition-locked/);

      await contextA.close();
      await contextB.close();
    });

    test.afterAll(async () => {
      if (rowId && apiAlice) {
        await apiAlice.delete(`${API_URL}/api/rows/${rowId}`);
      }
    });
  });
  ```

- [ ] **Étape 4: lancer le test Playwright**

  ```bash
  pnpm --filter @suivi/web test:e2e
  ```

  Résultat attendu la première fois : **FAIL** si l'un des maillons manque
  (présence non affichée, classe `coedition-locked` absente, valeur non
  diffusée). Diagnostiquer avec `pnpm --filter @suivi/web exec playwright show-trace test-results/**/trace.zip` puis corriger le maillon en cause (côté Feature 7 uniquement : les Features 4 à 6 sont déjà vertes).

- [ ] **Étape 5: relancer jusqu'au vert**

  ```bash
  pnpm --filter @suivi/web test:e2e
  ```

  Résultat attendu : **PASS** — 1 test vert, les 4 assertions du scénario de la spec §12 satisfaites.

- [ ] **Étape 6: commit du e2e**

  ```bash
  git add apps/web/e2e apps/api/package.json apps/api/prisma/seed-e2e.ts
  git commit -m "test(web): e2e Playwright co-édition à deux contextes navigateur"
  ```

- [ ] **Étape 7: lancer TOUS les tests du périmètre**

  ```bash
  pnpm lint
  pnpm -r test
  pnpm --filter @suivi/api test:e2e
  pnpm --filter @suivi/web test:e2e
  pnpm build
  ```

  Résultat attendu : **PASS** intégral — lint exit 0 ; tests unitaires API et
  web verts (dont les 6 nouveaux specs front : `coedition`, `socket`,
  `store.coedition`, `coedition-sync`, `coedition-cell`, `cellCommit.coedition`,
  `PresenceBar`, `useCoedition`) ; e2e API vert ; e2e Playwright vert ; build
  web et API compilés. Aucun test rouge avant le merge (règle de la spec §11).

- [ ] **Étape 8: merge gitflow**

  ```bash
  git checkout develop && git merge --no-ff feature/coedition-ui -m "merge: feature/coedition-ui" && git push origin develop
  ```

> À vérifier à l'exécution : (1) le script de démarrage API en dev (`start:dev` de Nest) et la route de santé `/api/health` (Feature 0) — aligner `webServer[0]` sur les noms réels ; (2) le runner du seed (`ts-node` vs `tsx`) doit être le même que celui du seed de la Feature 1 ; (3) sélecteurs AG Grid : `.ag-row[row-id="..."]` et `.ag-cell[col-id="..."]` sont les attributs standards du DOM d'AG Grid 34 — si la grille est en mode colonnes épinglées, préfixer par `.ag-center-cols-container` ; (4) si le cookie de session n'est pas transmis au front (ports 3000/3001), vérifier que `sameSite` du cookie de la Feature 2 vaut `lax` et non `strict`.

---

## Récapitulatif de la feature

| Livrable | Fichier |
|---|---|
| Client Socket.IO typé (rooms, reconnexion, verrous) | `apps/web/src/lib/socket.ts` |
| Helpers de vue et de présence | `apps/web/src/lib/coedition.ts` |
| Tranche co-édition du store | `apps/web/src/lib/store.ts` |
| Resynchronisation et rechargement de config | `apps/web/src/lib/coedition-sync.ts` |
| Décoration des cellules (focus/verrou) | `apps/web/src/lib/coedition-cell.ts` + `components/grid/coedition.css` |
| Édition optimiste et conflits 409 | `apps/web/src/components/grid/cellCommit.ts` (`applyCellEdit`) |
| Hook d'intégration AG Grid | `apps/web/src/components/grid/useCoedition.ts` |
| Présence et bandeau de connexion | `apps/web/src/components/grid/PresenceBar.tsx`, `ConnectionBanner.tsx` |
| e2e deux navigateurs | `apps/web/e2e/coedition.spec.ts` |

Cas d'erreur couverts par un test dédié :

| Cas | Code / signal | Test |
|---|---|---|
| Conflit d'écriture | 409 `VERSION_CONFLICT` | Task 7.8, étape 1 (2 tests : avec et sans `details.current`) |
| Validation refusée | 422 `VALIDATION_FAILED` | Task 7.8, étape 1 |
| Session expirée | 401 `AUTH_REQUIRED` | Task 7.4, étape 1 |
| Cellule déjà éditée | ack `{ granted: false, holder }` (équivalent `LOCKED`) | Task 7.7, étape 1 + Task 7.9 |
| Socket coupé / ack expiré | refus de verrou + bandeau | Task 7.2 et Task 7.5, étape 1 |
| Panne réseau à l'écriture | rollback + toast | Task 7.8, étape 1 |




