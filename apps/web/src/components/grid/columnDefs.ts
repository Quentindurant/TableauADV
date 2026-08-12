import type {
  CellClassParams,
  ColDef,
  ValueFormatterParams,
  ValueGetterParams,
  ValueSetterParams,
} from 'ag-grid-community';
import type {
  CellValue,
  ChoiceDTO,
  ColumnDTO,
  ColumnType,
  RowDTO,
} from '@suivi/shared';
import { SelectCellEditor } from './SelectCellEditor';
import { SelectCellRenderer } from './SelectCellRenderer';
import { DateCellEditor } from './DateCellEditor';

/** `2026-08-14` (ou son ISO complet) → `14/08/2026`. Sinon, valeur brute. */
export function formatDateFr(value: CellValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return text;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Normalise ce que l'éditeur renvoie avant de l'écrire dans `Row.data`.
 * Les codes (« 02100 », « 2A ») restent du texte : seul le type NUMBER convertit.
 */
export function normalizeCellValue(type: ColumnType, raw: unknown): CellValue {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return type === 'NUMBER' ? raw : String(raw);
  const text = String(raw).trim();
  if (text === '') return null;
  if (type === 'NUMBER') {
    const parsed = Number(text.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return text;
}

export function cellStyleForRow(
  row: RowDTO | undefined,
  key: string,
): { backgroundColor: string } | null {
  const background = row?.formats?.[key]?.bg;
  return background ? { backgroundColor: background } : null;
}

export function buildColumnDefs(
  columns: ColumnDTO[],
  choicesByColumnKey: Record<string, ChoiceDTO[]>,
): ColDef<RowDTO>[] {
  const ordered = [...columns].sort((a, b) => a.position - b.position);

  return ordered.map((column, index) => {
    const key = column.key;
    const choices = choicesByColumnKey[key] ?? [];

    const def: ColDef<RowDTO> = {
      colId: key,
      headerName: column.label,
      width: column.width,
      hide: !column.visible,
      resizable: true,
      suppressMovable: false,
      editable: true,
      sortable: false,
      valueGetter: (params: ValueGetterParams<RowDTO>) =>
        params.data ? (params.data.data[key] ?? null) : null,
      valueSetter: (params: ValueSetterParams<RowDTO>) => {
        if (!params.data) return false;
        params.data.data[key] = normalizeCellValue(column.type, params.newValue);
        return true;
      },
      cellStyle: (params: CellClassParams<RowDTO>) =>
        cellStyleForRow(params.data, key),
    };

    // La poignée de réordonnancement vit sur la première colonne du tableau.
    if (index === 0) {
      def.rowDrag = true;
    }

    if (column.type === 'SELECT') {
      def.cellRenderer = SelectCellRenderer;
      def.cellRendererParams = { choices };
      def.cellEditor = SelectCellEditor;
      def.cellEditorParams = { choices };
      def.cellEditorPopup = true;
    } else if (column.type === 'LONGTEXT') {
      def.cellEditor = 'agLargeTextCellEditor';
      def.cellEditorPopup = true;
      def.cellEditorParams = { maxLength: 5000, rows: 10, cols: 60 };
    } else if (column.type === 'DATE') {
      def.cellEditor = DateCellEditor;
      def.valueFormatter = (params: ValueFormatterParams<RowDTO, CellValue>) =>
        formatDateFr(params.value ?? null);
    } else if (column.type === 'NUMBER') {
      def.cellEditor = 'agNumberCellEditor';
    } else {
      def.cellEditor = 'agTextCellEditor';
    }

    return def;
  });
}
