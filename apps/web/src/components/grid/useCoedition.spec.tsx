import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import type { UserDTO } from '@suivi/shared';
import {
  emitCellFocus,
  joinRoom,
  onConnectionChange,
  onEvent,
  onReconnect,
  releaseCellLock,
  requestCellLock,
} from '../../lib/socket';
import { refreshConfig, resyncView } from '../../lib/coedition-sync';
import { useAppStore } from '../../lib/store';
import {
  CONFIG_CHANGED_DEBOUNCE_MS,
  LOCK_RENEW_INTERVAL_MS,
  lockedToastMessage,
  useCoedition,
} from './useCoedition';

vi.mock('../../lib/socket');
vi.mock('../../lib/coedition-sync', () => ({
  resyncView: vi.fn().mockResolvedValue(undefined),
  refreshConfig: vi.fn().mockResolvedValue(undefined),
}));

// Le module est mocké ci-dessus : l'import statique rend les mocks eux-mêmes.
const sync = { resyncView: vi.mocked(resyncView), refreshConfig: vi.mocked(refreshConfig) };

const me: UserDTO = { id: 'me', email: 'me@test.fr', displayName: 'Moi Même', cursorColor: '#123456' };
const bob: UserDTO = { id: 'bob', email: 'bob@test.fr', displayName: 'Bob Dupont', cursorColor: '#00FF00' };

/** Faux GridApi : uniquement les méthodes utilisées par le hook. */
function fakeGridApi() {
  return {
    stopEditing: vi.fn(),
    refreshCells: vi.fn(),
    flashCells: vi.fn(),
    getDisplayedRowAtIndex: vi.fn(() => ({ data: { id: 'row1' } })),
  };
}

