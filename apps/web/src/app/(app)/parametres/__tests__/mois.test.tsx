import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MonthInfo } from '@suivi/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/api', () => ({
  deleteMonth: vi.fn(),
  getCorbeille: vi.fn(),
  getMonths: vi.fn(),
  restoreMonth: vi.fn(),
}));

import {
  deleteMonth,
  getCorbeille,
  getMonths,
  restoreMonth,
  type CorbeilleEntryDTO,
} from '../../../../lib/api';
import MoisTab, { MonthDeleteDialog, formatDateSuppression } from '../mois';

const getMonthsMock = vi.mocked(getMonths);
const getCorbeilleMock = vi.mocked(getCorbeille);
const deleteMonthMock = vi.mocked(deleteMonth);
const restoreMonthMock = vi.mocked(restoreMonth);

const MOIS_ACTIFS: MonthInfo[] = [
  { month: '2026-08', count: 5 },
  { month: '2026-09', count: 12 },
];

const ENTREE_CORBEILLE: CorbeilleEntryDTO = {
  month: '2026-07',
  deletedAt: '2026-08-31T10:00:00.000Z',
  count: 3,
};

function chargement(corbeille: CorbeilleEntryDTO[] = []): void {
  getMonthsMock.mockResolvedValue(MOIS_ACTIFS);
  getCorbeilleMock.mockResolvedValue(corbeille);
}

