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
