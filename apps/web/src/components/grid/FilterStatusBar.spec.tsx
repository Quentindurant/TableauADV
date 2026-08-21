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
});
