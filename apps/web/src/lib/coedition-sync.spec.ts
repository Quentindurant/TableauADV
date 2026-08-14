import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColumnDTO, RowDTO, UserDTO } from '@suivi/shared';
import { ApiRequestError, apiFetch } from './api';
import { RESYNC_ERROR_MESSAGE, refreshConfig, resyncView } from './coedition-sync';
import { joinRoom } from './socket';
import { useAppStore } from './store';

// Automock complet de './api' : le mock générique de vitest ne rejoue pas le
// corps du constructeur de `ApiRequestError` (les champs `code`/`status`
// resteraient `undefined`). On ne mocke donc que `apiFetch`, en conservant
// la vraie classe `ApiRequestError`.
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, apiFetch: vi.fn() };
});
vi.mock('./socket');

const column: ColumnDTO = {
  id: 'c1',
  key: 'client',
  label: 'CLIENT',
  type: 'TEXT',
  position: 1,
  width: 150,
  visible: true,
  choices: [],
};

const rowFromServer: RowDTO = {
  id: 'row1',
  month: '2026-08',
  position: 1,
  data: { client: 'ARCADIA' },
  formats: {},
  version: 3,
  archived: false,
  updatedAt: '2026-08-10T10:00:00.000Z',
};

const bob: UserDTO = {
  id: 'bob',
  email: 'bob@test.fr',
  displayName: 'Bob Dupont',
  cursorColor: '#00FF00',
};

beforeEach(() => {
  useAppStore.setState({
    user: null,
    users: [],
    columns: [],
    rows: [],
    view: 'month',
    monthCourant: '2026-08',
    connected: true,
    presence: [],
    focuses: {},
    locks: {},
    toast: null,
  });
});

describe('resyncView', () => {
  it('re-rejoint la room et recharge colonnes + lignes de la vue mensuelle', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/columns') return [column] as never;
      if (path === '/rows?month=2026-08') return [rowFromServer] as never;
      throw new Error(`chemin inattendu: ${path}`);
    });

    await resyncView('month', '2026-08');

    expect(joinRoom).toHaveBeenCalledWith('month:2026-08');
    expect(useAppStore.getState().columns).toEqual([column]);
    expect(useAppStore.getState().rows).toEqual([rowFromServer]);
  });

  it('recharge les archives dans la vue archives', async () => {
    vi.mocked(apiFetch).mockResolvedValue([] as never);
    await resyncView('archives', '2026-08');
    expect(joinRoom).toHaveBeenCalledWith('archives');
    expect(apiFetch).toHaveBeenCalledWith('/rows?archived=true');
  });

  it('purge focus et verrous périmés avant de recharger', async () => {
    useAppStore.setState({
      focuses: { bob: { userId: 'bob', rowId: 'row1', colKey: 'client' } },
      locks: { 'row1:client': { rowId: 'row1', colKey: 'client', user: bob } },
    });
    vi.mocked(apiFetch).mockResolvedValue([] as never);
    await resyncView('month', '2026-08');
    expect(useAppStore.getState().focuses).toEqual({});
    expect(useAppStore.getState().locks).toEqual({});
  });

  it('affiche un toast et conserve les données en cas d’échec réseau', async () => {
    useAppStore.setState({ rows: [rowFromServer] });
    vi.mocked(apiFetch).mockRejectedValue(new Error('Failed to fetch'));

    await resyncView('month', '2026-08');

    expect(useAppStore.getState().rows).toEqual([rowFromServer]);
    expect(useAppStore.getState().toast?.message).toBe(RESYNC_ERROR_MESSAGE);
    expect(useAppStore.getState().toast?.kind).toBe('error');
  });

  it('redirige vers /login quand la session a expiré (AUTH_REQUIRED)', async () => {
    const error = new ApiRequestError('AUTH_REQUIRED', 'Vous devez être connecté', 401);
    vi.mocked(apiFetch).mockRejectedValue(error);
    const redirectToLogin = vi.fn();

    await resyncView('month', '2026-08', { redirectToLogin });

    expect(redirectToLogin).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().toast).toBeNull();
  });

  it('ignore la réponse si la vue affichée a changé pendant le rechargement (garde anti-obsolescence)', async () => {
    let resolveColumns!: (value: ColumnDTO[]) => void;
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/columns') {
        return new Promise<ColumnDTO[]>((resolve) => {
          resolveColumns = resolve;
        });
      }
      if (path === '/rows?month=2026-08') return [rowFromServer] as never;
      throw new Error(`chemin inattendu: ${path}`);
    });

    const pending = resyncView('month', '2026-08');
    // L'utilisateur bascule vers un autre mois AVANT que la réponse réseau
    // (lente) n'arrive : elle ne doit plus jamais atteindre le store.
    useAppStore.setState({ view: 'archives', monthCourant: '2026-09' });
    resolveColumns([column]);
    await pending;

    expect(useAppStore.getState().columns).toEqual([]);
    expect(useAppStore.getState().rows).toEqual([]);
  });
});

