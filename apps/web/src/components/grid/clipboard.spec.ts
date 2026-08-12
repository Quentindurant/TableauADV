import { describe, expect, it, vi } from 'vitest';
import type { ColumnDTO, RowDTO } from '@suivi/shared';
import { cellText, copyFocusedCell, pasteFocusedColumn, type GridClipboardApi } from './clipboard';

function row(id: string, client: string | null): RowDTO {
  return {
    id,
    month: '2026-08',
    position: 0,
    data: { client },
    formats: {},
    version: 1,
    archived: false,
    updatedAt: '2026-08-10T10:00:00.000Z',
  };
}

function fakeApi(
  rows: RowDTO[],
  focused: { rowIndex: number; colId: string } | null,
): GridClipboardApi {
  return {
    getFocusedCell: () =>
      focused
        ? { rowIndex: focused.rowIndex, column: { getColId: () => focused.colId } }
        : null,
    getDisplayedRowAtIndex: (index: number) =>
      rows[index] ? { data: rows[index] } : undefined,
  };
}

function fakeDeps() {
  const patchRow = vi.fn(async (id: string) => ({ ...row(id, 'X'), version: 2 }));
  return { patchRow, applyRowPatch: vi.fn(), reload: vi.fn(async () => undefined), showToast: vi.fn() };
}

function fakeColumn(key: string, type: 'TEXT' | 'NUMBER' = 'TEXT'): ColumnDTO {
  return {
    key,
    type,
    label: key,
    width: 100,
    visible: true,
    position: 0,
  };
}

describe('cellText', () => {
  it('rend une chaîne vide pour null/undefined et convertit le reste', () => {
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
    expect(cellText(42)).toBe('42');
    expect(cellText('NEO')).toBe('NEO');
  });
});

describe('copyFocusedCell', () => {
  it('écrit la valeur de la cellule focalisée dans le presse-papier', async () => {
    const writeText = vi.fn(async () => undefined);
    const deps = fakeDeps();
    const ok = await copyFocusedCell(
      fakeApi([row('r1', 'ARCADIA'), row('r2', 'NEO')], { rowIndex: 1, colId: 'client' }),
      writeText,
      deps,
    );
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('NEO');
    expect(deps.showToast).not.toHaveBeenCalled();
  });

  it("rend false et n'écrit rien sans cellule focalisée", async () => {
    const writeText = vi.fn(async () => undefined);
    const deps = fakeDeps();
    expect(await copyFocusedCell(fakeApi([], null), writeText, deps)).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('affiche un toast d\'erreur et rend false quand writeText rejette', async () => {
    const writeText = vi.fn(async () => {
      throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    });
    const deps = fakeDeps();
    const ok = await copyFocusedCell(
      fakeApi([row('r1', 'X')], { rowIndex: 0, colId: 'client' }),
      writeText,
      deps,
    );
    expect(ok).toBe(false);
    expect(deps.showToast).toHaveBeenCalledWith(
      'Accès au presse-papier refusé par le navigateur.',
      'error',
    );
  });

  it('affiche un toast d\'erreur générique quand writeText rejette sans NotAllowedError', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('Clipboard unavailable');
    });
    const deps = fakeDeps();
    const ok = await copyFocusedCell(
      fakeApi([row('r1', 'X')], { rowIndex: 0, colId: 'client' }),
      writeText,
      deps,
    );
    expect(ok).toBe(false);
    expect(deps.showToast).toHaveBeenCalledWith(
      'Le presse-papier n\'est pas disponible dans ce navigateur.',
      'error',
    );
  });
});

