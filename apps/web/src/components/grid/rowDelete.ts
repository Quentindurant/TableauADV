import { messageForError } from './cellCommit';

export interface SuppressionLigneDeps {
  deleteRow: (id: string) => Promise<void>;
  removeRow: (rowId: string) => void;
  reload: () => Promise<void>;
  showToast: (message: string, kind?: 'error' | 'info') => void;
}

/**
 * Suppression d'une ligne, après confirmation par le dialogue : retrait
 * optimiste du store (l'événement temps réel `row.deleted` ne fera que
 * confirmer, `applyRowDeleted` étant idempotent) puis DELETE /rows/:id.
 * Si l'API refuse, toast d'erreur et rechargement pour restaurer la ligne.
 */
export async function supprimerLigne(rowId: string, deps: SuppressionLigneDeps): Promise<void> {
  deps.removeRow(rowId);
  try {
    await deps.deleteRow(rowId);
  } catch (error: unknown) {
    deps.showToast(messageForError(error), 'error');
    await deps.reload();
  }
}
