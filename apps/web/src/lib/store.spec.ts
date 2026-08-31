import { beforeEach, describe, expect, it } from 'vitest';
import type { ColumnDTO, RowDTO } from '@suivi/shared';
import { useAppStore } from './store';

function column(): ColumnDTO {
  return {
    id: 'col-statut',
    key: 'statut',
    label: 'INSTALLATION',
    type: 'SELECT',
    position: 11,
    width: 150,
    visible: true,
    choices: [
      {
        id: 'ch-2',
        columnId: 'col-statut',
        label: 'ANNULEE',
        bgColor: '#FF0000',
        textColor: '#000000',
        bold: true,
        position: 13,
        archived: true,
      },
      {
        id: 'ch-1',
        columnId: 'col-statut',
        label: 'NEW',
        bgColor: '#FFFF00',
        textColor: '#FF0000',
        bold: true,
        position: 0,
        archived: false,
      },
    ],
  };
}

function row(overrides: Partial<RowDTO> = {}): RowDTO {
  return {
    id: 'row-1',
    month: '2026-08',
    position: 0,
    data: { client: 'ARCADIA', statut: 'NEW' },
    formats: { num_chrono: { bg: '#F7DC6F' } },
    version: 3,
    archived: false,
    updatedAt: '2026-08-10T10:00:00.000Z',
    ...overrides,
  };
}

const initial = useAppStore.getState();

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      ...initial,
      user: null,
      columns: [],
      choicesByColumnKey: {},
      rows: [],
      months: [],
      monthCourant: '2026-08',
      view: 'month',
      toast: null,
    });
  });

  it('indexe les choix par clé de colonne, triés par position, archivés compris', () => {
    useAppStore.getState().setColumns([column()]);
    const choices = useAppStore.getState().choicesByColumnKey['statut'];
    expect(choices.map((choice) => choice.label)).toEqual(['NEW', 'ANNULEE']);
  });

  it('applyRowPatch fusionne data, formats et version sans muter la ligne d’origine', () => {
    const original = row();
    useAppStore.getState().setRows([original]);
    useAppStore.getState().applyRowPatch('row-1', {
      patch: { statut: 'ATT PV' },
      version: 4,
    });
    const updated = useAppStore.getState().rows[0];
    expect(updated.data).toEqual({ client: 'ARCADIA', statut: 'ATT PV' });
    expect(updated.version).toBe(4);
    expect(original.data.statut).toBe('NEW');
  });

  it('applyRowPatch supprime un format quand la valeur est null', () => {
    useAppStore.getState().setRows([row()]);
    useAppStore.getState().applyRowPatch('row-1', { formats: { num_chrono: null } });
    expect(useAppStore.getState().rows[0].formats).toEqual({});
  });

  it('applyRowPatch ignore une ligne inconnue', () => {
    useAppStore.getState().setRows([row()]);
    useAppStore.getState().applyRowPatch('row-inconnue', { patch: { client: 'X' } });
    expect(useAppStore.getState().rows[0].data.client).toBe('ARCADIA');
  });

  it('addRow insère à la position demandée, removeRow retire la ligne', () => {
    useAppStore.getState().setRows([row(), row({ id: 'row-2', position: 1 })]);
    useAppStore.getState().addRow(row({ id: 'row-3', position: 1 }), 1);
    expect(useAppStore.getState().rows.map((r) => r.id)).toEqual([
      'row-1',
      'row-3',
      'row-2',
    ]);
    useAppStore.getState().removeRow('row-1');
    expect(useAppStore.getState().rows.map((r) => r.id)).toEqual(['row-3', 'row-2']);
  });

  it('addRow sans index ajoute en fin de liste', () => {
    useAppStore.getState().setRows([row()]);
    useAppStore.getState().addRow(row({ id: 'row-9' }));
    expect(useAppStore.getState().rows.map((r) => r.id)).toEqual(['row-1', 'row-9']);
  });

  it('upsertRow remplace une ligne existante et ajoute une ligne inconnue', () => {
    useAppStore.getState().setRows([row()]);
    useAppStore.getState().upsertRow(row({ version: 9, data: { client: 'NEO' } }));
    expect(useAppStore.getState().rows).toHaveLength(1);
    expect(useAppStore.getState().rows[0].version).toBe(9);
    useAppStore.getState().upsertRow(row({ id: 'row-7' }));
    expect(useAppStore.getState().rows).toHaveLength(2);
  });

  it('showToast / hideToast pilotent le message utilisateur', () => {
    useAppStore.getState().showToast('Enregistrement impossible.', 'error');
    expect(useAppStore.getState().toast).toEqual({
      message: 'Enregistrement impossible.',
      kind: 'error',
    });
    useAppStore.getState().hideToast();
    expect(useAppStore.getState().toast).toBeNull();
  });
});
