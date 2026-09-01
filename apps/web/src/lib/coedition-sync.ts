'use client';

import type { ColumnDTO, RowDTO, UserColumnLayoutDTO, UserDTO } from '@suivi/shared';
import { ApiRequestError, apiFetch } from './api';
import { roomForView, rowsQueryForView } from './coedition';
import type { GridView } from './store';
import { joinRoom } from './socket';
import { indexerDisposition, useAppStore } from './store';

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
 * Charge colonnes + lignes de la vue donnée. Renvoie `null` si la vue
 * affichée a changé pendant l'attente réseau (garde anti-obsolescence) :
 * ces données ne correspondent plus à rien d'affiché, les appliquer
 * écraserait la vue désormais courante avec celles d'une autre vue.
 */
async function loadColumnsAndRows(
  view: GridView,
  month: string,
): Promise<{ columns: ColumnDTO[]; rows: RowDTO[] } | null> {
  const [columns, rows] = await Promise.all([
    apiFetch<ColumnDTO[]>('/columns'),
    apiFetch<RowDTO[]>(rowsQueryForView(view, month)),
  ]);
  const current = useAppStore.getState();
  if (current.view !== view || current.monthCourant !== month) {
    return null;
  }
  return { columns, rows };
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
    const data = await loadColumnsAndRows(view, month);
    if (!data) {
      return;
    }
    useAppStore.getState().setColumns(data.columns);
    useAppStore.getState().setRows(data.rows);
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
    if (scope === 'choices') {
      // Un renommage de valeur de liste propage le nouveau libellé sur les
      // lignes existantes côté serveur (UPDATE en masse, cf. choices.service).
      // Sans rechargement des lignes de la vue courante, les cellules
      // affichées chez les autres clients gardent l'ancien libellé et
      // perdent leur pastille de couleur (il ne correspond plus à aucun
      // choix) jusqu'à un rechargement manuel.
      const { view, monthCourant } = useAppStore.getState();
      const data = await loadColumnsAndRows(view, monthCourant);
      if (!data) {
        return;
      }
      useAppStore.getState().setColumns(data.columns);
      useAppStore.getState().setRows(data.rows);
      return;
    }
    // Les colonnes elles-mêmes sont imbriquées dans ColumnDTO.choices : un
    // seul appel couvre le scope « columns ». La disposition PERSONNELLE est
    // rechargée en parallèle puis ré-appliquée APRÈS le global : sans cela,
    // un config.changed admin ferait perdre à la grille les largeurs/ordre/
    // masquages propres à l'utilisateur (une colonne créée entre-temps garde,
    // elle, sa place et sa largeur standards, faute d'entrée perso).
    const [columns, layout] = await Promise.all([
      apiFetch<ColumnDTO[]>('/columns'),
      apiFetch<UserColumnLayoutDTO[]>('/me/column-layout'),
    ]);
    useAppStore.getState().setColumns(columns);
    useAppStore.getState().setUserLayout(indexerDisposition(layout));
  } catch (error) {
    handleSyncError(error, deps);
  }
}
