import { beforeEach, describe, expect, it } from 'vitest';
import type { UserDTO } from '@suivi/shared';
import { useAppStore } from './store';

const moi: UserDTO = {
  id: 'moi',
  email: 'moi@test.fr',
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
    user: moi,
    users: [],
    presence: [],
    focuses: {},
    locks: {},
    connected: true,
  });
});

describe('setUsers — recollage de l’annuaire sur la présence', () => {
  it('applique la nouvelle couleur de curseur aux collègues déjà présents', () => {
    useAppStore.getState().setPresence([bob]);

    useAppStore.getState().setUsers([moi, { ...bob, cursorColor: '#FF0000' }]);

    expect(useAppStore.getState().presence).toEqual([{ ...bob, cursorColor: '#FF0000' }]);
  });

  it('applique le nouveau nom affiché aux collègues déjà présents', () => {
    useAppStore.getState().setPresence([bob]);

    useAppStore.getState().setUsers([{ ...bob, displayName: 'Bob Durand' }]);

    expect(useAppStore.getState().presence[0].displayName).toBe('Bob Durand');
  });

  it('conserve un présent absent de l’annuaire rechargé', () => {
    useAppStore.getState().setPresence([bob]);

    useAppStore.getState().setUsers([moi]);

    expect(useAppStore.getState().presence).toEqual([bob]);
  });

  it('garde la même référence de présence quand rien ne change', () => {
    useAppStore.getState().setPresence([bob]);
    const avant = useAppStore.getState().presence;

    useAppStore.getState().setUsers([moi, bob]);

    expect(useAppStore.getState().presence).toBe(avant);
  });

  it('mémorise l’annuaire rechargé', () => {
    useAppStore.getState().setUsers([moi, bob]);

    expect(useAppStore.getState().users).toEqual([moi, bob]);
  });
});
