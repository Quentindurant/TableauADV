import type { CellValue, RowDTO } from '@suivi/shared';
import { commitCellEdit, type CommitDeps } from './cellCommit';

/**
 * Sous-ensemble de l'API AG Grid Community réellement utilisé par le
 * copier-coller. Le typer explicitement rend les fonctions testables sans monter
 * une vraie grille, et documente qu'on n'emploie AUCUNE API Enterprise
 * (getCellRanges, processDataFromClipboard, etc. n'existent pas en Community).
 */
export interface GridClipboardApi {
  getFocusedCell(): { rowIndex: number; column: { getColId(): string } } | null;
  getDisplayedRowAtIndex(index: number): { data?: RowDTO } | undefined;
}

/** Représentation texte d'une valeur de cellule pour le presse-papier. */
export function cellText(value: CellValue | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Ctrl+C : copie la valeur de la cellule focalisée. Rend false si rien à copier. */
export async function copyFocusedCell(
  api: GridClipboardApi,
  writeText: (text: string) => Promise<void>,
): Promise<boolean> {
  const focused = api.getFocusedCell();
  if (!focused) return false;
  const rowData = api.getDisplayedRowAtIndex(focused.rowIndex)?.data;
  if (!rowData) return false;
  await writeText(cellText(rowData.data[focused.column.getColId()]));
  return true;
}

/**
 * Ctrl+V : colle le presse-papier dans la colonne focalisée. `selectedRowIndexes`
 * est la sélection verticale suivie MANUELLEMENT par `DataGrid` (la sélection de
 * plage native est Enterprise) ; vide, seule la cellule focalisée est écrite.
 * L'écriture passe par `commitCellEdit` (optimiste + 409/404) ligne par ligne.
 */
export async function pasteFocusedColumn(
  api: GridClipboardApi,
  readText: () => Promise<string>,
  selectedRowIndexes: readonly number[],
  deps: CommitDeps,
): Promise<void> {
  const focused = api.getFocusedCell();
  if (!focused) return;
  const colKey = focused.column.getColId();
  const text = await readText();
  const value: CellValue = text === '' ? null : text;
  const indexes = selectedRowIndexes.length > 0 ? [...selectedRowIndexes] : [focused.rowIndex];
  for (const index of indexes) {
    const rowData = api.getDisplayedRowAtIndex(index)?.data;
    if (rowData) {
      await commitCellEdit(rowData, colKey, value, deps);
    }
  }
}
