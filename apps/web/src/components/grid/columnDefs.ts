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
import { SelectColumnFilter, SelectColumnFloatingFilter } from './SelectColumnFilter';

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

/**
 * Comparateur `agDateColumnFilter` branché sur le format stocké ISO
 * `YYYY-MM-DD` (préfixe accepté, comme `formatDateFr`). Retour : négatif si la
 * cellule précède la date du filtre, 0 le même jour, positif après.
 *
 * Valeur non-ISO ou date impossible (résidus Zoho type « 31/09 ») : `NaN`,
 * qui échoue toute comparaison — la ligne est exclue des résultats d'un
 * filtre par plage, sans qu'aucune donnée ne soit modifiée.
 */
export function compareDateIso(filterDate: Date, cellValue: unknown): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(cellValue ?? ''));
  if (!match) return Number.NaN;
  const annee = Number(match[1]);
  const mois = Number(match[2]);
  const jour = Number(match[3]);
  const cellDate = new Date(annee, mois - 1, jour);
  // `new Date` fait « rouler » les dates impossibles (2026-02-31 → 3 mars) :
  // on vérifie l'aller-retour pour les déclarer non comparables.
  if (
    cellDate.getFullYear() !== annee ||
    cellDate.getMonth() !== mois - 1 ||
    cellDate.getDate() !== jour
  ) {
    return Number.NaN;
  }
  return cellDate.getTime() - filterDate.getTime();
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
      // Filtres PERSONNELS : purement côté client, chacun voit sa grille.
      // Texte par défaut ; les colonnes SELECT reçoivent le filtre
      // multi-sélection maison (le set filter est Enterprise) et les DATE le
      // filtre de plage natif — branchés plus bas, par type.
      filter: 'agTextColumnFilter',
      floatingFilter: true,
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
      // Filtre multi-sélection maison : cases à cocher en pastilles, même
      // source de choix que l'éditeur. Le flottant compact affiche « Tous »
      // ou « N sélectionnés » et ouvre le panneau au clic.
      def.filter = SelectColumnFilter;
      def.filterParams = { choices };
      def.floatingFilterComponent = SelectColumnFloatingFilter;
    } else if (column.type === 'LONGTEXT') {
      def.cellEditor = 'agLargeTextCellEditor';
      def.cellEditorPopup = true;
      def.cellEditorParams = { maxLength: 5000, rows: 10, cols: 60 };
    } else if (column.type === 'DATE') {
      def.cellEditor = DateCellEditor;
      def.valueFormatter = (params: ValueFormatterParams<RowDTO, CellValue>) =>
        formatDateFr(params.value ?? null);
      // Filtre par plage de dates : comparateur branché sur le format stocké
      // ISO (le `valueGetter` renvoie la valeur brute), bornes incluses —
      // « du 01/08 au 31/08 » garde bien les dossiers du 31.
      def.filter = 'agDateColumnFilter';
      def.filterParams = {
        defaultOption: 'inRange',
        inRangeInclusive: true,
        browserDatePicker: true,
        comparator: compareDateIso,
      };
    } else if (column.type === 'NUMBER') {
      def.cellEditor = 'agNumberCellEditor';
    } else {
      def.cellEditor = 'agTextCellEditor';
    }

    return def;
  });
}
