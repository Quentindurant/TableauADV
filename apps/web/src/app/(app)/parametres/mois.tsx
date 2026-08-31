'use client';

import type { MonthInfo } from '@suivi/shared';
import { useCallback, useEffect, useState } from 'react';

import { formatMonthLabel } from '../../../components/grid/MonthNav';
import {
  deleteMonth,
  getCorbeille,
  getMonths,
  restoreMonth,
  type CorbeilleEntryDTO,
} from '../../../lib/api';
import { aCodeErreur, messageErreurApi } from './messages';

/** `2026-08-31T10:12:00.000Z` → `31/08/2026 à 11:12` (heure locale). */
export function formatDateSuppression(iso: string): string {
  const date = new Date(iso);
  const jour = date.toLocaleDateString('fr-FR');
  const heure = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${jour} à ${heure}`;
}

function pluriel(count: number): string {
  return count > 1 ? 'dossiers' : 'dossier';
}

export interface MonthDeleteDialogProps {
  /** Mois à supprimer (`YYYY-MM`). */
  month: string;
  /** Nombre de dossiers actifs du mois. */
  count: number;
  /** Appel en cours : les deux boutons et Échap sont neutralisés. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation avant suppression d'un mois : même structure que
 * MonthReportDialog (role="dialog", surimpression, chrome gc-*), avec le
 * focus initial sur Annuler — la suppression reste un geste volontaire.
 */
export function MonthDeleteDialog({
  month,
  count,
  busy = false,
  onConfirm,
  onCancel,
}: MonthDeleteDialogProps) {
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
      aria-label={`Confirmer la suppression de ${formatMonthLabel(month)}`}
      data-testid="month-delete-dialog"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1100,
        minWidth: 320,
        maxWidth: 420,
        background: 'var(--gc-surface)',
        border: '1px solid var(--gc-border)',
        borderRadius: 'var(--gc-radius)',
        boxShadow: 'var(--gc-shadow-lg)',
        padding: '18px 20px',
        fontSize: 13,
      }}
    >
      <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--gc-petrol)' }}>
        Supprimer {formatMonthLabel(month)} et ses {count} {pluriel(count)} ?
      </p>
      <p style={{ margin: '0 0 14px', color: 'var(--gc-muted)' }}>
        Les dossiers archivés sont conservés. Restauration possible depuis la
        corbeille jusqu’à la prochaine suppression de ce mois.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          data-testid="month-delete-cancel"
          disabled={busy}
          autoFocus
          onClick={onCancel}
        >
          Annuler
        </button>
        <button
          type="button"
          data-testid="month-delete-confirm"
          style={{ color: 'var(--gc-danger)', fontWeight: 700 }}
          disabled={busy}
          onClick={onConfirm}
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}

/**
 * Onglet « Mois » : suppression d'un mois entier (les archivés restent) et
 * corbeille de restauration — un instantané par mois, écrasé à chaque
 * nouvelle suppression. Les messages de succès s'affichent en role="status"
 * comme dans les autres onglets des Paramètres.
 */
export default function MoisTab() {
  const [mois, setMois] = useState<MonthInfo[]>([]);
  const [corbeille, setCorbeille] = useState<CorbeilleEntryDTO[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<MonthInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async (): Promise<void> => {
    try {
      const [actifs, supprimes] = await Promise.all([getMonths(), getCorbeille()]);
      // Du plus récent au plus ancien, comme le menu des mois de la grille.
      setMois([...actifs].sort((a, b) => b.month.localeCompare(a.month)));
      // La corbeille arrive déjà triée du plus récent au plus ancien.
      setCorbeille(supprimes);
      setErreur(null);
    } catch (err) {
      setErreur(messageErreurApi(err));
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const confirmerSuppression = async (): Promise<void> => {
    if (aSupprimer === null) return;
    const libelle = formatMonthLabel(aSupprimer.month);
    setBusy(true);
    setInfo(null);
    try {
      const { deleted } = await deleteMonth(aSupprimer.month);
      setASupprimer(null);
      setInfo(`${libelle} supprimé (${deleted} ${pluriel(deleted)}).`);
      setErreur(null);
      await charger();
    } catch (err) {
      setASupprimer(null);
      setErreur(messageErreurApi(err));
    } finally {
      setBusy(false);
    }
  };

  const restaurer = async (entree: CorbeilleEntryDTO): Promise<void> => {
    if (busy) {
      return;
    }
    const libelle = formatMonthLabel(entree.month);
    // Confirmation légère : la restauration n'écrase rien (409 sinon).
    if (!window.confirm(`Restaurer ${libelle} (${entree.count} ${pluriel(entree.count)}) ?`)) {
      return;
    }
    setInfo(null);
    setBusy(true);
    try {
      const { restored } = await restoreMonth(entree.month);
      setInfo(`${libelle} restauré (${restored} ${pluriel(restored)}).`);
      setErreur(null);
      await charger();
    } catch (err) {
      if (aCodeErreur(err, 'VERSION_CONFLICT')) {
        setErreur('Le mois contient déjà des dossiers — restauration impossible.');
        return;
      }
      setErreur(messageErreurApi(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Mois">
      {erreur !== null && <p role="alert">{erreur}</p>}
      {info !== null && <p role="status">{info}</p>}

      <h3>Mois actifs</h3>
      <ul>
        {mois.map((element) => (
          <li key={element.month} data-testid={`mois-actif-${element.month}`}>
            <strong>{formatMonthLabel(element.month)}</strong>{' '}
            <span>
              {element.count} {pluriel(element.count)}
            </span>{' '}
            <button
              type="button"
              aria-label={`Supprimer ${formatMonthLabel(element.month)}`}
              onClick={() => setASupprimer(element)}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>

      <h3>Corbeille</h3>
      {corbeille.length === 0 ? (
        <p style={{ color: 'var(--gc-muted)' }}>La corbeille est vide.</p>
      ) : (
        <ul>
          {corbeille.map((entree) => (
            <li key={entree.month} data-testid={`corbeille-${entree.month}`}>
              <strong>{formatMonthLabel(entree.month)}</strong>{' '}
              <span>supprimé le {formatDateSuppression(entree.deletedAt)}</span>{' '}
              <span>
                {entree.count} {pluriel(entree.count)}
              </span>{' '}
              <button
                type="button"
                aria-label={`Restaurer ${formatMonthLabel(entree.month)}`}
                onClick={() => {
                  void restaurer(entree);
                }}
              >
                Restaurer
              </button>
            </li>
          ))}
        </ul>
      )}

      {aSupprimer !== null && (
        <MonthDeleteDialog
          month={aSupprimer.month}
          count={aSupprimer.count}
          busy={busy}
          onConfirm={() => {
            void confirmerSuppression();
          }}
          onCancel={() => setASupprimer(null)}
        />
      )}
    </section>
  );
}
