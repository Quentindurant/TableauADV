'use client';

import { useEffect } from 'react';
import { formatMonthLabel } from './MonthNav';

export interface MonthReportDialogProps {
  /** Mois source du report (`YYYY-MM`), dernier mois actif existant. */
  from: string;
  /** Mois cible en cours de création (`YYYY-MM`). */
  to: string;
  /** Nombre de dossiers candidats au report (toujours > 0 ici). */
  count: number;
  /** Appel en cours : les trois boutons et Échap sont neutralisés. */
  busy?: boolean;
  onReport: () => void;
  onCreateEmpty: () => void;
  onCancel: () => void;
}

/**
 * Confirmation à la création d'un mois via le « + » quand des dossiers du
 * dernier mois existant sont candidats au report : même structure que
 * RowDeleteDialog (role="dialog", surimpression, chrome gc-*), avec trois
 * choix — Reprendre (primaire), Créer vide (comportement historique), Annuler.
 */
export function MonthReportDialog({
  from,
  to,
  count,
  busy = false,
  onReport,
  onCreateEmpty,
  onCancel,
}: MonthReportDialogProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, busy]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reprendre les dossiers du mois précédent"
      data-testid="month-report-dialog"
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
        {count} {count > 1 ? 'dossiers repris' : 'dossier repris'} depuis{' '}
        {formatMonthLabel(from)}
      </p>
      <p style={{ margin: '0 0 14px', color: 'var(--gc-muted)' }}>
        Date d&apos;installation en {formatMonthLabel(to)} ou sans date, hors
        clôturés/annulés.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          data-testid="month-report-confirm"
          className="gc-btn-primary"
          disabled={busy}
          autoFocus
          onClick={onReport}
        >
          Reprendre
        </button>
        <button
          type="button"
          data-testid="month-report-empty"
          disabled={busy}
          onClick={onCreateEmpty}
        >
          Créer vide
        </button>
        <button
          type="button"
          data-testid="month-report-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
