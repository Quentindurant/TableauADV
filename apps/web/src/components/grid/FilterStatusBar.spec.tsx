import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RowDTO } from '@suivi/shared';
import { useAppStore } from '../../lib/store';
import { FilterStatusBar, compteurDossiers } from './FilterStatusBar';

function fakeRow(id: string): RowDTO {
  return {
    id,
    month: '2026-08',
    position: 0,
    data: {},
    formats: {},
    version: 1,
    archived: false,
    updatedAt: '2026-08-10T10:00:00.000Z',
  };
}

describe('compteurDossiers', () => {
  it('rend « N dossiers » sans filtre actif', () => {
    expect(compteurDossiers(42, 42, false)).toBe('42 dossiers');
    expect(compteurDossiers(0, 0, false)).toBe('0 dossier');
    expect(compteurDossiers(1, 1, false)).toBe('1 dossier');
  });

  it('rend « X / N dossiers » quand un filtre est actif', () => {
    expect(compteurDossiers(12, 42, true)).toBe('12 / 42 dossiers');
    expect(compteurDossiers(0, 1, true)).toBe('0 / 1 dossier');
  });
});

describe('FilterStatusBar', () => {
  beforeEach(() => {
    useAppStore.setState({
      rows: [fakeRow('a'), fakeRow('b'), fakeRow('c')],
      displayedRowCount: 3,
      filtersActive: false,
    });
    useAppStore.getState().setClearFilters(null);
    useAppStore.getState().setImprimerTableau(null);
  });

  it('affiche le total du mois sans bouton de réinitialisation', () => {
    render(<FilterStatusBar />);
    expect(screen.getByTestId('row-counter').textContent).toBe('3 dossiers');
    expect(screen.queryByTestId('filters-reset')).toBeNull();
  });

  it('affiche « X / N » et le bouton de réinitialisation quand un filtre est actif', () => {
    useAppStore.setState({ displayedRowCount: 1, filtersActive: true });
    render(<FilterStatusBar />);
    expect(screen.getByTestId('row-counter').textContent).toBe('1 / 3 dossiers');
    expect(screen.getByTestId('filters-reset')).toBeTruthy();
  });

  it('le bouton déclenche la remise à zéro des filtres de la grille', async () => {
    const user = userEvent.setup();
    const clear = vi.fn();
    useAppStore.getState().setClearFilters(clear);
    useAppStore.setState({ displayedRowCount: 1, filtersActive: true });
    render(<FilterStatusBar />);
    await user.click(screen.getByTestId('filters-reset'));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('le bouton « Imprimer » déclenche l’impression branchée par la grille', async () => {
    const user = userEvent.setup();
    const imprimer = vi.fn();
    useAppStore.getState().setImprimerTableau(imprimer);
    render(<FilterStatusBar />);
    await user.click(screen.getByTestId('print-table'));
    expect(imprimer).toHaveBeenCalledTimes(1);
  });

  it('une pastille de surlignage filtre au clic et se libère au second clic', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ surlignageFiltre: null });
    render(<FilterStatusBar />);
    const jaune = screen.getByTestId('filtre-surlignage-Jaune');
    await user.click(jaune);
    expect(useAppStore.getState().surlignageFiltre).toBe('#F7DC6F');
    expect(jaune.getAttribute('aria-pressed')).toBe('true');
    await user.click(jaune);
    expect(useAppStore.getState().surlignageFiltre).toBeNull();
  });

  it('choisir une autre pastille remplace le filtre couleur courant', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ surlignageFiltre: '#F7DC6F' });
    render(<FilterStatusBar />);
    await user.click(screen.getByTestId('filtre-surlignage-Rouge'));
    expect(useAppStore.getState().surlignageFiltre).toBe('#EE7A6D');
  });

  it('le sélecteur de colonne apparaît avec une couleur active et cible le filtre', async () => {
    const user = userEvent.setup();
    useAppStore.setState({
      surlignageFiltre: null,
      surlignageColonne: null,
      columns: [
        {
          id: 'col-impe',
          key: 'impe',
          label: 'IMPE',
          type: 'DATE',
          position: 0,
          width: 110,
          visible: true,
          choices: [],
        },
      ],
    });
    render(<FilterStatusBar />);
    expect(screen.queryByTestId('filtre-surlignage-colonne')).toBeNull();
    await user.click(screen.getByTestId('filtre-surlignage-Jaune'));
    await user.selectOptions(screen.getByTestId('filtre-surlignage-colonne'), 'impe');
    expect(useAppStore.getState().surlignageColonne).toBe('impe');
    // Couleur levée : le ciblage de colonne est levé aussi.
    await user.click(screen.getByTestId('filtre-surlignage-Jaune'));
    expect(useAppStore.getState().surlignageColonne).toBeNull();
  });
});
