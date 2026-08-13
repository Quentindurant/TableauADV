import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDTO } from '@suivi/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/api', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../../../../lib/api';
import ColonnesTab, { deplacerElement, trierParPosition } from '../colonnes';

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

describe('ColonnesTab — renommage, largeur, visibilité', () => {
  it('renomme une colonne en inline (Entrée) et envoie PATCH { label }', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock
      .mockResolvedValueOnce([CLIENT])
      .mockResolvedValueOnce({ ...CLIENT, label: 'CLIENT FINAL' });

    render(<ColonnesTab />);
    await utilisateur.click(await screen.findByRole('button', { name: 'Renommer CLIENT' }));

    const champ = screen.getByLabelText('Nouveau libellé de CLIENT');
    await utilisateur.clear(champ);
    await utilisateur.type(champ, 'CLIENT FINAL{Enter}');

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/columns/c1', {
        method: 'PATCH',
        body: JSON.stringify({ label: 'CLIENT FINAL' }),
      }),
    );
    expect(await screen.findByText('CLIENT FINAL')).toBeInTheDocument();
  });

  it('annule le renommage avec Échap sans appeler l’API', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce([CLIENT]);

    render(<ColonnesTab />);
    await utilisateur.click(await screen.findByRole('button', { name: 'Renommer CLIENT' }));
    await utilisateur.type(screen.getByLabelText('Nouveau libellé de CLIENT'), 'PERDU{Escape}');

    expect(screen.getByText('CLIENT')).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('bascule la visibilité et envoie PATCH { visible }', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock
      .mockResolvedValueOnce([CLIENT])
      .mockResolvedValueOnce({ ...CLIENT, visible: false });

    render(<ColonnesTab />);
    await utilisateur.click(await screen.findByLabelText('Colonne CLIENT visible'));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/columns/c1', {
        method: 'PATCH',
        body: JSON.stringify({ visible: false }),
      }),
    );
  });

  it('enregistre la largeur à la sortie du champ', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock
      .mockResolvedValueOnce([CLIENT])
      .mockResolvedValueOnce({ ...CLIENT, width: 300 });

    render(<ColonnesTab />);
    const champ = await screen.findByLabelText('Largeur de CLIENT');
    await utilisateur.clear(champ);
    await utilisateur.type(champ, '300');
    await utilisateur.tab();

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/columns/c1', {
        method: 'PATCH',
        body: JSON.stringify({ width: 300 }),
      }),
    );
  });

  it('refuse une largeur hors bornes sans appeler l’API', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce([CLIENT]);

    render(<ColonnesTab />);
    const champ = await screen.findByLabelText('Largeur de CLIENT');
    await utilisateur.clear(champ);
    await utilisateur.type(champ, '9');
    await utilisateur.tab();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'La largeur doit être comprise entre 40 et 1000 pixels.',
    );
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('affiche NOT_FOUND en français et recharge la liste', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock
      .mockResolvedValueOnce([CLIENT])
      .mockRejectedValueOnce({ status: 404, code: 'NOT_FOUND', message: 'Colonne introuvable' })
      .mockResolvedValueOnce([]);

    render(<ColonnesTab />);
    await utilisateur.click(await screen.findByLabelText('Colonne CLIENT visible'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Élément introuvable : il vient peut-être d’être supprimé par un collègue.',
    );
    await waitFor(() => expect(apiFetchMock).toHaveBeenLastCalledWith('/columns'));
  });
});

function dataTransferFactice(): DataTransfer {
  const donnees = new Map<string, string>();
  return {
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: (type: string, valeur: string) => {
      donnees.set(type, valeur);
    },
    getData: (type: string) => donnees.get(type) ?? '',
  } as unknown as DataTransfer;
}