describe('refreshConfig', () => {
  it('recharge les colonnes pour le scope columns', async () => {
    vi.mocked(apiFetch).mockResolvedValue([column] as never);
    await refreshConfig('columns');
    expect(apiFetch).toHaveBeenCalledWith('/columns');
    expect(useAppStore.getState().columns).toEqual([column]);
  });

  it('recharge les colonnes pour le scope choices (les choix y sont imbriqués)', async () => {
    vi.mocked(apiFetch).mockResolvedValue([column] as never);
    await refreshConfig('choices');
    expect(apiFetch).toHaveBeenCalledWith('/columns');
    expect(useAppStore.getState().columns).toEqual([column]);
  });

  it('recharge les membres pour le scope users', async () => {
    vi.mocked(apiFetch).mockResolvedValue([bob] as never);
    await refreshConfig('users');
    expect(apiFetch).toHaveBeenCalledWith('/users');
    expect(useAppStore.getState().users).toEqual([bob]);
  });

  it('affiche un toast en cas d’échec', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Failed to fetch'));
    await refreshConfig('columns');
    expect(useAppStore.getState().toast?.message).toBe(RESYNC_ERROR_MESSAGE);
  });

  it('recharge aussi les lignes de la vue courante pour le scope choices (R1 : libellé renommé propagé aux rows)', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/columns') return [column] as never;
      if (path === '/rows?month=2026-08') return [rowFromServer] as never;
      throw new Error(`chemin inattendu: ${path}`);
    });

    await refreshConfig('choices');

    expect(apiFetch).toHaveBeenCalledWith('/rows?month=2026-08');
    expect(useAppStore.getState().columns).toEqual([column]);
    expect(useAppStore.getState().rows).toEqual([rowFromServer]);
  });

  it('recharge les lignes des archives pour le scope choices quand la vue courante est archives', async () => {
    useAppStore.setState({ view: 'archives', monthCourant: '2026-08' });
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/columns') return [column] as never;
      if (path === '/rows?archived=true') return [rowFromServer] as never;
      throw new Error(`chemin inattendu: ${path}`);
    });

    await refreshConfig('choices');

    expect(apiFetch).toHaveBeenCalledWith('/rows?archived=true');
    expect(useAppStore.getState().rows).toEqual([rowFromServer]);
  });

  it('ignore la réponse choices si la vue affichée a changé pendant le rechargement (garde anti-obsolescence)', async () => {
    let resolveColumns!: (value: ColumnDTO[]) => void;
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/columns') {
        return new Promise<ColumnDTO[]>((resolve) => {
          resolveColumns = resolve;
        });
      }
      if (path === '/rows?month=2026-08') return [rowFromServer] as never;
      throw new Error(`chemin inattendu: ${path}`);
    });

    const pending = refreshConfig('choices');
    // Le collègue change de mois avant que la réponse réseau (lente)
    // n'arrive : elle ne doit plus jamais atteindre le store.
    useAppStore.setState({ view: 'archives', monthCourant: '2026-09' });
    resolveColumns([column]);
    await pending;

    expect(useAppStore.getState().columns).toEqual([]);
    expect(useAppStore.getState().rows).toEqual([]);
  });
});
