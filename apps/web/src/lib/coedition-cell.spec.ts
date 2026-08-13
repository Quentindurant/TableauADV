import { describe, expect, it } from 'vitest';
import type { UserDTO } from '@suivi/shared';
import {
  cellStyleFor,
  decorateCell,
  isLockedByOther,
  type CellCoeditionState,
} from './coedition-cell';

const bob: UserDTO = { id: 'bob', email: 'bob@test.fr', displayName: 'Bob Dupont', cursorColor: '#00FF00' };
const me: UserDTO = { id: 'me', email: 'me@test.fr', displayName: 'Moi Même', cursorColor: '#123456' };

function state(over: Partial<CellCoeditionState> = {}): CellCoeditionState {
  return { focuses: {}, locks: {}, presence: [bob], meId: 'me', ...over };
}

describe('decorateCell', () => {
  it('ne décore pas une cellule libre', () => {
    expect(decorateCell('row1', 'client', state())).toEqual({ focusedBy: null, lockedBy: null });
  });

  it('associe le focus distant à l’utilisateur présent correspondant', () => {
    const decoration = decorateCell(
      'row1',
      'client',
      state({ focuses: { bob: { userId: 'bob', rowId: 'row1', colKey: 'client' } } }),
    );
    expect(decoration.focusedBy).toEqual(bob);
    expect(decoration.lockedBy).toBeNull();
  });

  it('ignore le focus d’un utilisateur absent de la présence', () => {
    const decoration = decorateCell(
      'row1',
      'client',
      state({
        presence: [],
        focuses: { bob: { userId: 'bob', rowId: 'row1', colKey: 'client' } },
      }),
    );
    expect(decoration.focusedBy).toBeNull();
  });

  it('ignore le focus sur une AUTRE cellule', () => {
    const decoration = decorateCell(
      'row1',
      'statut',
      state({ focuses: { bob: { userId: 'bob', rowId: 'row1', colKey: 'client' } } }),
    );
    expect(decoration.focusedBy).toBeNull();
  });

  it('remonte le détenteur du verrou', () => {
    const decoration = decorateCell(
      'row1',
      'client',
      state({ locks: { 'row1:client': { rowId: 'row1', colKey: 'client', user: bob } } }),
    );
    expect(decoration.lockedBy).toEqual(bob);
  });

  it('ignore un verrou détenu par soi-même (édition en cours locale)', () => {
    const decoration = decorateCell(
      'row1',
      'client',
      state({ locks: { 'row1:client': { rowId: 'row1', colKey: 'client', user: me } } }),
    );
    expect(decoration.lockedBy).toBeNull();
  });
});

describe('isLockedByOther', () => {
  it('vrai uniquement quand un collègue détient le verrou', () => {
    const locked = state({ locks: { 'row1:client': { rowId: 'row1', colKey: 'client', user: bob } } });
    expect(isLockedByOther('row1', 'client', locked)).toBe(true);
    expect(isLockedByOther('row1', 'statut', locked)).toBe(false);
    const mine = state({ locks: { 'row1:client': { rowId: 'row1', colKey: 'client', user: me } } });
    expect(isLockedByOther('row1', 'client', mine)).toBe(false);
  });
});

describe('cellStyleFor', () => {
  it('rend null quand rien n’est à décorer', () => {
    expect(cellStyleFor({ focusedBy: null, lockedBy: null })).toBeNull();
  });

  it('expose la couleur du collègue et son nom en variables CSS', () => {
    expect(cellStyleFor({ focusedBy: bob, lockedBy: null })).toEqual({
      '--coedition-color': '#00FF00',
      '--coedition-label': '"Bob Dupont"',
    });
  });

  it('donne la priorité au verrou sur le focus', () => {
    const other: UserDTO = { ...bob, id: 'zoe', displayName: 'Zoé', cursorColor: '#FF00FF' };
    expect(cellStyleFor({ focusedBy: other, lockedBy: bob })).toEqual({
      '--coedition-color': '#00FF00',
      '--coedition-label': '"Bob Dupont"',
    });
  });

  it('échappe les guillemets du nom dans l’étiquette CSS', () => {
    const tricky: UserDTO = { ...bob, displayName: 'Bob "Le Grand"' };
    expect(cellStyleFor({ focusedBy: tricky, lockedBy: null })).toEqual({
      '--coedition-color': '#00FF00',
      '--coedition-label': '"Bob \\"Le Grand\\""',
    });
  });
});
