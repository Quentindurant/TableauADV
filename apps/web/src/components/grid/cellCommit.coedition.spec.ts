import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RowDTO } from '@suivi/shared';
import { ApiRequestError, apiFetch } from '../../lib/api';
import { CONFLICT_MESSAGE, EDIT_FAILED_MESSAGE, applyCellEdit } from './cellCommit';
import { useAppStore } from '../../lib/store';

// Automock complet de '../../lib/api' : le mock générique de vitest ne rejoue
// pas le corps du constructeur de `ApiRequestError` (les champs
// `code`/`status`/`details` resteraient `undefined`, voir
// `coedition-sync.spec.ts`). On ne mocke donc que `apiFetch`, en conservant
// la vraie classe `ApiRequestError`.
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, apiFetch: vi.fn() };
});

function row(over: Partial<RowDTO> = {}): RowDTO {
  return {
    id: 'row1',
    month: '2026-08',
    position: 1,
    data: { client: 'ANCIEN' },
    formats: {},
    version: 4,
    archived: false,
    updatedAt: '2026-08-10T10:00:00.000Z',
    ...over,
  };
}

function conflictError(current: RowDTO, conflictKeys: string[]): ApiRequestError {
  return new ApiRequestError(
    'VERSION_CONFLICT',
    'Cette ligne a été modifiée entre-temps',
    409,
    { current, conflictKeys },
  );
}

beforeEach(() => {
  useAppStore.setState({
    user: { id: 'me', email: 'me@test.fr', displayName: 'Moi', cursorColor: '#123456' },
    users: [],
    columns: [],
    rows: [row()],
    view: 'month',
    monthCourant: '2026-08',
    connected: true,
    presence: [],
    focuses: {},
    locks: {},
    toast: null,
  });
});

describe('applyCellEdit — succès', () => {
  it('envoie le PATCH avec expectedVersion et applique la ligne renvoyée', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      row({ data: { client: 'NOUVEAU' }, version: 5 }) as never,
    );

    await applyCellEdit('row1', 'client', 'NOUVEAU');

    expect(apiFetch).toHaveBeenCalledWith('/rows/row1', {
      method: 'PATCH',
      body: JSON.stringify({ expectedVersion: 4, patch: { client: 'NOUVEAU' } }),
    });
    expect(useAppStore.getState().rows[0].data.client).toBe('NOUVEAU');
    expect(useAppStore.getState().rows[0].version).toBe(5);
    expect(useAppStore.getState().toast).toBeNull();
  });

  it('affiche la valeur immédiatement (optimisme) avant la réponse du serveur', async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    vi.mocked(apiFetch).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }) as never,
    );

    const pending = applyCellEdit('row1', 'client', 'OPTIMISTE');
    expect(useAppStore.getState().rows[0].data.client).toBe('OPTIMISTE');

    resolveFetch(row({ data: { client: 'OPTIMISTE' }, version: 5 }));
    await pending;
    expect(useAppStore.getState().rows[0].version).toBe(5);
  });

  it('ne fait rien si la ligne a disparu de la vue', async () => {
    useAppStore.setState({ rows: [] });
    await applyCellEdit('row1', 'client', 'X');
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('applyCellEdit — VERSION_CONFLICT (409)', () => {
  it('remplace la valeur affichée par details.current, prévient et fait clignoter la cellule', async () => {
    const serverRow = row({ data: { client: 'VALEUR COLLEGUE' }, version: 9 });
    vi.mocked(apiFetch).mockRejectedValue(conflictError(serverRow, ['client']));
    const flashCell = vi.fn();

    await applyCellEdit('row1', 'client', 'MA SAISIE', { flashCell });

    expect(useAppStore.getState().rows[0].data.client).toBe('VALEUR COLLEGUE');
    expect(useAppStore.getState().rows[0].version).toBe(9);
    expect(useAppStore.getState().toast?.message).toBe(CONFLICT_MESSAGE);
    expect(useAppStore.getState().toast?.kind).toBe('error');
    expect(flashCell).toHaveBeenCalledWith('row1', 'client');
  });

  it('revient à la valeur précédente si le serveur n’a pas joint details.current', async () => {
    const error = new ApiRequestError('VERSION_CONFLICT', 'Cette ligne a été modifiée entre-temps', 409);
    vi.mocked(apiFetch).mockRejectedValue(error);

    await applyCellEdit('row1', 'client', 'MA SAISIE');

    expect(useAppStore.getState().rows[0].data.client).toBe('ANCIEN');
    expect(useAppStore.getState().toast?.message).toBe(CONFLICT_MESSAGE);
  });
});

describe('applyCellEdit — autres erreurs', () => {
  it('annule la saisie et prévient en cas de panne réseau', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Failed to fetch'));
    const flashCell = vi.fn();

    await applyCellEdit('row1', 'client', 'MA SAISIE', { flashCell });

    expect(useAppStore.getState().rows[0].data.client).toBe('ANCIEN');
    expect(useAppStore.getState().toast?.message).toBe(EDIT_FAILED_MESSAGE);
    expect(flashCell).toHaveBeenCalledWith('row1', 'client');
  });

  it('annule la saisie en cas de 422 VALIDATION_FAILED et affiche le message serveur', async () => {
    const error = new ApiRequestError(
      'VALIDATION_FAILED',
      'La valeur « 12/45/2026 » n’est pas une date valide',
      422,
    );
    vi.mocked(apiFetch).mockRejectedValue(error);

    await applyCellEdit('row1', 'client', '12/45/2026');

    expect(useAppStore.getState().rows[0].data.client).toBe('ANCIEN');
    expect(useAppStore.getState().toast?.message).toBe(
      'La valeur « 12/45/2026 » n’est pas une date valide',
    );
  });
});