/** Capture les handlers passés à onEvent pour pouvoir les déclencher. */
function serverEmit(event: string, payload: unknown): void {
  for (const call of vi.mocked(onEvent).mock.calls) {
    if (call[0] === event) {
      (call[1] as (p: unknown) => void)(payload);
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  useAppStore.setState({
    user: me,
    users: [me, bob],
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
  vi.mocked(onEvent).mockReturnValue(() => undefined);
  vi.mocked(onConnectionChange).mockReturnValue(() => undefined);
  vi.mocked(onReconnect).mockReturnValue(() => undefined);
  vi.mocked(requestCellLock).mockResolvedValue({ granted: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('abonnements', () => {
  it('rejoint la room de la vue au montage', () => {
    renderHook(() => useCoedition('month', '2026-08', fakeGridApi() as never));
    expect(joinRoom).toHaveBeenCalledWith('month:2026-08');
  });

  it('alimente le store depuis presence, cell.focus, cell.lock et cell.unlock', () => {
    renderHook(() => useCoedition('month', '2026-08', fakeGridApi() as never));

    act(() => serverEmit('presence', { users: [{ ...me, socketId: 's1' }, { ...bob, socketId: 's2' }] }));
    expect(useAppStore.getState().presence.map((u) => u.id)).toEqual(['bob']);

    act(() => serverEmit('cell.focus', { userId: 'bob', rowId: 'row1', colKey: 'client' }));
    expect(useAppStore.getState().focuses.bob.colKey).toBe('client');

    act(() => serverEmit('cell.lock', { rowId: 'row1', colKey: 'statut', user: bob }));
    expect(useAppStore.getState().locks['row1:statut'].user.id).toBe('bob');

    act(() => serverEmit('cell.unlock', { rowId: 'row1', colKey: 'statut' }));
    expect(useAppStore.getState().locks['row1:statut']).toBeUndefined();
  });

  it('applique les événements row.* au store', () => {
    const row = {
      id: 'row9',
      month: '2026-08',
      position: 1,
      data: { client: 'ARCADIA' },
      formats: {},
      version: 1,
      archived: false,
      updatedAt: '2026-08-10T10:00:00.000Z',
    };
    renderHook(() => useCoedition('month', '2026-08', fakeGridApi() as never));

    act(() => serverEmit('row.created', { row }));
    expect(useAppStore.getState().rows.map((r) => r.id)).toEqual(['row9']);

    act(() =>
      serverEmit('row.updated', {
        row: { ...row, data: { client: 'BOULANGERIE' }, version: 2 },
        changedKeys: ['client'],
        byUserId: 'bob',
      }),
    );
    expect(useAppStore.getState().rows[0].data.client).toBe('BOULANGERIE');

    act(() => serverEmit('row.moved', { row: { ...row, month: '2026-09' }, fromMonth: '2026-08' }));
    expect(useAppStore.getState().rows).toEqual([]);

    act(() => serverEmit('row.created', { row }));
    act(() => serverEmit('row.deleted', { rowId: 'row9' }));
    expect(useAppStore.getState().rows).toEqual([]);
  });

  it('recharge la configuration sur config.changed (après un court coalescing)', () => {
    renderHook(() => useCoedition('month', '2026-08', fakeGridApi() as never));

    act(() => serverEmit('config.changed', { scope: 'choices' }));
    // Coalescé : pas d'appel réseau immédiat.
    expect(sync.refreshConfig).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(CONFIG_CHANGED_DEBOUNCE_MS);
    });
    expect(sync.refreshConfig).toHaveBeenCalledWith('choices');

    act(() => serverEmit('config.changed', { scope: 'users' }));
    act(() => {
      vi.advanceTimersByTime(CONFIG_CHANGED_DEBOUNCE_MS);
    });
    expect(sync.refreshConfig).toHaveBeenCalledWith('users');
  });

  it('coalesce une rafale de config.changed du même scope en un seul rechargement (anti-rafale)', () => {
    renderHook(() => useCoedition('month', '2026-08', fakeGridApi() as never));

    act(() => {
      serverEmit('config.changed', { scope: 'choices' });
      serverEmit('config.changed', { scope: 'choices' });
      serverEmit('config.changed', { scope: 'choices' });
    });
    act(() => {
      vi.advanceTimersByTime(CONFIG_CHANGED_DEBOUNCE_MS);
    });

    expect(sync.refreshConfig).toHaveBeenCalledTimes(1);
    expect(sync.refreshConfig).toHaveBeenCalledWith('choices');
  });

  it('resynchronise complètement à la reconnexion et suit l’état de connexion', () => {
    renderHook(() => useCoedition('month', '2026-08', fakeGridApi() as never));

    const connectionHandler = vi.mocked(onConnectionChange).mock.calls[0][0];
    act(() => connectionHandler(false));
    expect(useAppStore.getState().connected).toBe(false);

    const reconnectHandler = vi.mocked(onReconnect).mock.calls[0][0];
    act(() => reconnectHandler());
    expect(sync.resyncView).toHaveBeenCalledWith('month', '2026-08');
  });

  it('utilise la vue/mois les plus récents lors d’une reconnexion (pas de fermeture obsolète)', () => {
    const { rerender } = renderHook(
      ({ view, month }: { view: 'month' | 'archives'; month: string }) =>
        useCoedition(view, month, fakeGridApi() as never),
      { initialProps: { view: 'month', month: '2026-08' } },
    );

    rerender({ view: 'archives', month: '2026-09' });

    const reconnectHandler = vi.mocked(onReconnect).mock.calls[0][0];
    act(() => reconnectHandler());
    expect(sync.resyncView).toHaveBeenCalledWith('archives', '2026-09');
  });

  it('désabonne tous les écouteurs socket au démontage (aucune fuite)', () => {
    const offEvent = vi.fn();
    const offConnection = vi.fn();
    const offReconnect = vi.fn();
    vi.mocked(onEvent).mockReturnValue(offEvent);
    vi.mocked(onConnectionChange).mockReturnValue(offConnection);
    vi.mocked(onReconnect).mockReturnValue(offReconnect);

    const { unmount } = renderHook(() => useCoedition('month', '2026-08', fakeGridApi() as never));
    const eventSubscriptionCount = vi.mocked(onEvent).mock.calls.length;
    expect(eventSubscriptionCount).toBeGreaterThan(0);

    unmount();

    expect(offEvent).toHaveBeenCalledTimes(eventSubscriptionCount);
    expect(offConnection).toHaveBeenCalledTimes(1);
    expect(offReconnect).toHaveBeenCalledTimes(1);
  });

  it('annule un rechargement de config encore en attente au démontage', () => {
    const { unmount } = renderHook(() =>
      useCoedition('month', '2026-08', fakeGridApi() as never),
    );
    act(() => serverEmit('config.changed', { scope: 'columns' }));

    // Démontage AVANT l'expiration du coalescing : le rechargement programmé
    // ne doit jamais partir (pas de setState/appel réseau après démontage).
    unmount();

    act(() => {
      vi.advanceTimersByTime(CONFIG_CHANGED_DEBOUNCE_MS * 5);
    });
    expect(sync.refreshConfig).not.toHaveBeenCalledWith('columns');
  });
});

describe('focus émis', () => {
  it('émet cell.focus à chaque changement de cellule focalisée', () => {
    const api = fakeGridApi();
    const { result } = renderHook(() =>
      useCoedition('month', '2026-08', api as never),
    );

    act(() =>
      result.current.onCellFocused({
        api,
        rowIndex: 0,
        column: { getColId: () => 'client' },
      } as never),
    );
    expect(emitCellFocus).toHaveBeenCalledWith({ rowId: 'row1', colKey: 'client' });

    act(() => result.current.onCellFocused({ api, rowIndex: null, column: null } as never));
    expect(emitCellFocus).toHaveBeenCalledWith({ rowId: null });
  });
});

describe('verrous d’édition', () => {
  it('laisse éditer quand le verrou est accordé et le renouvelle toutes les 10 s', async () => {
    const api = fakeGridApi();
    const { result } = renderHook(() =>
      useCoedition('month', '2026-08', api as never),
    );

    await act(async () => {
      await result.current.onCellEditingStarted({
        data: { id: 'row1' },
        column: { getColId: () => 'client' },
      } as never);
    });

    expect(requestCellLock).toHaveBeenCalledWith('row1', 'client');
    expect(api.stopEditing).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(LOCK_RENEW_INTERVAL_MS * 2);
    });
    expect(requestCellLock).toHaveBeenCalledTimes(3); // 1 demande + 2 renouvellements
  });

  // Régression e2e « coedition.spec.ts » : Alice ne voyait jamais
  // `coedition-locked`. En développement — et `next dev` est ce que lance le
  // harnais Playwright — Next.js active React StrictMode par défaut sur
  // l'App Router, donc React monte, nettoie, puis REmonte les effets sur la
  // MÊME instance : les `useRef` survivent. Un drapeau « démonté » posé au
  // nettoyage et jamais réarmé au montage reste alors vrai pour toujours, et
  // tout verrou accordé est relâché dans la milliseconde qui suit — le
  // collègue voit `coedition-focus` mais jamais `coedition-locked`.
  it('garde le verrou accordé après le double montage de StrictMode (dev)', async () => {
    const api = fakeGridApi();
    const { result } = renderHook(() => useCoedition('month', '2026-08', api as never), {
      wrapper: StrictMode,
    });

    await act(async () => {
      await result.current.onCellEditingStarted({
        data: { id: 'row1' },
        column: { getColId: () => 'client' },
      } as never);
    });

    expect(requestCellLock).toHaveBeenCalledWith('row1', 'client');
    // Le verrou accordé doit être CONSERVÉ : le relâcher aussitôt annule le
    // `cell.lock` déjà diffusé aux collègues.
    expect(releaseCellLock).not.toHaveBeenCalled();
    // Et le renouvellement doit bien avoir démarré.
    act(() => {
      vi.advanceTimersByTime(LOCK_RENEW_INTERVAL_MS * 2);
    });
    expect(requestCellLock).toHaveBeenCalledTimes(3); // 1 demande + 2 renouvellements
  });

  it('annule l’édition, prévient et marque la cellule quand le verrou est refusé (équivalent LOCKED)', async () => {
    vi.mocked(requestCellLock).mockResolvedValue({ granted: false, holder: bob });
    const api = fakeGridApi();
    const { result } = renderHook(() =>
      useCoedition('month', '2026-08', api as never),
    );

    await act(async () => {
      await result.current.onCellEditingStarted({
        data: { id: 'row1' },
        column: { getColId: () => 'client' },
      } as never);
    });

    expect(api.stopEditing).toHaveBeenCalledWith(true);
    expect(useAppStore.getState().toast?.message).toBe(lockedToastMessage('Bob Dupont'));
    expect(useAppStore.getState().locks['row1:client'].user.id).toBe('bob');
  });

  it('libère le verrou et arrête le renouvellement à la fin de l’édition', async () => {
    const api = fakeGridApi();
    const { result } = renderHook(() =>
      useCoedition('month', '2026-08', api as never),
    );

    await act(async () => {
      await result.current.onCellEditingStarted({
        data: { id: 'row1' },
        column: { getColId: () => 'client' },
      } as never);
    });
    vi.mocked(requestCellLock).mockClear();

    act(() =>
      result.current.onCellEditingStopped({
        data: { id: 'row1' },
        column: { getColId: () => 'client' },
      } as never),
    );

    expect(releaseCellLock).toHaveBeenCalledWith('row1', 'client');
    act(() => {
      vi.advanceTimersByTime(LOCK_RENEW_INTERVAL_MS * 3);
    });
    expect(requestCellLock).not.toHaveBeenCalled();
  });

  it('libère le verrou en cours et coupe le renouvellement si démonté pendant l’édition (nettoyage complet)', async () => {
    const api = fakeGridApi();
    const { result, unmount } = renderHook(() =>
      useCoedition('month', '2026-08', api as never),
    );

    await act(async () => {
      await result.current.onCellEditingStarted({
        data: { id: 'row1' },
        column: { getColId: () => 'client' },
      } as never);
    });
    vi.mocked(requestCellLock).mockClear();
    vi.mocked(releaseCellLock).mockClear();

    unmount();

    expect(releaseCellLock).toHaveBeenCalledWith('row1', 'client');
    act(() => {
      vi.advanceTimersByTime(LOCK_RENEW_INTERVAL_MS * 3);
    });
    expect(requestCellLock).not.toHaveBeenCalled();
  });

  it('ignore un ack de verrou reçu après démontage — le libère et ne programme aucun renouvellement', async () => {
    let resolveLock!: (ack: { granted: boolean }) => void;
    vi.mocked(requestCellLock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLock = resolve;
        }),
    );
    const api = fakeGridApi();
    const { result, unmount } = renderHook(() =>
      useCoedition('month', '2026-08', api as never),
    );

    const editingPromise = result.current.onCellEditingStarted({
      data: { id: 'row1' },
      column: { getColId: () => 'client' },
    } as never);

    unmount();
    vi.mocked(requestCellLock).mockClear();
    vi.mocked(releaseCellLock).mockClear();
    resolveLock({ granted: true });
    await act(async () => {
      await editingPromise;
    });

    // Le verrou accordé après démontage est immédiatement rendu.
    expect(releaseCellLock).toHaveBeenCalledWith('row1', 'client');
    // Et surtout : aucun timer de renouvellement fantôme n'a démarré.
    act(() => {
      vi.advanceTimersByTime(LOCK_RENEW_INTERVAL_MS * 3);
    });
    expect(requestCellLock).not.toHaveBeenCalled();
  });
});

describe('éditabilité et classes', () => {
  it('interdit l’édition d’une cellule verrouillée par un collègue', () => {
    useAppStore.getState().setLock({ rowId: 'row1', colKey: 'client', user: bob });
    const { result } = renderHook(() =>
      useCoedition('month', '2026-08', fakeGridApi() as never),
    );
    const params = { data: { id: 'row1' }, column: { getColId: () => 'client' } } as never;
    expect(result.current.isCellEditable(params)).toBe(false);

    const free = { data: { id: 'row1' }, column: { getColId: () => 'statut' } } as never;
    expect(result.current.isCellEditable(free)).toBe(true);
  });

  it('applique les classes coedition-focus / coedition-locked et le style', () => {
    useAppStore.getState().setPresence([bob]);
    useAppStore.getState().setRemoteFocus('bob', 'row1', 'client');
    useAppStore.getState().setLock({ rowId: 'row1', colKey: 'statut', user: bob });
    const { result } = renderHook(() =>
      useCoedition('month', '2026-08', fakeGridApi() as never),
    );

    const focused = { data: { id: 'row1' }, column: { getColId: () => 'client' } } as never;
    const locked = { data: { id: 'row1' }, column: { getColId: () => 'statut' } } as never;

    expect(result.current.cellClassRules['coedition-focus'](focused)).toBe(true);
    expect(result.current.cellClassRules['coedition-locked'](focused)).toBe(false);
    expect(result.current.cellClassRules['coedition-locked'](locked)).toBe(true);
    expect(result.current.cellStyle(focused)).toEqual({
      '--coedition-color': '#00FF00',
      '--coedition-label': '"Bob Dupont"',
    });
  });
});
