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
