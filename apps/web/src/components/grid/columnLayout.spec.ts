import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ColumnDTO } from '@suivi/shared';
import {
  debounce,
  debouncePerKey,
  persistColumnField,
  resolveColumnId,
  type PersistColumnFieldDeps,
} from './columnLayout';

const columns: ColumnDTO[] = [
  {
    id: 'col-client',
    key: 'client',
    label: 'CLIENT',
    type: 'TEXT',
    position: 0,
    width: 220,
    visible: true,
    choices: [],
  },
];

afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  it('n’appelle la fonction qu’une fois, après le délai, avec les derniers arguments', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 400);
    debounced('client', 200);
    debounced('client', 240);
    vi.advanceTimersByTime(399);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('client', 240);
  });

  it('cancel annule l’appel en attente', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 400);
    debounced('client', 200);
    debounced.cancel();
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('resolveColumnId', () => {
  it('retrouve l’identifiant de colonne depuis sa clé', () => {
    expect(resolveColumnId(columns, 'client')).toBe('col-client');
  });

  it('rend null pour une clé inconnue, vide ou absente', () => {
    expect(resolveColumnId(columns, 'inconnue')).toBeNull();
    expect(resolveColumnId(columns, null)).toBeNull();
    expect(resolveColumnId(columns, undefined)).toBeNull();
  });
});

describe('debouncePerKey', () => {
  it('coalesce indépendamment par clé : redimensionner la colonne A puis la colonne B dans la fenêtre de debounce produit UN appel par colonne (pas de perte silencieuse de A)', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const perKey = debouncePerKey(spy, 400, (colKey: string) => colKey);

    perKey('client', 260); // colonne A redimensionnée (event `finished`)
    vi.advanceTimersByTime(100);
    perKey('statut', 180); // colonne B redimensionnée 100ms plus tard, même fenêtre

    vi.advanceTimersByTime(300); // 400ms écoulées pour A, 300ms pour B
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenNthCalledWith(1, 'client', 260);

    vi.advanceTimersByTime(100); // 400ms écoulées pour B
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(2, 'statut', 180);
  });

  it('coalesce toujours à l’intérieur d’une même clé : deux appels rapprochés sur la même colonne ne produisent qu’un seul appel, avec les derniers arguments', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const perKey = debouncePerKey(spy, 400, (colKey: string) => colKey);

    perKey('client', 200);
    perKey('client', 240);
    vi.advanceTimersByTime(400);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('client', 240);
  });

  it('cancelAll annule TOUTES les colonnes en attente, pas seulement la dernière', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const perKey = debouncePerKey(spy, 400, (colKey: string) => colKey);

    perKey('client', 260);
    perKey('statut', 180);
    perKey.cancelAll();

    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('persistColumnField', () => {
  const twoColumns: ColumnDTO[] = [
    columns[0],
    { ...columns[0], id: 'col-statut', key: 'statut', label: 'STATUT', position: 1, width: 140 },
  ];

  function deps(
    patchColumn: ReturnType<typeof vi.fn>,
    cols: ColumnDTO[] = twoColumns,
  ): PersistColumnFieldDeps & { setColumns: ReturnType<typeof vi.fn>; onError: ReturnType<typeof vi.fn> } {
    return {
      getColumns: () => cols,
      patchColumn,
      setColumns: vi.fn(),
      onError: vi.fn(),
    };
  }

  it('après un PATCH de largeur réussi, resynchronise le store avec la réponse serveur', async () => {
    const updated: ColumnDTO = { ...twoColumns[0], width: 260 };
    const patchColumn = vi.fn(async () => updated);
    const d = deps(patchColumn);

    await persistColumnField('client', { width: 260 }, d);

    expect(patchColumn).toHaveBeenCalledWith('col-client', { width: 260 });
    expect(d.setColumns).toHaveBeenCalledTimes(1);
    expect(d.setColumns).toHaveBeenCalledWith([updated, twoColumns[1]]);
    expect(d.onError).not.toHaveBeenCalled();
  });

  it('après un PATCH de position réussi, resynchronise aussi le store (même comportement que la largeur)', async () => {
    const updated: ColumnDTO = { ...twoColumns[1], position: 0 };
    const patchColumn = vi.fn(async () => updated);
    const d = deps(patchColumn);

    await persistColumnField('statut', { position: 0 }, d);

    expect(patchColumn).toHaveBeenCalledWith('col-statut', { position: 0 });
    expect(d.setColumns).toHaveBeenCalledWith([twoColumns[0], updated]);
  });

  it('résout l’id via resolveColumnId et n’appelle ni patchColumn ni setColumns pour une clé inconnue', async () => {
    const patchColumn = vi.fn();
    const d = deps(patchColumn);

    await persistColumnField('inconnue', { width: 100 }, d);

    expect(patchColumn).not.toHaveBeenCalled();
    expect(d.setColumns).not.toHaveBeenCalled();
  });

  it('sur échec du PATCH, appelle onError et laisse le store intact', async () => {
    const patchColumn = vi.fn(async () => {
      throw new Error('boom');
    });
    const d = deps(patchColumn);

    await persistColumnField('client', { width: 260 }, d);

    expect(d.onError).toHaveBeenCalledTimes(1);
    expect(d.setColumns).not.toHaveBeenCalled();
  });
});
