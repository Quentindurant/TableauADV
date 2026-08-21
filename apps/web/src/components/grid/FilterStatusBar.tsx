'use client';

import { useAppStore } from '../../lib/store';

/** « 12 / 42 dossiers » sous filtre actif, sinon « 42 dossiers ». */
export function compteurDossiers(
  displayed: number,
  total: number,
  filtersActive: boolean,
): string {
  const unit = total > 1 ? 'dossiers' : 'dossier';
  return filtersActive ? `${displayed} / ${total} ${unit}` : `${total} ${unit}`;
}

/**
 * Compteur de dossiers du mois + remise à zéro des filtres personnels.
 * Purement client : chaque ADV voit son propre état de filtres AG Grid.
 */
export function FilterStatusBar() {
  const total = useAppStore((state) => state.rows.length);
  const displayed = useAppStore((state) => state.displayedRowCount);
  const filtersActive = useAppStore((state) => state.filtersActive);
  const clearFilters = useAppStore((state) => state.clearFilters);

  return (
    <>
      <span data-testid="row-counter" className="gc-count">
        {compteurDossiers(displayed, total, filtersActive)}
      </span>
      {filtersActive ? (
        <button
          type="button"
          data-testid="filters-reset"
          onClick={clearFilters}
          className="gc-tab gc-monthnav__reset"
        >
          Réinitialiser les filtres
        </button>
      ) : null}
    </>
  );
}
