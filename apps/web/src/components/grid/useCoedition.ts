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
  type ServerEvents,
} from '../../lib/socket';
import { useAppStore } from '../../lib/store';
import { debouncePerKey } from './columnLayout';

/** Renouvellement du verrou pendant la frappe (TTL serveur : 30 s). */
export const LOCK_RENEW_INTERVAL_MS = 10_000;

/**
 * Fenêtre de coalescing des `config.changed` : plusieurs événements coup sur
 * coup (ex. plusieurs choix renommés en rafale) ne déclenchent qu'un seul
 * rechargement par scope, à l'issue de cette temporisation.
 */
export const CONFIG_CHANGED_DEBOUNCE_MS = 200;

type ConfigScope = ServerEvents['config.changed']['scope'];

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
  // Passe à `true` au démontage : protège contre les continuations
  // asynchrones (ack de verrou reçu après coup) qui toucheraient encore la
  // grille ou reprogrammeraient un renouvellement jamais nettoyé.
  const disposedRef = useRef(false);

  // Coalescing par scope des `config.changed` reçus en rafale (voir
  // CONFIG_CHANGED_DEBOUNCE_MS) ; init paresseuse pour ne créer qu'UNE seule
  // instance sur toute la durée de vie du hook.
  const debouncedRefreshConfigRef = useRef<ReturnType<
    typeof debouncePerKey<[ConfigScope]>
  > | null>(null);
  if (!debouncedRefreshConfigRef.current) {
    debouncedRefreshConfigRef.current = debouncePerKey<[ConfigScope]>(
      (scope) => {
        void refreshConfig(scope);
      },
      CONFIG_CHANGED_DEBOUNCE_MS,
      (scope) => scope,
    );
  }
  const debouncedRefreshConfig = debouncedRefreshConfigRef.current;

  // 1. Room de la vue (re-jointe automatiquement à chaque reconnexion).
  useEffect(() => {
    joinRoom(roomForView(view, month));
  }, [view, month]);

  // 2. Abonnements socket — montés une seule fois, tous désabonnés au
  // démontage (et jamais réaccumulés : ce useEffect n'a pas de dépendance,
  // il ne s'exécute donc qu'une fois par montage du hook).
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
      onEvent('config.changed', ({ scope }) => debouncedRefreshConfig(scope)),
    ];
    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
      // Une rafale de config.changed peut laisser un rechargement programmé
      // mais pas encore parti : on l'annule, sinon il tournerait après coup
      // sur une vue démontée.
      debouncedRefreshConfig.cancelAll();
    };
  }, [debouncedRefreshConfig]);

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

  // 4. Démontage : coupe le renouvellement de verrou, libère un verrou en
  // cours d'édition et marque le hook comme démonté pour toute continuation
  // asynchrone encore en vol (cf. onCellEditingStarted).
  useEffect(() => {
    return () => {
      disposedRef.current = true;
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

    if (disposedRef.current) {
      // Le composant a été démonté pendant l'attente de l'ack : on ne touche
      // plus ni au store ni à la grille (potentiellement détruite), et on
      // rend immédiatement un verrou éventuellement accordé plutôt que de le
      // garder jusqu'à expiration du TTL serveur.
      if (ack.granted) {
        releaseCellLock(rowId, colKey);
      }
      return;
    }

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
      if (disposedRef.current) {
        return;
      }
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
