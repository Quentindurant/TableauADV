import type { CellFormat, CellValue, RowDTO } from '@suivi/shared';
import { ApiRequestError, apiFetch } from '../../lib/api';
import { useAppStore } from '../../lib/store';

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
    try {
      await deps.reload();
    } catch {
      // Panne doublée : le rechargement a échoué aussi.
      // La valeur optimiste reste affichée → avertissement explicite.
      deps.showToast(
        'Modification non enregistrée et affichage non actualisé. Rechargez la page pour retrouver les données à jour.',
        'error',
      );
    }
  }
}

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
 * `expectedVersion`, puis confirmation (nouvelle version) ou rollback fin
 * (par clé, sans recharger tout le mois).
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
    try {
      await deps.reload();
    } catch {
      // Panne doublée : le rechargement a échoué aussi.
      // La valeur optimiste reste affichée → avertissement explicite.
      deps.showToast(
        'Modification non enregistrée et affichage non actualisé. Rechargez la page pour retrouver les données à jour.',
        'error',
      );
    }
  }
}
