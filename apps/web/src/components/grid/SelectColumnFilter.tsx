'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useGridFilter } from 'ag-grid-react';
import type { CustomFilterProps, CustomFloatingFilterProps } from 'ag-grid-react';
import type { IAfterGuiAttachedParams, IDoesFilterPassParams, IFilter } from 'ag-grid-community';
import type { CellValue, ChoiceDTO, RowDTO } from '@suivi/shared';

/** Libellé de l'entrée qui matche les cellules sans valeur. */
export const LIBELLE_VIDE = '(Vide)';

/**
 * Modèle AG Grid standard du filtre multi-sélection : la liste des entrées
 * cochées, `null` représentant l'entrée « (Vide) ». `setFilterModel(null)`
 * (bouton « Réinitialiser les filtres ») vide donc le filtre sans code dédié.
 */
export interface SelectFilterModel {
  values: (string | null)[];
}

/**
 * Même esprit que la recherche de `SelectCellEditor` (majuscules fr-FR),
 * complétée par la suppression des accents : « resilie » trouve « RÉSILIÉ ».
 */
export function normaliserRecherche(texte: string): string {
  return texte
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('fr-FR');
}

/** Une cellule est « vide » si elle n'a pas de valeur exploitable. */
export function estCelluleVide(valeur: CellValue | undefined): boolean {
  return valeur === null || valeur === undefined || String(valeur) === '';
}

/**
 * Sémantique du filtre : pas de modèle = pas de filtre ; sinon la valeur
 * BRUTE de la cellule doit appartenir aux entrées cochées, l'entrée `null`
 * couvrant les cellules vides.
 */
export function passeLeFiltreSelection(
  model: SelectFilterModel | null,
  valeur: CellValue | undefined,
): boolean {
  if (model === null || model === undefined) return true;
  if (estCelluleVide(valeur)) return model.values.includes(null);
  return model.values.includes(String(valeur));
}

export type SelectColumnFilterProps = CustomFilterProps<RowDTO, unknown, SelectFilterModel> & {
  /** Même source que `SelectCellEditor` : les `ChoiceDTO` de la colonne. */
  choices: ChoiceDTO[];
};

/**
 * Filtre multi-sélection des colonnes SELECT (AG Grid Community, composant
 * React branché via `colDef.filter`). Cases à cocher en pastilles colorées
 * (couleurs métier des choix), recherche insensible casse/accents, actions
 * « Tout cocher » / « Tout décocher », entrée « (Vide) ».
 *
 * Tout coché = modèle null = pas de filtre : la colonne redevient neutre pour
 * `isAnyFilterPresent()` et le compteur « X / N dossiers » existant.
 */
