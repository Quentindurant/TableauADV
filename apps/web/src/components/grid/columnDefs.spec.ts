import { describe, expect, it } from 'vitest';
import type { ColumnDTO, RowDTO } from '@suivi/shared';
import {
  buildColumnDefs,
  cellStyleForRow,
  formatDateFr,
  normalizeCellValue,
} from './columnDefs';

const columns: ColumnDTO[] = [
  {
    id: 'col-impe',
    key: 'impe',
    label: 'IMPE',
    type: 'DATE',
    position: 0,
    width: 110,
    visible: true,
    choices: [],
  },
  {
    id: 'col-client',
    key: 'client',
    label: 'CLIENT',
    type: 'TEXT',
    position: 1,
    width: 220,
    visible: true,
    choices: [],
  },
  {
    id: 'col-porta',
    key: 'porta_commentaires',
    label: 'PORTA ET COMMENTAIRES IMPORTANT',
    type: 'LONGTEXT',
    position: 2,
    width: 320,
    visible: true,
    choices: [],
  },
  {
    id: 'col-statut',
    key: 'statut',
    label: 'INSTALLATION',
    type: 'SELECT',
    position: 3,
    width: 150,
    visible: true,
    choices: [],
  },
  {
    id: 'col-masquee',
    key: 'infos_facturation',
    label: 'INFOS FACTURATION',
    type: 'TEXT',
    position: 4,
    width: 220,
    visible: false,
    choices: [],
  },
];

const row: RowDTO = {
  id: 'row-1',
  month: '2026-08',
  position: 0,
  data: { impe: '2026-08-14', client: 'ARCADIA', statut: 'NEW' },
  formats: { client: { bg: '#FFFF00' } },
  version: 1,
  archived: false,
  updatedAt: '2026-08-10T10:00:00.000Z',
};

describe('formatDateFr', () => {
  it('formate une date ISO en JJ/MM/AAAA', () => {
    expect(formatDateFr('2026-08-14')).toBe('14/08/2026');
    expect(formatDateFr('2026-08-14T00:00:00.000Z')).toBe('14/08/2026');
  });

  it('rend une chaîne vide pour null et laisse passer une valeur non datée', () => {
    expect(formatDateFr(null)).toBe('');
    expect(formatDateFr('à confirmer')).toBe('à confirmer');
  });
});

describe('normalizeCellValue', () => {
  it('trime le texte et transforme le vide en null', () => {
    expect(normalizeCellValue('TEXT', '  ARCADIA  ')).toBe('ARCADIA');
    expect(normalizeCellValue('TEXT', '   ')).toBeNull();
    expect(normalizeCellValue('TEXT', undefined)).toBeNull();
  });

  it('préserve les codes textuels (zéros initiaux, « 2A »)', () => {
    expect(normalizeCellValue('TEXT', '02100')).toBe('02100');
    expect(normalizeCellValue('TEXT', '2A')).toBe('2A');
  });

  it('convertit les nombres pour une colonne NUMBER', () => {
    expect(normalizeCellValue('NUMBER', '78')).toBe(78);
    expect(normalizeCellValue('NUMBER', '12,5')).toBe(12.5);
    expect(normalizeCellValue('NUMBER', 'abc')).toBeNull();
  });
});

describe('cellStyleForRow', () => {
  it('applique le surlignage manuel de la ligne', () => {
    expect(cellStyleForRow(row, 'client')).toEqual({ backgroundColor: '#FFFF00' });
  });

  it('rend null sans surlignage ou sans ligne', () => {
    expect(cellStyleForRow(row, 'statut')).toBeNull();
    expect(cellStyleForRow(undefined, 'client')).toBeNull();
  });
});

describe('buildColumnDefs', () => {
  const defs = buildColumnDefs(columns, { statut: [] });

  it("génère une colonne par ColumnDTO, dans l'ordre des positions", () => {
    expect(defs.map((def) => def.colId)).toEqual([
      'impe',
      'client',
      'porta_commentaires',
      'statut',
      'infos_facturation',
    ]);
    expect(defs.map((def) => def.headerName)).toEqual([
      'IMPE',
      'CLIENT',
      'PORTA ET COMMENTAIRES IMPORTANT',
      'INSTALLATION',
      'INFOS FACTURATION',
    ]);
  });

  it('reprend largeur, visibilité, redimensionnement et déplacement', () => {
    expect(defs[1].width).toBe(220);
    expect(defs[1].resizable).toBe(true);
    expect(defs[1].suppressMovable).toBe(false);
    expect(defs[1].editable).toBe(true);
    expect(defs[4].hide).toBe(true);
    expect(defs[0].hide).toBe(false);
  });

  it('active la poignée de drag sur la première colonne uniquement', () => {
    expect(defs[0].rowDrag).toBe(true);
    expect(defs[1].rowDrag).toBeUndefined();
  });

  it('lit la valeur dans data.<key> via valueGetter', () => {
    const getter = defs[1].valueGetter as (params: { data?: RowDTO }) => unknown;
    expect(getter({ data: row })).toBe('ARCADIA');
    expect(getter({ data: undefined })).toBeNull();
  });

  it('écrit dans data.<key> via valueSetter, en normalisant', () => {
    const target: RowDTO = { ...row, data: { ...row.data } };
    const setter = defs[1].valueSetter as (params: {
      data: RowDTO;
      newValue: unknown;
    }) => boolean;
    expect(setter({ data: target, newValue: '  NEO  ' })).toBe(true);
    expect(target.data.client).toBe('NEO');
  });

  it('formate les dates en JJ/MM/AAAA', () => {
    const formatter = defs[0].valueFormatter as (params: { value: unknown }) => string;
    expect(formatter({ value: '2026-08-14' })).toBe('14/08/2026');
  });

  it("utilise l'éditeur popup natif pour le texte long", () => {
    expect(defs[2].cellEditor).toBe('agLargeTextCellEditor');
    expect(defs[2].cellEditorPopup).toBe(true);
  });

  it('branche renderer et éditeur maison sur les colonnes liste', () => {
    expect(typeof defs[3].cellRenderer).toBe('function');
    expect(typeof defs[3].cellEditor).toBe('function');
    expect(defs[3].cellEditorPopup).toBe(true);
    const params = defs[3].cellRendererParams as { choices: unknown[] };
    expect(params.choices).toEqual([]);
  });

  it('applique le surlignage manuel via cellStyle', () => {
    const cellStyle = defs[1].cellStyle as (params: { data?: RowDTO }) => unknown;
    expect(cellStyle({ data: row })).toEqual({ backgroundColor: '#FFFF00' });
  });
});
