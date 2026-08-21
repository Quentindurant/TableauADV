'use client';

import { useEffect } from 'react';
import type { RowDTO } from '@suivi/shared';

export interface RowDeleteDialogProps {
  row: RowDTO;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation avant suppression définitive d'une ligne : même structure que
 * les dialogues des Paramètres (role="dialog", Annuler / Supprimer), posée en
 * surimpression de la grille avec le chrome gc-* du menu contextuel.
 */
export function RowDeleteDialog({ row, onCancel, onConfirm }: RowDeleteDialogProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirmer la suppression de la ligne"
      data-testid="row-delete-dialog"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1100,
        minWidth: 320,
        background: 'var(--gc-surface)',
        border: '1px solid var(--gc-border)',
        borderRadius: 'var(--gc-radius)',
        boxShadow: 'var(--gc-shadow-lg)',
        padding: '18px 20px',
        fontSize: 13,
      }}
    >
      <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--gc-petrol)' }}>
        Supprimer la ligne {row.position + 1} ?
      </p>
      <p style={{ margin: '0 0 14px', color: 'var(--gc-muted)' }}>
        Cette action est définitive et ne peut pas être annulée.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" data-testid="row-delete-cancel" onClick={onCancel}>
          Annuler
        </button>
        <button
          type="button"
          data-testid="row-delete-confirm"
          style={{ color: 'var(--gc-danger)', fontWeight: 700 }}
          onClick={onConfirm}
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}
