import { describe, expect, it, vi } from 'vitest';
import type { RowDTO } from '@suivi/shared';
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
    const ok = await copyFocusedCell(
      fakeApi([row('r1', 'ARCADIA'), row('r2', 'NEO')], { rowIndex: 1, colId: 'client' }),
      writeText,
    );
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('NEO');
  });

  it("rend false et n'écrit rien sans cellule focalisée", async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await copyFocusedCell(fakeApi([], null), writeText)).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('pasteFocusedColumn', () => {
  it('colle sur la seule cellule focalisée quand aucune sélection multiple', async () => {
    const rows = [row('r1', 'A'), row('r2', 'B')];
    const deps = fakeDeps();
    await pasteFocusedColumn(
      fakeApi(rows, { rowIndex: 0, colId: 'client' }),
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
    await pasteFocusedColumn(
      fakeApi(rows, { rowIndex: 0, colId: 'client' }),
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
    await pasteFocusedColumn(
      fakeApi(rows, { rowIndex: 0, colId: 'client' }),
      async () => '',
      [],
      deps,
    );
    expect(deps.patchRow).toHaveBeenCalledWith('r1', { expectedVersion: 1, patch: { client: null } });
  });
});
