import { describe, expect, it, vi } from 'vitest';
import type { RowDTO } from '@suivi/shared';
import { ApiRequestError } from '../../lib/api';
import { commitCellEdit, commitHighlight, messageForError } from './cellCommit';

const row: RowDTO = {
  id: 'row-1',
  month: '2026-08',
  position: 0,
  data: { client: 'ARCADIA', statut: 'NEW' },
  formats: {},
  version: 3,
  archived: false,
  updatedAt: '2026-08-10T10:00:00.000Z',
};

function deps(patchRow: ReturnType<typeof vi.fn>) {
  return {
    patchRow,
    applyRowPatch: vi.fn(),
    reload: vi.fn(async () => undefined),
    showToast: vi.fn(),
  };
}

describe('commitCellEdit', () => {
  it('applique la valeur optimiste puis la réponse serveur', async () => {
    const server: RowDTO = { ...row, data: { ...row.data, client: 'NEO' }, version: 4 };
    const patchRow = vi.fn(async () => server);
    const d = deps(patchRow);

    await commitCellEdit(row, 'client', 'NEO', d);

    expect(d.applyRowPatch).toHaveBeenNthCalledWith(1, 'row-1', {
      patch: { client: 'NEO' },
    });
    expect(patchRow).toHaveBeenCalledWith('row-1', {
      expectedVersion: 3,
      patch: { client: 'NEO' },
    });
    expect(d.applyRowPatch).toHaveBeenNthCalledWith(2, 'row-1', {
      patch: server.data,
      version: 4,
    });
    expect(d.showToast).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('sur 409 VERSION_CONFLICT : toast explicite + rechargement du mois', async () => {
    const patchRow = vi.fn(async () => {
      throw new ApiRequestError('VERSION_CONFLICT', 'Conflit.', 409, {
        conflictKeys: ['client'],
      });
    });
    const d = deps(patchRow);

    await commitCellEdit(row, 'client', 'NEO', d);

    expect(d.showToast).toHaveBeenCalledWith(
      'Cette ligne a été modifiée par un collègue entre-temps. Le tableau a été rechargé avec la valeur à jour.',
      'error',
    );
    expect(d.reload).toHaveBeenCalledTimes(1);
  });

  it('sur 404 NOT_FOUND : message dédié + rechargement', async () => {
    const patchRow = vi.fn(async () => {
      throw new ApiRequestError('NOT_FOUND', 'Ligne introuvable.', 404);
    });
    const d = deps(patchRow);

    await commitCellEdit(row, 'client', 'NEO', d);

    expect(d.showToast).toHaveBeenCalledWith(
      "Cette ligne n'existe plus : elle a été supprimée par un collègue.",
      'error',
    );
    expect(d.reload).toHaveBeenCalledTimes(1);
  });

  it('sur 401 AUTH_REQUIRED : message de session expirée', async () => {
    const patchRow = vi.fn(async () => {
      throw new ApiRequestError('AUTH_REQUIRED', 'Authentification requise.', 401);
    });
    const d = deps(patchRow);

    await commitCellEdit(row, 'client', 'NEO', d);

    expect(d.showToast).toHaveBeenCalledWith(
      'Votre session a expiré. Reconnectez-vous pour continuer.',
      'error',
    );
  });

  it('sur 422 VALIDATION_FAILED : le message de l’API est repris tel quel', async () => {
    const patchRow = vi.fn(async () => {
      throw new ApiRequestError('VALIDATION_FAILED', 'Valeur refusée : date invalide.', 422);
    });
    const d = deps(patchRow);

    await commitCellEdit(row, 'impe', 'pas-une-date', d);

    expect(d.showToast).toHaveBeenCalledWith(
      'Valeur refusée : date invalide.',
      'error',
    );
  });

  it('sur panne réseau : message générique + rechargement', async () => {
    const patchRow = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const d = deps(patchRow);

    await commitCellEdit(row, 'client', 'NEO', d);

    expect(d.showToast).toHaveBeenCalledWith(
      "Le serveur est injoignable : la modification n'a pas été enregistrée.",
      'error',
    );
    expect(d.reload).toHaveBeenCalledTimes(1);
  });

  it('double panne : patchRow et reload echouent -> affiche toast supplementaire sans remonter d erreur', async () => {
    const patchRow = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const reload = vi.fn(async () => {
      throw new TypeError('Reload also failed');
    });
    const d = {
      ...deps(patchRow),
      reload,
    };

    // Ne doit pas lever d'exception
    await commitCellEdit(row, 'client', 'NEO', d);

    // Premier toast : le message d'erreur du patchRow
    expect(d.showToast).toHaveBeenNthCalledWith(
      1,
      "Le serveur est injoignable : la modification n'a pas été enregistrée.",
      'error',
    );
    // Deuxième toast : l'avertissement supplémentaire pour la double panne
    expect(d.showToast).toHaveBeenNthCalledWith(
      2,
      'Modification non enregistrée et affichage non actualisé. Rechargez la page pour retrouver les données à jour.',
      'error',
    );
    expect(d.showToast).toHaveBeenCalledTimes(2);
  });
});

describe('commitHighlight', () => {
  it('envoie un format de fond et l’applique optimistement', async () => {
    const server: RowDTO = {
      ...row,
      formats: { num_chrono: { bg: '#9BDEB4' } },
      version: 4,
    };
    const patchRow = vi.fn(async () => server);
    const d = deps(patchRow);

    await commitHighlight(row, 'num_chrono', '#9BDEB4', d);

    expect(patchRow).toHaveBeenCalledWith('row-1', {
      expectedVersion: 3,
      formats: { num_chrono: { bg: '#9BDEB4' } },
    });
    expect(d.applyRowPatch).toHaveBeenNthCalledWith(2, 'row-1', {
      formats: server.formats,
      version: 4,
    });
  });

  it('envoie null pour effacer le surlignage', async () => {
    const patchRow = vi.fn(async () => ({ ...row, formats: {}, version: 4 }));
    const d = deps(patchRow);

    await commitHighlight(row, 'num_chrono', null, d);

    expect(patchRow).toHaveBeenCalledWith('row-1', {
      expectedVersion: 3,
      formats: { num_chrono: null },
    });
  });

  it('double panne : patchRow et reload echouent -> affiche toast supplementaire sans remonter d erreur', async () => {
    const patchRow = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const reload = vi.fn(async () => {
      throw new TypeError('Reload also failed');
    });
    const d = {
      ...deps(patchRow),
      reload,
    };

    // Ne doit pas lever d'exception
    await commitHighlight(row, 'num_chrono', '#9BDEB4', d);

    // Premier toast : le message d'erreur du patchRow
    expect(d.showToast).toHaveBeenNthCalledWith(
      1,
      "Le serveur est injoignable : la modification n'a pas été enregistrée.",
      'error',
    );
    // Deuxième toast : l'avertissement supplémentaire pour la double panne
    expect(d.showToast).toHaveBeenNthCalledWith(
      2,
      'Modification non enregistrée et affichage non actualisé. Rechargez la page pour retrouver les données à jour.',
      'error',
    );
    expect(d.showToast).toHaveBeenCalledTimes(2);
  });
});

describe('messageForError', () => {
  it('rend un message français pour une erreur inconnue', () => {
    expect(messageForError(new Error('boom'))).toBe(
      "Le serveur est injoignable : la modification n'a pas été enregistrée.",
    );
  });
});
