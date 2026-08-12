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
