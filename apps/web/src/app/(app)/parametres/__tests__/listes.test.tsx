import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChoiceDTO, ColumnDTO } from '@suivi/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/api', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../../../../lib/api';
import ListesTab, { hexPourInput, stylePastille } from '../listes';

const apiFetchMock = vi.mocked(apiFetch);

function choix(partiel: Partial<ChoiceDTO> & { id: string; label: string }): ChoiceDTO {
  return {
    columnId: 'col-statut',
    bgColor: null,
    textColor: null,
    bold: false,
    position: 0,
    archived: false,
    ...partiel,
  };
}

const NEW = choix({
  id: 'ch1',
  label: 'NEW',
  bgColor: '#FFFF00',
  textColor: '#FF0000',
  bold: true,
  position: 0,
});
const CLOTUREE = choix({
  id: 'ch2',
  label: 'CLOTUREE',
  bgColor: '#A6A6A6',
  textColor: '#ABEBC6',
  position: 1,
});

const COLONNE_STATUT: ColumnDTO = {
  id: 'col-statut',
  key: 'statut',
  label: 'INSTALLATION',
  type: 'SELECT',
  position: 11,
  width: 150,
  visible: true,
  choices: [CLOTUREE, NEW],
};

const COLONNE_TECH: ColumnDTO = {
  id: 'col-tech',
  key: 'tech',
  label: 'TECH',
  type: 'SELECT',
  position: 8,
  width: 130,
  visible: true,
  choices: [choix({ id: 'ch3', label: 'DIRECT', columnId: 'col-tech', textColor: '#009ADF', bold: true })],
};

const COLONNE_CLIENT: ColumnDTO = {
  id: 'col-client',
  key: 'client',
  label: 'CLIENT',
  type: 'TEXT',
  position: 1,
  width: 220,
  visible: true,
  choices: [],
};

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('ListesTab — sélection, pastilles et couleurs', () => {
  it('hexPourInput normalise en minuscules et retombe sur le défaut', () => {
    expect(hexPourInput('#FFFF00', '#ffffff')).toBe('#ffff00');
    expect(hexPourInput(null, '#ffffff')).toBe('#ffffff');
    expect(hexPourInput('rouge', '#000000')).toBe('#000000');
  });

  it('stylePastille traduit fond, texte et gras', () => {
    expect(stylePastille(NEW)).toMatchObject({
      backgroundColor: '#FFFF00',
      color: '#FF0000',
      fontWeight: 700,
    });
    expect(stylePastille(choix({ id: 'x', label: 'A DISTANCE' }))).toMatchObject({
      backgroundColor: 'transparent',
      color: 'inherit',
      fontWeight: 400,
    });
  });

  it('ne propose que les colonnes de type liste, dans l’ordre des positions', async () => {
    apiFetchMock.mockResolvedValueOnce([COLONNE_CLIENT, COLONNE_STATUT, COLONNE_TECH]);

    render(<ListesTab />);

    const selecteur = await screen.findByLabelText('Colonne de type liste');
    const options = Array.from(selecteur.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['TECH', 'INSTALLATION']);
  });

  it('affiche les choix de la colonne sélectionnée, triés, avec leur pastille', async () => {
    apiFetchMock.mockResolvedValueOnce([COLONNE_STATUT]);

    render(<ListesTab />);

    const pastille = await screen.findByTestId('pastille-ch1');
    expect(pastille).toHaveTextContent('NEW');
    expect(pastille).toHaveStyle({ backgroundColor: '#FFFF00', color: '#FF0000' });

    const elements = screen.getAllByTestId(/^pastille-/);
    expect(elements.map((e) => e.getAttribute('data-testid'))).toEqual([
      'pastille-ch1',
      'pastille-ch2',
    ]);
  });

  it('met à jour la pastille immédiatement puis enregistre la couleur de fond', async () => {
    apiFetchMock
      .mockResolvedValueOnce([COLONNE_STATUT])
      .mockResolvedValueOnce({ ...NEW, bgColor: '#00ff00' });

    render(<ListesTab />);
    const champ = await screen.findByLabelText('Couleur de fond de NEW');

    fireEvent.change(champ, { target: { value: '#00ff00' } });
    expect(screen.getByTestId('pastille-ch1')).toHaveStyle({ backgroundColor: '#00ff00' });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    fireEvent.blur(champ);
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/choices/ch1', {
        method: 'PATCH',
        body: JSON.stringify({ bgColor: '#00ff00' }),
      }),
    );
  });

  it('enregistre la couleur du texte', async () => {
    apiFetchMock
      .mockResolvedValueOnce([COLONNE_STATUT])
      .mockResolvedValueOnce({ ...NEW, textColor: '#123456' });

    render(<ListesTab />);
    const champ = await screen.findByLabelText('Couleur du texte de NEW');

    fireEvent.change(champ, { target: { value: '#123456' } });
    fireEvent.blur(champ);

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/choices/ch1', {
        method: 'PATCH',
        body: JSON.stringify({ textColor: '#123456' }),
      }),
    );
  });

  it('bascule le gras et envoie PATCH { bold }', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock
      .mockResolvedValueOnce([COLONNE_STATUT])
      .mockResolvedValueOnce({ ...CLOTUREE, bold: true });

    render(<ListesTab />);
    await utilisateur.click(await screen.findByLabelText('Gras pour CLOTUREE'));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/choices/ch2', {
        method: 'PATCH',
        body: JSON.stringify({ bold: true }),
      }),
    );
  });

  it('change de colonne et affiche l’autre liste', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce([COLONNE_STATUT, COLONNE_TECH]);

    render(<ListesTab />);
    const selecteur = await screen.findByLabelText('Colonne de type liste');
    await utilisateur.selectOptions(selecteur, 'col-statut');

    expect(screen.getByTestId('pastille-ch1')).toBeInTheDocument();
    expect(screen.queryByTestId('pastille-ch3')).not.toBeInTheDocument();
  });
});