describe('ColonnesTab — glisser-déposer', () => {
  it('deplacerElement déplace un élément sans muter la source', () => {
    const source = ['a', 'b', 'c'];
    expect(deplacerElement(source, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(deplacerElement(source, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(deplacerElement(source, 0, 9)).toEqual(['a', 'b', 'c']);
    expect(source).toEqual(['a', 'b', 'c']);
  });

  it('déposer la 2e ligne sur la 1re envoie PATCH { position: 0 } puis recharge', async () => {
    apiFetchMock
      .mockResolvedValueOnce([STATUT, CLIENT])
      .mockResolvedValueOnce({ ...CLIENT, position: 0 })
      .mockResolvedValueOnce([{ ...CLIENT, position: 0 }, { ...STATUT, position: 1 }]);

    render(<ColonnesTab />);
    await screen.findByText('CLIENT');

    const lignes = screen.getAllByRole('row').slice(1);
    const transfert = dataTransferFactice();
    fireEvent.dragStart(lignes[1], { dataTransfer: transfert });
    fireEvent.dragOver(lignes[0], { dataTransfer: transfert });
    fireEvent.drop(lignes[0], { dataTransfer: transfert });

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenNthCalledWith(2, '/columns/c1', {
        method: 'PATCH',
        body: JSON.stringify({ position: 0 }),
      }),
    );
    await waitFor(() => expect(apiFetchMock).toHaveBeenLastCalledWith('/columns'));
    await waitFor(() => {
      const apres = screen.getAllByRole('row').slice(1);
      expect(apres[0]).toHaveAttribute('data-testid', 'colonne-client');
    });
  });

  it('déposer une ligne sur elle-même n’appelle pas l’API', async () => {
    apiFetchMock.mockResolvedValueOnce([STATUT, CLIENT]);

    render(<ColonnesTab />);
    await screen.findByText('CLIENT');

    const lignes = screen.getAllByRole('row').slice(1);
    const transfert = dataTransferFactice();
    fireEvent.dragStart(lignes[0], { dataTransfer: transfert });
    fireEvent.drop(lignes[0], { dataTransfer: transfert });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ColonnesTab — suppression', () => {
  it('supprime une colonne vide après confirmation', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce([CLIENT]).mockResolvedValueOnce(undefined);

    render(<ColonnesTab />);
    await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer CLIENT' }));

    const dialogue = screen.getByRole('dialog');
    expect(dialogue).toHaveTextContent('Supprimer la colonne « CLIENT » ?');
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/columns/c1', { method: 'DELETE' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('CLIENT')).not.toBeInTheDocument();
  });

  it('annule la suppression sans appeler l’API', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce([CLIENT]);

    render(<ColonnesTab />);
    await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer CLIENT' }));
    await utilisateur.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('sur 409 COLUMN_HAS_DATA, ouvre le second dialogue puis supprime avec ?force=true', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock
      .mockResolvedValueOnce([CLIENT])
      .mockRejectedValueOnce({
        status: 409,
        code: 'COLUMN_HAS_DATA',
        message: 'La colonne contient des données',
      })
      .mockResolvedValueOnce(undefined);

    render(<ColonnesTab />);
    await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer CLIENT' }));
    await utilisateur.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' }));

    const forcage = await screen.findByRole('dialog');
    expect(forcage).toHaveTextContent('contient déjà des données');
    expect(forcage).toHaveTextContent('effacera définitivement ces valeurs dans toutes les lignes');

    await utilisateur.click(
      within(forcage).getByRole('button', { name: 'Supprimer quand même avec les données' }),
    );

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith('/columns/c1?force=true', { method: 'DELETE' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('CLIENT')).not.toBeInTheDocument();
  });

  it('affiche une erreur et ferme le dialogue si la suppression forcée échoue', async () => {
    const utilisateur = userEvent.setup();
    apiFetchMock
      .mockResolvedValueOnce([CLIENT])
      .mockRejectedValueOnce({ status: 409, code: 'COLUMN_HAS_DATA', message: 'données' })
      .mockRejectedValueOnce({ status: 404, code: 'NOT_FOUND', message: 'introuvable' });

    render(<ColonnesTab />);
    await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer CLIENT' }));
    await utilisateur.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' }));
    await utilisateur.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Supprimer quand même avec les données',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Élément introuvable');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
