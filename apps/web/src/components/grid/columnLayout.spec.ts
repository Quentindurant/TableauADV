import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ColumnDTO, UserColumnLayoutDTO } from '@suivi/shared';
import {
  debounce,
  debouncePerKey,
  persistColumnField,
  persistColumnOrder,
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

const twoColumns: ColumnDTO[] = [
  columns[0],
  { ...columns[0], id: 'col-statut', key: 'statut', label: 'STATUT', position: 1, width: 140 },
];

function entree(
  columnId: string,
  surcharge: Partial<UserColumnLayoutDTO> = {},
): UserColumnLayoutDTO {
  return { columnId, width: null, position: null, hidden: false, ...surcharge };
}

function deps(
  patchMyColumnLayout: ReturnType<typeof vi.fn>,
  cols: ColumnDTO[] = twoColumns,
): PersistColumnFieldDeps & {
  applyUserLayoutEntries: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
} {
  return {
    getColumns: () => cols,
    patchMyColumnLayout,
    applyUserLayoutEntries: vi.fn(),
    onError: vi.fn(),
  };
}

describe('persistColumnField (repointé sur la route PERSO)', () => {
  it('après un PATCH de largeur réussi sur /me/column-layout, fusionne l’entrée upsertée dans le store', async () => {
    const upserted = entree('col-client', { width: 260 });
    const patchMyColumnLayout = vi.fn(async () => upserted);
    const d = deps(patchMyColumnLayout);

    await persistColumnField('client', { width: 260 }, d);

    expect(patchMyColumnLayout).toHaveBeenCalledWith('col-client', { width: 260 });
    expect(d.applyUserLayoutEntries).toHaveBeenCalledTimes(1);
    expect(d.applyUserLayoutEntries).toHaveBeenCalledWith([upserted]);
    expect(d.onError).not.toHaveBeenCalled();
  });

  it('accepte aussi un masquage perso (hidden), même mécanique que la largeur', async () => {
    const upserted = entree('col-statut', { hidden: true });
    const patchMyColumnLayout = vi.fn(async () => upserted);
    const d = deps(patchMyColumnLayout);

    await persistColumnField('statut', { hidden: true }, d);

    expect(patchMyColumnLayout).toHaveBeenCalledWith('col-statut', { hidden: true });
    expect(d.applyUserLayoutEntries).toHaveBeenCalledWith([upserted]);
  });

  it('résout l’id via resolveColumnId et n’appelle ni le PATCH ni le store pour une clé inconnue', async () => {
    const patchMyColumnLayout = vi.fn();
    const d = deps(patchMyColumnLayout);

    await persistColumnField('inconnue', { width: 100 }, d);

    expect(patchMyColumnLayout).not.toHaveBeenCalled();
    expect(d.applyUserLayoutEntries).not.toHaveBeenCalled();
  });

  it('sur échec du PATCH, appelle onError et laisse le store intact', async () => {
    const patchMyColumnLayout = vi.fn(async () => {
      throw new Error('boom');
    });
    const d = deps(patchMyColumnLayout);

    await persistColumnField('client', { width: 260 }, d);

    expect(d.onError).toHaveBeenCalledTimes(1);
    expect(d.applyUserLayoutEntries).not.toHaveBeenCalled();
  });
});

describe('persistColumnOrder', () => {
  it('enregistre une entrée position par colonne affichée (rangs 0..n-1) puis fusionne TOUTES les entrées en une seule fois', async () => {
    const patchMyColumnLayout = vi.fn(async (columnId: string, patch: { position?: number }) =>
      entree(columnId, { position: patch.position }),
    );
    const d = deps(patchMyColumnLayout);

    await persistColumnOrder(['statut', 'client'], d);

    expect(patchMyColumnLayout).toHaveBeenNthCalledWith(1, 'col-statut', { position: 0 });
    expect(patchMyColumnLayout).toHaveBeenNthCalledWith(2, 'col-client', { position: 1 });
    // Une application par entrée ferait retomber les colonnes pas encore
    // PATCHées sur leur position standard à chaque recalcul de la grille.
    expect(d.applyUserLayoutEntries).toHaveBeenCalledTimes(1);
    expect(d.applyUserLayoutEntries).toHaveBeenCalledWith([
      entree('col-statut', { position: 0 }),
      entree('col-client', { position: 1 }),
    ]);
    expect(d.onError).not.toHaveBeenCalled();
  });

  it('ignore une clé non résolue sans laisser de trou dans la séquence des positions', async () => {
    const patchMyColumnLayout = vi.fn(async (columnId: string, patch: { position?: number }) =>
      entree(columnId, { position: patch.position }),
    );
    const d = deps(patchMyColumnLayout);

    await persistColumnOrder(['statut', 'inconnue', 'client'], d);

    expect(patchMyColumnLayout).toHaveBeenCalledTimes(2);
    expect(patchMyColumnLayout).toHaveBeenNthCalledWith(1, 'col-statut', { position: 0 });
    expect(patchMyColumnLayout).toHaveBeenNthCalledWith(2, 'col-client', { position: 1 });
  });

  it('sur échec au milieu de la rafale, applique les entrées déjà upsertées et signale l’erreur', async () => {
    const patchMyColumnLayout = vi.fn(async (columnId: string, patch: { position?: number }) => {
      if (columnId === 'col-client') throw new Error('boom');
      return entree(columnId, { position: patch.position });
    });
    const d = deps(patchMyColumnLayout);

    await persistColumnOrder(['statut', 'client'], d);

    // col-statut est upsertée côté serveur : l'état local reste aligné.
    expect(d.applyUserLayoutEntries).toHaveBeenCalledTimes(1);
    expect(d.applyUserLayoutEntries).toHaveBeenCalledWith([
      entree('col-statut', { position: 0 }),
    ]);
    expect(d.onError).toHaveBeenCalledTimes(1);
  });
});
