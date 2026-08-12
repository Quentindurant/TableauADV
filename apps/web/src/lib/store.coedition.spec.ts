import { beforeEach, describe, expect, it } from 'vitest';
import type { RowDTO, UserDTO } from '@suivi/shared';
import { useAppStore } from './store';

function row(over: Partial<RowDTO> = {}): RowDTO {
  return {
    id: 'row1',
    month: '2026-08',
    position: 1,
    data: { client: 'ARCADIA' },
    formats: {},
    version: 1,
    archived: false,
    updatedAt: '2026-08-10T10:00:00.000Z',
    ...over,
  };
}

const me: UserDTO = {
  id: 'me',
  email: 'me@test.fr',
  displayName: 'Moi Même',
  cursorColor: '#123456',
};
const bob: UserDTO = {
  id: 'bob',
  email: 'bob@test.fr',
  displayName: 'Bob Dupont',
  cursorColor: '#00FF00',
};

beforeEach(() => {
  useAppStore.setState({
    user: me,
    users: [me, bob],
    columns: [],
    rows: [],
    view: 'month',
    monthCourant: '2026-08',
    connected: true,
    presence: [],
    focuses: {},
    locks: {},
    toast: null,
  });
});

describe('présence et connexion', () => {
  it('mémorise l’état de connexion', () => {
    useAppStore.getState().setConnected(false);
    expect(useAppStore.getState().connected).toBe(false);
  });

  it('exclut l’utilisateur courant et dédoublonne la présence', () => {
    useAppStore.getState().setPresence([me, bob, bob]);
    expect(useAppStore.getState().presence.map((u) => u.id)).toEqual(['bob']);
  });
});

describe('focus distant', () => {
  it('enregistre le focus d’un collègue puis l’efface au blur', () => {
    useAppStore.getState().setRemoteFocus('bob', 'row1', 'client');
    expect(useAppStore.getState().focuses.bob).toEqual({
      userId: 'bob',
      rowId: 'row1',
      colKey: 'client',
    });
    useAppStore.getState().setRemoteFocus('bob', null, null);
    expect(useAppStore.getState().focuses.bob).toBeUndefined();
  });

  it('remplace le focus précédent du même collègue (une cellule à la fois)', () => {
    useAppStore.getState().setRemoteFocus('bob', 'row1', 'client');
    useAppStore.getState().setRemoteFocus('bob', 'row2', 'statut');
    expect(Object.keys(useAppStore.getState().focuses)).toEqual(['bob']);
    expect(useAppStore.getState().focuses.bob.rowId).toBe('row2');
  });
});

describe('verrous distants', () => {
  it('indexe un verrou par rowId:colKey puis le libère', () => {
    useAppStore.getState().setLock({ rowId: 'row1', colKey: 'statut', user: bob });
    expect(useAppStore.getState().locks['row1:statut'].user.id).toBe('bob');
    useAppStore.getState().clearLock('row1', 'statut');
    expect(useAppStore.getState().locks['row1:statut']).toBeUndefined();
  });

  it('clearCoedition remet à zéro présence, focus et verrous', () => {
    useAppStore.getState().setPresence([bob]);
    useAppStore.getState().setRemoteFocus('bob', 'row1', 'client');
    useAppStore.getState().setLock({ rowId: 'row1', colKey: 'statut', user: bob });
    useAppStore.getState().clearCoedition();
    expect(useAppStore.getState().presence).toEqual([]);
    expect(useAppStore.getState().focuses).toEqual({});
    expect(useAppStore.getState().locks).toEqual({});
  });
});

describe('row.created', () => {
  it('insère une ligne appartenant à la vue courante', () => {
    useAppStore.getState().applyRowCreated(row({ id: 'new', position: 2 }));
    expect(useAppStore.getState().rows.map((r) => r.id)).toEqual(['new']);
  });

  it('ignore une ligne d’un autre mois', () => {
    useAppStore.getState().applyRowCreated(row({ id: 'other', month: '2026-07' }));
    expect(useAppStore.getState().rows).toEqual([]);
  });
});

describe('row.updated', () => {
  it('applique la mise à jour d’un collègue', () => {
    useAppStore.setState({ rows: [row()] });
    useAppStore.getState().applyRowUpdated(
      row({ data: { client: 'BOULANGERIE' }, version: 2 }),
      'bob',
    );
    expect(useAppStore.getState().rows[0].data.client).toBe('BOULANGERIE');
    expect(useAppStore.getState().rows[0].version).toBe(2);
  });

  it('ignore l’écho de sa propre modification (déjà appliquée localement)', () => {
    useAppStore.setState({ rows: [row({ data: { client: 'LOCAL' }, version: 5 }) ] });
    useAppStore.getState().applyRowUpdated(row({ data: { client: 'ECHO' }, version: 5 }), 'me');
    expect(useAppStore.getState().rows[0].data.client).toBe('LOCAL');
  });

  it('ignore une version plus ancienne que celle déjà connue', () => {
    useAppStore.setState({ rows: [row({ version: 7, data: { client: 'RECENT' } })] });
    useAppStore.getState().applyRowUpdated(row({ version: 3, data: { client: 'VIEUX' } }), 'bob');
    expect(useAppStore.getState().rows[0].data.client).toBe('RECENT');
  });

  it('ignore la mise à jour d’une ligne absente de la vue', () => {
    useAppStore.getState().applyRowUpdated(row({ month: '2026-07' }), 'bob');
    expect(useAppStore.getState().rows).toEqual([]);
  });
});

describe('row.deleted', () => {
  it('retire la ligne supprimée', () => {
    useAppStore.setState({ rows: [row(), row({ id: 'row2', position: 2 })] });
    useAppStore.getState().applyRowDeleted('row1');
    expect(useAppStore.getState().rows.map((r) => r.id)).toEqual(['row2']);
  });
});

describe('row.moved', () => {
  it('fait ENTRER dans la vue une ligne déplacée vers le mois courant', () => {
    useAppStore.setState({ rows: [] });
    useAppStore.getState().applyRowMoved(row({ id: 'entrante', month: '2026-08' }));
    expect(useAppStore.getState().rows.map((r) => r.id)).toEqual(['entrante']);
  });

  it('fait SORTIR de la vue une ligne déplacée vers un autre mois', () => {
    useAppStore.setState({ rows: [row({ id: 'sortante' })] });
    useAppStore.getState().applyRowMoved(row({ id: 'sortante', month: '2026-09' }));
    expect(useAppStore.getState().rows).toEqual([]);
  });

  it('fait sortir de la vue mensuelle une ligne archivée', () => {
    useAppStore.setState({ rows: [row({ id: 'archivee' })] });
    useAppStore.getState().applyRowMoved(row({ id: 'archivee', archived: true }));
    expect(useAppStore.getState().rows).toEqual([]);
  });
});

describe('écriture locale optimiste', () => {
  it('setRowLocalValue change une valeur sans toucher à la version', () => {
    useAppStore.setState({ rows: [row()] });
    useAppStore.getState().setRowLocalValue('row1', 'client', 'SAISIE');
    expect(useAppStore.getState().rows[0].data.client).toBe('SAISIE');
    expect(useAppStore.getState().rows[0].version).toBe(1);
  });

  it('replaceRow remplace la ligne quelles que soient les règles de vue', () => {
    useAppStore.setState({ rows: [row()] });
    useAppStore.getState().replaceRow(row({ version: 9, data: { client: 'SERVEUR' } }));
    expect(useAppStore.getState().rows[0].version).toBe(9);
    expect(useAppStore.getState().rows[0].data.client).toBe('SERVEUR');
  });
});
