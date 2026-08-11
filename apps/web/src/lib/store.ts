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
