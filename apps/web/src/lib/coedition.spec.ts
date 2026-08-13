import { describe, expect, it } from 'vitest';
import type { RowDTO, UserDTO } from '@suivi/shared';
import {
  cellKey,
  initialsOf,
  removeRow,
  roomForView,
  rowBelongsToView,
  rowsQueryForView,
  uniquePresence,
  upsertRow,
} from './coedition';
import type { GridView } from './store';

function row(over: Partial<RowDTO> = {}): RowDTO {
  return {
    id: 'row1',
    month: '2026-08',
    position: 1,
    data: {},
    formats: {},
    version: 0,
    archived: false,
    updatedAt: '2026-08-10T10:00:00.000Z',
    ...over,
  };
}

function user(over: Partial<UserDTO> = {}): UserDTO {
  return {
    id: 'u1',
    email: 'alice@test.fr',
    displayName: 'Alice Martin',
    cursorColor: '#FF0000',
    ...over,
  };
}

const monthView: GridView = 'month';
const archivesView: GridView = 'archives';
const MOIS = '2026-08';

describe('roomForView / rowsQueryForView', () => {
  it('mappe une vue mensuelle sur la room month:<YYYY-MM>', () => {
    expect(roomForView(monthView, MOIS)).toBe('month:2026-08');
    expect(rowsQueryForView(monthView, MOIS)).toBe('/rows?month=2026-08');
  });

  it('mappe la vue archives sur la room archives', () => {
    expect(roomForView(archivesView, MOIS)).toBe('archives');
    expect(rowsQueryForView(archivesView, MOIS)).toBe('/rows?archived=true');
  });
});

describe('rowBelongsToView', () => {
  it('accepte une ligne non archivee du bon mois', () => {
    expect(rowBelongsToView(row(), monthView, MOIS)).toBe(true);
  });

  it('refuse une ligne d\'un autre mois', () => {
    expect(rowBelongsToView(row({ month: '2026-07' }), monthView, MOIS)).toBe(false);
  });

  it('refuse une ligne archivee dans une vue mensuelle', () => {
    expect(rowBelongsToView(row({ archived: true }), monthView, MOIS)).toBe(false);
  });

  it('accepte toute ligne archivee dans la vue archives, quel que soit le mois', () => {
    expect(rowBelongsToView(row({ archived: true, month: '2025-03' }), archivesView, MOIS)).toBe(true);
    expect(rowBelongsToView(row({ archived: false }), archivesView, MOIS)).toBe(false);
  });
});

describe('upsertRow / removeRow', () => {
  it('insere une nouvelle ligne en respectant l\'ordre des positions', () => {
    const rows = [row({ id: 'a', position: 1 }), row({ id: 'c', position: 3 })];
    const next = upsertRow(rows, row({ id: 'b', position: 2 }));
    expect(next.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(rows).toHaveLength(2); // immuable
  });

  it('remplace une ligne existante et la repositionne', () => {
    const rows = [row({ id: 'a', position: 1 }), row({ id: 'b', position: 2 })];
    const next = upsertRow(rows, row({ id: 'a', position: 9, version: 4 }));
    expect(next.map((r) => r.id)).toEqual(['b', 'a']);
    expect(next.find((r) => r.id === 'a')?.version).toBe(4);
  });

  it('departage deux positions identiques par id (ordre stable)', () => {
    const rows = [row({ id: 'zz', position: 1 })];
    const next = upsertRow(rows, row({ id: 'aa', position: 1 }));
    expect(next.map((r) => r.id)).toEqual(['aa', 'zz']);
  });

  it('supprime une ligne par id sans muter le tableau source', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })];
    expect(removeRow(rows, 'a').map((r) => r.id)).toEqual(['b']);
    expect(removeRow(rows, 'inconnu')).toHaveLength(2);
    expect(rows).toHaveLength(2);
  });
});

describe('uniquePresence', () => {
  it('retire l\'utilisateur courant et dedoublonne les sockets multiples', () => {
    const users = [
      user({ id: 'me' }),
      user({ id: 'u2', displayName: 'Bob' }),
      user({ id: 'u2', displayName: 'Bob' }),
    ];
    const result = uniquePresence(users, 'me');
    expect(result.map((u) => u.id)).toEqual(['u2']);
  });

  it('garde tout le monde quand l\'utilisateur courant est inconnu', () => {
    const result = uniquePresence([user({ id: 'u1' }), user({ id: 'u2' })], null);
    expect(result.map((u) => u.id)).toEqual(['u1', 'u2']);
  });
});

describe('initialsOf', () => {
  it('prend la premiere lettre du prenom et du dernier mot', () => {
    expect(initialsOf('Alice Martin')).toBe('AM');
    expect(initialsOf('  jean  pierre  dupont ')).toBe('JD');
  });

  it('prend les deux premieres lettres d\'un nom unique', () => {
    expect(initialsOf('Quentin')).toBe('QU');
  });

  it('retombe sur ? pour un nom vide', () => {
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('cellKey', () => {
  it('compose la clé rowId:colKey utilisée pour les verrous', () => {
    expect(cellKey('row1', 'statut')).toBe('row1:statut');
  });
});
