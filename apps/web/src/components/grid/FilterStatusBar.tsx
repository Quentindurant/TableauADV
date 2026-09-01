'use client';

import { useAppStore } from '../../lib/store';
import { ColumnsPanel } from './ColumnsPanel';
import { HIGHLIGHT_COLORS } from './HighlightPalette';

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
 * Compteur de dossiers du mois + remise à zéro des filtres personnels +
 * panneau « Colonnes » (disposition personnelle). Purement client pour les
 * filtres : chaque ADV voit son propre état de filtres AG Grid.
 */
export function FilterStatusBar() {
  const total = useAppStore((state) => state.rows.length);
  const displayed = useAppStore((state) => state.displayedRowCount);
  const filtersActive = useAppStore((state) => state.filtersActive);
  const clearFilters = useAppStore((state) => state.clearFilters);
  const surlignageFiltre = useAppStore((state) => state.surlignageFiltre);
  const setSurlignageFiltre = useAppStore((state) => state.setSurlignageFiltre);
  const surlignageColonne = useAppStore((state) => state.surlignageColonne);
  const setSurlignageColonne = useAppStore((state) => state.setSurlignageColonne);
  const columns = useAppStore((state) => state.columns);

  return (
    <>
      <span data-testid="row-counter" className="gc-count">
        {compteurDossiers(displayed, total, filtersActive)}
      </span>
      <span
        role="group"
        aria-label="Filtrer par couleur de surlignage"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
      >
        {HIGHLIGHT_COLORS.map(({ label, value }) => {
          const actif = surlignageFiltre === value;
          return (
            <button
              key={value}
              type="button"
              data-testid={`filtre-surlignage-${label}`}
              title={
                actif
                  ? `Ne plus filtrer sur le surlignage ${label}`
                  : `Ne montrer que les lignes surlignées en ${label}`
              }
              aria-pressed={actif}
              onClick={() => {
                setSurlignageFiltre(actif ? null : value);
                // Couleur levée = ciblage de colonne levé aussi : la
                // prochaine couleur repart de « Toutes colonnes », sans
                // ciblage fantôme hérité du filtre précédent.
                if (actif) setSurlignageColonne(null);
              }}
              style={{
                width: 16,
                height: 16,
                padding: 0,
                borderRadius: '50%',
                // Couleur métier de la palette surligneur — jamais un token.
                background: value,
                border: '1px solid rgba(16, 53, 59, 0.25)',
                outline: actif ? '2px solid var(--gc-accent)' : 'none',
                outlineOffset: 1,
                cursor: 'pointer',
              }}
            />
          );
        })}
        {surlignageFiltre !== null ? (
          <select
            data-testid="filtre-surlignage-colonne"
            aria-label="Colonne ciblée par le filtre couleur"
            value={surlignageColonne ?? ''}
            onChange={(event) => setSurlignageColonne(event.target.value === '' ? null : event.target.value)}
            style={{ fontSize: 12, maxWidth: 150, padding: '2px 6px' }}
          >
            <option value="">Toutes colonnes</option>
            {columns
              .filter((column) => column.visible)
              .map((column) => (
                <option key={column.id} value={column.key}>
                  {column.label}
                </option>
              ))}
          </select>
        ) : null}
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
      <ColumnsPanel />
    </>
  );
}