beforeEach(() => {
  getMonthsMock.mockReset();
  getCorbeilleMock.mockReset();
  deleteMonthMock.mockReset();
  restoreMonthMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MoisTab — listes', () => {
  it('affiche les mois actifs du plus récent au plus ancien avec leur nombre de dossiers', async () => {
    chargement();

    render(<MoisTab />);

    const septembre = await screen.findByTestId('mois-actif-2026-09');
    expect(within(septembre).getByText('SEPTEMBRE 2026')).toBeInTheDocument();
    expect(within(septembre).getByText('12 dossiers')).toBeInTheDocument();
    const aout = screen.getByTestId('mois-actif-2026-08');
    expect(within(aout).getByText('5 dossiers')).toBeInTheDocument();
    // Le plus récent d'abord, comme le menu des mois de la grille.
    expect(
      septembre.compareDocumentPosition(aout) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('affiche une phrase discrète quand la corbeille est vide', async () => {
    chargement([]);

    render(<MoisTab />);

    expect(await screen.findByText('La corbeille est vide.')).toBeInTheDocument();
  });

  it('affiche les entrées de corbeille avec date de suppression et bouton Restaurer', async () => {
    chargement([ENTREE_CORBEILLE]);

    render(<MoisTab />);

    const entree = await screen.findByTestId('corbeille-2026-07');
    expect(within(entree).getByText('JUILLET 2026')).toBeInTheDocument();
    expect(
      within(entree).getByText(`supprimé le ${formatDateSuppression(ENTREE_CORBEILLE.deletedAt)}`),
    ).toBeInTheDocument();
    expect(within(entree).getByText('3 dossiers')).toBeInTheDocument();
    expect(
      within(entree).getByRole('button', { name: 'Restaurer JUILLET 2026' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('La corbeille est vide.')).not.toBeInTheDocument();
  });
});

describe('MoisTab — suppression', () => {
  it('ouvre le dialogue avec le libellé du mois, ses dossiers et l’avertissement', async () => {
    const utilisateur = userEvent.setup();
    chargement();

    render(<MoisTab />);
    await utilisateur.click(
      await screen.findByRole('button', { name: 'Supprimer SEPTEMBRE 2026' }),
    );

    const dialogue = screen.getByTestId('month-delete-dialog');
    expect(dialogue).toHaveTextContent('Supprimer SEPTEMBRE 2026 et ses 12 dossiers ?');
    expect(dialogue).toHaveTextContent('Les dossiers archivés sont conservés.');
    expect(dialogue).toHaveTextContent(
      'Restauration possible depuis la corbeille jusqu’à la prochaine suppression de ce mois.',
    );
    // Le focus initial est sur Annuler : Entrée par réflexe ne supprime rien.
    expect(screen.getByTestId('month-delete-cancel')).toHaveFocus();
  });

  it('Annuler ferme le dialogue sans appeler deleteMonth', async () => {
    const utilisateur = userEvent.setup();
    chargement();

    render(<MoisTab />);
    await utilisateur.click(
      await screen.findByRole('button', { name: 'Supprimer SEPTEMBRE 2026' }),
    );
    await utilisateur.click(screen.getByTestId('month-delete-cancel'));

    expect(screen.queryByTestId('month-delete-dialog')).not.toBeInTheDocument();
    expect(deleteMonthMock).not.toHaveBeenCalled();
  });

  it('Supprimer appelle deleteMonth, affiche le succès et recharge les deux listes', async () => {
    const utilisateur = userEvent.setup();
    chargement();
    deleteMonthMock.mockResolvedValue({ deleted: 12 });

    render(<MoisTab />);
    await utilisateur.click(
      await screen.findByRole('button', { name: 'Supprimer SEPTEMBRE 2026' }),
    );
    await utilisateur.click(screen.getByTestId('month-delete-confirm'));

    await waitFor(() => expect(deleteMonthMock).toHaveBeenCalledWith('2026-09'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'SEPTEMBRE 2026 supprimé (12 dossiers).',
    );
    expect(screen.queryByTestId('month-delete-dialog')).not.toBeInTheDocument();
    // Chargement initial + rechargement après suppression.
    expect(getMonthsMock).toHaveBeenCalledTimes(2);
    expect(getCorbeilleMock).toHaveBeenCalledTimes(2);
  });
});

describe('MoisTab — restauration', () => {
  it('demande une confirmation légère puis restaure, succès et rechargement', async () => {
    const utilisateur = userEvent.setup();
    chargement([ENTREE_CORBEILLE]);
    restoreMonthMock.mockResolvedValue({ restored: 3 });
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<MoisTab />);
    await utilisateur.click(
      await screen.findByRole('button', { name: 'Restaurer JUILLET 2026' }),
    );

    expect(confirmMock).toHaveBeenCalledWith('Restaurer JUILLET 2026 (3 dossiers) ?');
    await waitFor(() => expect(restoreMonthMock).toHaveBeenCalledWith('2026-07'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'JUILLET 2026 restauré (3 dossiers).',
    );
    expect(getMonthsMock).toHaveBeenCalledTimes(2);
    expect(getCorbeilleMock).toHaveBeenCalledTimes(2);
  });

  it('ne restaure pas quand la confirmation est refusée', async () => {
    const utilisateur = userEvent.setup();
    chargement([ENTREE_CORBEILLE]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<MoisTab />);
    await utilisateur.click(
      await screen.findByRole('button', { name: 'Restaurer JUILLET 2026' }),
    );

    expect(restoreMonthMock).not.toHaveBeenCalled();
  });

  it('traduit le 409 VERSION_CONFLICT en message clair', async () => {
    const utilisateur = userEvent.setup();
    chargement([ENTREE_CORBEILLE]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    restoreMonthMock.mockRejectedValue({
      status: 409,
      code: 'VERSION_CONFLICT',
      message: 'Le mois contient déjà des dossiers actifs.',
    });

    render(<MoisTab />);
    await utilisateur.click(
      await screen.findByRole('button', { name: 'Restaurer JUILLET 2026' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le mois contient déjà des dossiers — restauration impossible.',
    );
    // Pas de rechargement : rien n'a été modifié côté serveur.
    expect(getMonthsMock).toHaveBeenCalledTimes(1);
  });
});

describe('MonthDeleteDialog', () => {
  it('neutralise les boutons et Échap pendant l’appel (busy)', async () => {
    const utilisateur = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <MonthDeleteDialog
        month="2026-09"
        count={12}
        busy
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByTestId('month-delete-confirm')).toBeDisabled();
    expect(screen.getByTestId('month-delete-cancel')).toBeDisabled();
    await utilisateur.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Échap annule quand aucun appel n’est en cours', async () => {
    const utilisateur = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <MonthDeleteDialog
        month="2026-09"
        count={12}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await utilisateur.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
