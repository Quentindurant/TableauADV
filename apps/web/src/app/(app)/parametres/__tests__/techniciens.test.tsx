import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChoiceDTO, ColumnDTO } from '@suivi/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/api', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../../../../lib/api';
import TechniciensTab from '../techniciens';

const apiFetchMock = vi.mocked(apiFetch);

function choix(partiel: Partial<ChoiceDTO> & { id: string; label: string }): ChoiceDTO {
  return {
    columnId: 'col-nom-tech',
    bgColor: null,
    textColor: null,
    bold: false,
    position: 0,
    archived: false,
    ...partiel,
  };
}

const MARC = choix({ id: 'tech1', label: 'MARC', bgColor: '#9BDEB4', textColor: '#176638', position: 0 });
const SOPHIE = choix({ id: 'tech2', label: 'SOPHIE', position: 1 });

const COLONNE_NOM_TECH: ColumnDTO = {
  id: 'col-nom-tech',
  key: 'nom_tech',
  label: 'NOM TECH',
  type: 'SELECT',
  position: 7,
  width: 140,
  visible: true,
  choices: [SOPHIE, MARC],
};

const COLONNE_STATUT: ColumnDTO = {
  id: 'col-statut',
  key: 'statut',
  label: 'INSTALLATION',
  type: 'SELECT',
  position: 11,
  width: 150,
  visible: true,
  choices: [choix({ id: 'ch-statut', label: 'NEW', columnId: 'col-statut' })],
};

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('TechniciensTab — référentiel des techniciens terrain', () => {
  it('affiche les techniciens en pastilles triées, sans sélecteur de colonne', async () => {
    apiFetchMock.mockResolvedValueOnce([COLONNE_STATUT, COLONNE_NOM_TECH]);

    render(<TechniciensTab />);

    const pastille = await screen.findByTestId('pastille-tech1');
    expect(pastille).toHaveTextContent('MARC');
    expect(pastille).toHaveStyle({ backgroundColor: '#9BDEB4', color: '#176638' });

    const elements = screen.getAllByTestId(/^pastille-/);
    expect(elements.map((e) => e.getAttribute('data-testid'))).toEqual([
      'pastille-tech1',
      'pastille-tech2',
    ]);

    expect(screen.getByRole('region', { name: 'Techniciens terrain' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Colonne de type liste')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pastille-ch-statut')).not.toBeInTheDocument();
  });

  it('ajoute un technicien via POST /columns/:id/choices', async () => {
    const utilisateur = userEvent.setup();
    const cree = choix({ id: 'tech9', label: 'KARIM', position: 2 });
    apiFetchMock.mockResolvedValueOnce([COLONNE_NOM_TECH]).mockResolvedValueOnce(cree);

    render(<TechniciensTab />);
    await screen.findByTestId('pastille-tech1');

    await utilisateur.type(screen.getByLabelText('Nouveau technicien'), 'KARIM');
    await utilisateur.click(screen.getByRole('button', { name: 'Ajouter le technicien' }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/columns/col-nom-tech/choices', {
        method: 'POST',
        body: JSON.stringify({
          label: 'KARIM',
          bgColor: '#ffffff',
          textColor: '#000000',
          bold: false,
        }),
      }),
    );
    expect(await screen.findByTestId('pastille-tech9')).toHaveTextContent('KARIM');
    expect(screen.getByLabelText('Nouveau technicien')).toHaveValue('');
  });

  it('renomme un technicien via PATCH /choices/:id', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock
      .mockResolvedValueOnce([COLONNE_NOM_TECH])
      .mockResolvedValueOnce({ ...MARC, label: 'MARCO' });

    render(<TechniciensTab />);
    await utilisateur.click(await screen.findByRole('button', { name: 'Renommer le choix MARC' }));

    const champ = screen.getByLabelText('Nouveau libellé de MARC');
    await utilisateur.clear(champ);
    await utilisateur.type(champ, 'MARCO{Enter}');

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/choices/tech1', {
        method: 'PATCH',
        body: JSON.stringify({ label: 'MARCO' }),
      }),
    );
    expect(screen.getByTestId('pastille-tech1')).toHaveTextContent('MARCO');
  });

  it('supprime un technicien inutilisé après confirmation', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce([COLONNE_NOM_TECH]).mockResolvedValueOnce(undefined);

    render(<TechniciensTab />);
    await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer MARC' }));

    const dialogue = screen.getByRole('dialog');
    expect(dialogue).toHaveTextContent('Supprimer la valeur « MARC » ?');
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/choices/tech1', { method: 'DELETE' }),
    );
    expect(screen.queryByTestId('pastille-tech1')).not.toBeInTheDocument();
  });

  it('sur 409 CHOICE_IN_USE, garde le dialogue ouvert et propose l’archivage', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock
      .mockResolvedValueOnce([COLONNE_NOM_TECH])
      .mockRejectedValueOnce({ status: 409, code: 'CHOICE_IN_USE', message: 'utilisée' });

    render(<TechniciensTab />);
    await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer MARC' }));
    await utilisateur.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' }));

    const dialogue = await screen.findByRole('dialog');
    expect(dialogue).toHaveTextContent('utilisée par des lignes existantes');
    expect(within(dialogue).getByRole('button', { name: 'Archiver à la place' })).toBeInTheDocument();
    expect(screen.getByTestId('pastille-tech1')).toBeInTheDocument();
  });
});
