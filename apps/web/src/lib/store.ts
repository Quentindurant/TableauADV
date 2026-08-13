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
import { cellKey, removeRow, rowBelongsToView, uniquePresence, upsertRow } from './coedition';

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

export const useAppStore = create<AppState>()((set, get) => ({
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

  // --- co-édition (Feature 7) ---
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
}));
