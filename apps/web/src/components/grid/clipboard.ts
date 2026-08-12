import type { CellValue, ColumnDTO, RowDTO } from '@suivi/shared';
import { normalizeCellValue } from './columnDefs';
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
  deps: CommitDeps,
): Promise<boolean> {
  const focused = api.getFocusedCell();
  if (!focused) return false;
  const rowData = api.getDisplayedRowAtIndex(focused.rowIndex)?.data;
  if (!rowData) return false;
  try {
    await writeText(cellText(rowData.data[focused.column.getColId()]));
    return true;
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'NotAllowedError'
        ? 'Accès au presse-papier refusé par le navigateur.'
        : 'Le presse-papier n\'est pas disponible dans ce navigateur.';
    deps.showToast(message, 'error');
    return false;
  }
}

/**
 * Ctrl+V : colle le presse-papier dans la colonne focalisée. `selectedRowIndexes`
 * est la sélection verticale suivie MANUELLEMENT par `DataGrid` (la sélection de
 * plage native est Enterprise) ; vide, seule la cellule focalisée est écrite.
 * L'écriture passe par `commitCellEdit` (optimiste + 409/404) ligne par ligne.
 * La valeur est normalisée selon le type de la colonne.
 */
export async function pasteFocusedColumn(
  api: GridClipboardApi,
  columns: ColumnDTO[],
  readText: () => Promise<string>,
  selectedRowIndexes: readonly number[],
  deps: CommitDeps,
): Promise<void> {
  const focused = api.getFocusedCell();
  if (!focused) return;
  const colKey = focused.column.getColId();
  const column = columns.find((c) => c.key === colKey);
  if (!column) return;
  let text: string;
  try {
    text = await readText();
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'NotAllowedError'
        ? 'Accès au presse-papier refusé par le navigateur.'
        : 'Le presse-papier n\'est pas disponible dans ce navigateur.';
    deps.showToast(message, 'error');
    return;
  }
  const value: CellValue = normalizeCellValue(column.type, text);
  const indexes = selectedRowIndexes.length > 0 ? [...selectedRowIndexes] : [focused.rowIndex];
  for (const index of indexes) {
    const rowData = api.getDisplayedRowAtIndex(index)?.data;
    if (rowData) {
      await commitCellEdit(rowData, colKey, value, deps);
    }
  }
}