describe('pasteFocusedColumn', () => {
  it('colle sur la seule cellule focalisée quand aucune sélection multiple', async () => {
    const rows = [row('r1', 'A'), row('r2', 'B')];
    const deps = fakeDeps();
    const columns = [fakeColumn('client', 'TEXT')];
    await pasteFocusedColumn(
      fakeApi(rows, { rowIndex: 0, colId: 'client' }),
      columns,
      async () => 'X',
      [],
      deps,
    );
    expect(deps.patchRow).toHaveBeenCalledTimes(1);
    expect(deps.patchRow).toHaveBeenCalledWith('r1', { expectedVersion: 1, patch: { client: 'X' } });
  });

  it('applique la valeur à toutes les lignes sélectionnées de la colonne', async () => {
    const rows = [row('r1', 'A'), row('r2', 'B'), row('r3', 'C')];
    const deps = fakeDeps();
    const columns = [fakeColumn('client', 'TEXT')];
    await pasteFocusedColumn(
      fakeApi(rows, { rowIndex: 0, colId: 'client' }),
      columns,
      async () => 'X',
      [0, 1, 2],
      deps,
    );
    expect(deps.patchRow.mock.calls.map((call) => call[0])).toEqual(['r1', 'r2', 'r3']);
    expect(deps.patchRow).toHaveBeenLastCalledWith('r3', {
      expectedVersion: 1,
      patch: { client: 'X' },
    });
  });

  it('colle une chaîne vide comme valeur null', async () => {
    const rows = [row('r1', 'A')];
    const deps = fakeDeps();
    const columns = [fakeColumn('client', 'TEXT')];
    await pasteFocusedColumn(
      fakeApi(rows, { rowIndex: 0, colId: 'client' }),
      columns,
      async () => '',
      [],
      deps,
    );
    expect(deps.patchRow).toHaveBeenCalledWith('r1', { expectedVersion: 1, patch: { client: null } });
  });

  it('normalise une chaîne "42" collée dans une colonne NUMBER en nombre 42', async () => {
    const baseRow = row('r1', null);
    const rows: RowDTO[] = [{ ...baseRow, data: { amount: null } }];
    const deps = fakeDeps();
    const columns = [fakeColumn('amount', 'NUMBER')];
    await pasteFocusedColumn(
      fakeApi(rows, { rowIndex: 0, colId: 'amount' }),
      columns,
      async () => '42',
      [],
      deps,
    );
    expect(deps.patchRow).toHaveBeenCalledWith('r1', { expectedVersion: 1, patch: { amount: 42 } });
  });

  it('convertit une chaîne vide en null même dans une colonne NUMBER', async () => {
    const baseRow = row('r1', null);
    const rows: RowDTO[] = [{ ...baseRow, data: { amount: 100 } }];
    const deps = fakeDeps();
    const columns = [fakeColumn('amount', 'NUMBER')];
    await pasteFocusedColumn(
      fakeApi(rows, { rowIndex: 0, colId: 'amount' }),
      columns,
      async () => '',
      [],
      deps,
    );
    expect(deps.patchRow).toHaveBeenCalledWith('r1', { expectedVersion: 1, patch: { amount: null } });
  });

  it('affiche un toast d\'erreur et retourne silencieusement si readText rejette', async () => {
    const rows = [row('r1', 'A')];
    const deps = fakeDeps();
    const columns = [fakeColumn('client', 'TEXT')];
    const readText = vi.fn(async () => {
      throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    });
    await pasteFocusedColumn(
      fakeApi(rows, { rowIndex: 0, colId: 'client' }),
      columns,
      readText,
      [],
      deps,
    );
    expect(deps.patchRow).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith(
      'Accès au presse-papier refusé par le navigateur.',
      'error',
    );
  });

  it('affiche un toast d\'erreur générique quand readText rejette sans NotAllowedError', async () => {
    const rows = [row('r1', 'A')];
    const deps = fakeDeps();
    const columns = [fakeColumn('client', 'TEXT')];
    const readText = vi.fn(async () => {
      throw new Error('Clipboard unavailable');
    });
    await pasteFocusedColumn(
      fakeApi(rows, { rowIndex: 0, colId: 'client' }),
      columns,
      readText,
      [],
      deps,
    );
    expect(deps.patchRow).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledWith(
      'Le presse-papier n\'est pas disponible dans ce navigateur.',
      'error',
    );
  });
});
