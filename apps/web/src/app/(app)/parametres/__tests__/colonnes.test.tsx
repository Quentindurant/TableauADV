import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDTO } from '@suivi/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/api', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../../../../lib/api';
import ColonnesTab, { trierParPosition } from '../colonnes';

const apiFetchMock = vi.mocked(apiFetch);

function colonne(partiel: Partial<ColumnDTO> & { id: string; key: string; label: string }): ColumnDTO {
  return {
    type: 'TEXT',
    position: 0,
    width: 150,
    visible: true,
    choices: [],
    ...partiel,
  };
}

const CLIENT = colonne({ id: 'c1', key: 'client', label: 'CLIENT', position: 1, width: 220 });
const STATUT = colonne({ id: 'c2', key: 'statut', label: 'INSTALLATION', position: 0, type: 'SELECT', width: 150 });

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('ColonnesTab — lecture et ajout', () => {
  it('trierParPosition ordonne sans muter la source', () => {
    const source = [CLIENT, STATUT];
    expect(trierParPosition(source).map((c) => c.key)).toEqual(['statut', 'client']);
    expect(source.map((c) => c.key)).toEqual(['client', 'statut']);
  });

  it('charge GET /columns et affiche les colonnes triées par position', async () => {
    apiFetchMock.mockResolvedValueOnce([CLIENT, STATUT]);

    render(<ColonnesTab />);

    await waitFor(() => expect(screen.getByText('CLIENT')).toBeInTheDocument());
    expect(apiFetchMock).toHaveBeenCalledWith('/columns');

    const lignes = screen.getAllByRole('row').slice(1);
    expect(lignes[0]).toHaveAttribute('data-testid', 'colonne-statut');
    expect(lignes[1]).toHaveAttribute('data-testid', 'colonne-client');
  });

  it('rend le select de type actif ; le changer envoie PATCH /columns/:id {type} et avertit', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock
      .mockResolvedValueOnce([STATUT])
      .mockResolvedValueOnce({ ...STATUT, type: 'NUMBER' });

    render(<ColonnesTab />);

    const select = await screen.findByLabelText('Type de la colonne INSTALLATION');
    expect(select).not.toBeDisabled();
    expect(select).toHaveValue('SELECT');

    await utilisateur.selectOptions(select, 'NUMBER');

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/columns/c2', {
        method: 'PATCH',
        body: JSON.stringify({ type: 'NUMBER' }),
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Les valeurs existantes ne sont pas converties',
    );
    expect(select).toHaveValue('NUMBER');
  });

  it('ajoute une colonne via POST /columns et l’affiche', async () => {
    const utilisateur = userEvent.setup();
    const creee = colonne({ id: 'c3', key: 'suivi_sav', label: 'SUIVI SAV', position: 2, type: 'LONGTEXT' });
    apiFetchMock.mockResolvedValueOnce([STATUT, CLIENT]).mockResolvedValueOnce(creee);

    render(<ColonnesTab />);
    await screen.findByText('CLIENT');

    await utilisateur.type(screen.getByLabelText('Libellé'), 'SUIVI SAV');
    await utilisateur.selectOptions(screen.getByLabelText('Type'), 'LONGTEXT');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la colonne' }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/columns', {
        method: 'POST',
        body: JSON.stringify({ label: 'SUIVI SAV', type: 'LONGTEXT' }),
      }),
    );
    expect(await screen.findByText('SUIVI SAV')).toBeInTheDocument();
    expect(screen.getByLabelText('Libellé')).toHaveValue('');
  });

  it('refuse un libellé vide sans appeler l’API', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce([STATUT]);

    render(<ColonnesTab />);
    await screen.findByText('INSTALLATION');

    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la colonne' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Le libellé de la colonne est obligatoire.');
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('affiche un message français quand la session a expiré (AUTH_REQUIRED)', async () => {
    apiFetchMock.mockRejectedValueOnce({ status: 401, code: 'AUTH_REQUIRED', message: 'Non authentifié' });

    render(<ColonnesTab />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Votre session a expiré : veuillez vous reconnecter.',
    );
  });
});