export function SelectColumnFilter({
  model,
  onModelChange,
  choices,
  colDef,
}: SelectColumnFilterProps) {
  const [recherche, setRecherche] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const actifs = useMemo(() => choices.filter((choice) => !choice.archived), [choices]);

  // L'univers des entrées cochables : les labels actifs puis « (Vide) » (null).
  const univers = useMemo<(string | null)[]>(
    () => [...actifs.map((choice) => choice.label), null],
    [actifs],
  );

  // Pas de modèle = tout est coché (état neutre).
  const cochees = useMemo(
    () => new Set<string | null>(model === null || model === undefined ? univers : model.values),
    [model, univers],
  );

  const needle = normaliserRecherche(recherche);
  const choixVisibles = useMemo(
    () =>
      actifs.filter(
        (choice) => needle === '' || normaliserRecherche(choice.label).includes(needle),
      ),
    [actifs, needle],
  );
  const videVisible = needle === '' || normaliserRecherche(LIBELLE_VIDE).includes(needle);

  const basculer = useCallback(
    (entree: string | null) => {
      const prochaines = new Set(cochees);
      if (prochaines.has(entree)) {
        prochaines.delete(entree);
      } else {
        prochaines.add(entree);
      }
      // Tout coché = pas de filtre : on repasse le modèle à null.
      if (univers.every((element) => prochaines.has(element))) {
        onModelChange(null);
        return;
      }
      onModelChange({ values: univers.filter((element) => prochaines.has(element)) });
    },
    [cochees, univers, onModelChange],
  );

  // `doesFilterPass` travaille sur la valeur BRUTE de `data[colKey]`, pas sur
  // une valeur formatée : c'est elle que listent les `ChoiceDTO`.
  const colKey = colDef.colId ?? '';
  const doesFilterPass = useCallback(
    (params: IDoesFilterPassParams<RowDTO>) =>
      passeLeFiltreSelection(model ?? null, params.data.data[colKey]),
    [model, colKey],
  );

  const afterGuiAttached = useCallback((params?: IAfterGuiAttachedParams) => {
    if (!params?.suppressFocus) inputRef.current?.focus();
  }, []);

  useGridFilter({ doesFilterPass, afterGuiAttached });

  return (
    <div data-testid="filtre-selection" style={{ padding: 6, minWidth: 220, maxWidth: 320 }}>
      <input
        ref={inputRef}
        data-testid="filtre-selection-recherche"
        aria-label="Rechercher un choix"
        placeholder="Rechercher…"
        value={recherche}
        onChange={(event) => setRecherche(event.target.value)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '5px 8px',
          border: '1px solid var(--gc-border)',
          borderRadius: 'var(--gc-radius-sm)',
          font: 'inherit',
        }}
      />
      <div style={{ display: 'flex', gap: 6, margin: '6px 0' }}>
        <button
          type="button"
          data-testid="filtre-selection-tout-cocher"
          onClick={() => onModelChange(null)}
          style={styleBoutonAction}
        >
          Tout cocher
        </button>
        <button
          type="button"
          data-testid="filtre-selection-tout-decocher"
          onClick={() => onModelChange({ values: [] })}
          style={styleBoutonAction}
        >
          Tout décocher
        </button>
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          maxHeight: 260,
          overflowY: 'auto',
        }}
      >
        {choixVisibles.map((choice) => (
          <li key={choice.id}>
            <label style={styleLigneChoix}>
              <input
                type="checkbox"
                data-testid={`filtre-choix-${choice.label}`}
                checked={cochees.has(choice.label)}
                onChange={() => basculer(choice.label)}
              />
              <span
                style={{
                  display: 'inline-block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  // Forme du template (pastille) ; les couleurs restent métier.
                  padding: '1px 8px',
                  borderRadius: 'var(--gc-radius-pill)',
                  backgroundColor: choice.bgColor ?? undefined,
                  color: choice.textColor ?? undefined,
                  fontWeight: choice.bold ? 700 : 400,
                }}
              >
                {choice.label}
              </span>
            </label>
          </li>
        ))}
        {videVisible ? (
          <li>
            <label style={styleLigneChoix}>
              <input
                type="checkbox"
                data-testid="filtre-choix-vide"
                checked={cochees.has(null)}
                onChange={() => basculer(null)}
              />
              <span style={{ color: 'var(--gc-muted)', fontStyle: 'italic' }}>{LIBELLE_VIDE}</span>
            </label>
          </li>
        ) : null}
        {choixVisibles.length === 0 && !videVisible ? (
          <li style={{ padding: '4px 6px', color: 'var(--gc-muted)' }}>Aucun choix</li>
        ) : null}
      </ul>
    </div>
  );
}

const styleBoutonAction: React.CSSProperties = {
  flex: 1,
  border: '1px solid var(--gc-border)',
  borderRadius: 'var(--gc-radius-sm)',
  background: 'transparent',
  cursor: 'pointer',
  padding: '3px 6px',
  font: 'inherit',
  fontSize: 12,
  color: 'var(--gc-petrol-soft)',
};

const styleLigneChoix: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  padding: '3px 4px',
  cursor: 'pointer',
  borderRadius: 'var(--gc-radius-sm)',
};

export type SelectColumnFloatingFilterProps = CustomFloatingFilterProps<
  IFilter,
  RowDTO,
  unknown,
  SelectFilterModel
>;

/**
 * Filtre flottant compact du filtre multi-sélection : « Tous » quand la
 * colonne n'est pas filtrée, « N sélectionné(s) » sinon. Le clic ouvre le
 * panneau du filtre parent (`showParentFilter`).
 */
export function SelectColumnFloatingFilter({
  model,
  showParentFilter,
}: SelectColumnFloatingFilterProps) {
  const actif = model !== null && model !== undefined;
  const nombre = actif ? model.values.length : 0;
  const libelle = !actif ? 'Tous' : nombre === 1 ? '1 sélectionné' : `${nombre} sélectionnés`;

  return (
    <button
      type="button"
      data-testid="filtre-flottant-selection"
      aria-label="Ouvrir le filtre de la colonne"
      onClick={() => showParentFilter()}
      style={{
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        border: '1px solid var(--gc-border)',
        borderRadius: 'var(--gc-radius-pill)',
        background: 'var(--gc-surface)',
        cursor: 'pointer',
        padding: '1px 9px',
        font: 'inherit',
        fontSize: 12,
        fontWeight: actif ? 600 : 400,
        color: actif ? 'var(--gc-petrol-soft)' : 'var(--gc-muted)',
      }}
    >
      {libelle}
    </button>
  );
}
