import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDTO, UserColumnLayoutDTO } from '@suivi/shared';
import * as api from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { ColumnsPanel, lignesPanneauColonnes } from './ColumnsPanel';

// Seules les routes de disposition perso sont mockées : le reste du module
// (ApiRequestError…) garde son implémentation réelle.
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    getMyColumnLayout: vi.fn(),
    patchMyColumnLayout: vi.fn(),
    resetMyColumnLayout: vi.fn(),
  };
});

function colonne(
  id: string,
  position: number,
  surcharge: Partial<ColumnDTO> = {},
): ColumnDTO {
  return {
    id,
    key: id.replace('col-', ''),
    label: id.replace('col-', '').toUpperCase(),
    type: 'TEXT',
    position,
    width: 150,
    visible: true,
    choices: [],
    ...surcharge,
  };
}

function entree(
  columnId: string,
  surcharge: Partial<UserColumnLayoutDTO> = {},
): UserColumnLayoutDTO {
  return { columnId, width: null, position: null, hidden: false, ...surcharge };
}

const colonnes: ColumnDTO[] = [
  colonne('col-client', 0),
  colonne('col-statut', 1),
  colonne('col-technicien', 2, { visible: false }),
];

beforeEach(() => {
  useAppStore.setState({ columns: colonnes, userLayout: {}, toast: null });
});

describe('lignesPanneauColonnes', () => {
  it('liste les colonnes visibles GLOBALEMENT dans l’ordre effectif, décochées quand masquées perso', () => {
    const lignes = lignesPanneauColonnes(colonnes, {
      'col-statut': { position: 0, hidden: true },
    });
    expect(lignes).toEqual([
      { id: 'col-statut', label: 'STATUT', affichee: false },
      { id: 'col-client', label: 'CLIENT', affichee: true },
    ]);
  });
});

describe('ColumnsPanel', () => {
  it('ouvre le panneau au clic : colonnes visibles globalement listées, les invisibles admin absentes', async () => {
    const user = userEvent.setup();
    render(<ColumnsPanel />);

    expect(screen.queryByTestId('columns-panel')).toBeNull();
    await user.click(screen.getByTestId('columns-panel-toggle'));

    expect(screen.getByTestId('columns-panel')).toBeTruthy();
    expect(
      (screen.getByTestId('column-visible-col-client') as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByTestId('column-visible-col-statut') as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.queryByTestId('column-visible-col-technicien')).toBeNull();
  });

  it('décocher une colonne PATCHe hidden:true sur la route perso et fusionne l’entrée upsertée', async () => {
    const user = userEvent.setup();
    vi.mocked(api.patchMyColumnLayout).mockResolvedValue(
      entree('col-statut', { hidden: true }),
    );
    render(<ColumnsPanel />);

    await user.click(screen.getByTestId('columns-panel-toggle'));
    await user.click(screen.getByTestId('column-visible-col-statut'));

    expect(api.patchMyColumnLayout).toHaveBeenCalledWith('col-statut', { hidden: true });
    await waitFor(() => {
      expect(useAppStore.getState().userLayout['col-statut']).toEqual({ hidden: true });
    });
  });

  it('re-cocher une colonne masquée perso PATCHe hidden:false', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ userLayout: { 'col-statut': { hidden: true } } });
    vi.mocked(api.patchMyColumnLayout).mockResolvedValue(entree('col-statut'));
    render(<ColumnsPanel />);

    await user.click(screen.getByTestId('columns-panel-toggle'));
    const caseStatut = screen.getByTestId('column-visible-col-statut') as HTMLInputElement;
    expect(caseStatut.checked).toBe(false);
    await user.click(caseStatut);

    expect(api.patchMyColumnLayout).toHaveBeenCalledWith('col-statut', { hidden: false });
    await waitFor(() => {
      expect(useAppStore.getState().userLayout['col-statut']).toEqual({});
    });
  });

  it('« Réinitialiser la disposition » : DELETE de la disposition perso puis rechargement du layout', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ userLayout: { 'col-client': { width: 320 } } });
    vi.mocked(api.resetMyColumnLayout).mockResolvedValue({ deleted: 1 });
    vi.mocked(api.getMyColumnLayout).mockResolvedValue([]);
    render(<ColumnsPanel />);

    await user.click(screen.getByTestId('columns-panel-toggle'));
    await user.click(screen.getByTestId('columns-layout-reset'));

    expect(api.resetMyColumnLayout).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(api.getMyColumnLayout).toHaveBeenCalledTimes(1);
      expect(useAppStore.getState().userLayout).toEqual({});
    });
  });

  it('se ferme à Échap et au clic extérieur', async () => {
    const user = userEvent.setup();
    render(<ColumnsPanel />);

    await user.click(screen.getByTestId('columns-panel-toggle'));
    expect(screen.getByTestId('columns-panel')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('columns-panel')).toBeNull();

    await user.click(screen.getByTestId('columns-panel-toggle'));
    expect(screen.getByTestId('columns-panel')).toBeTruthy();
    await user.click(document.body);
    expect(screen.queryByTestId('columns-panel')).toBeNull();
  });
});
