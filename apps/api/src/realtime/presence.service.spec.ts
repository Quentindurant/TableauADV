import type { UserDTO } from '@suivi/shared';
import { PresenceService } from './presence.service';

const alice: UserDTO = {
  id: 'userA',
  email: 'alice@suivi.local',
  displayName: 'Alice',
  cursorColor: '#FF0000',
};
const bob: UserDTO = {
  id: 'userB',
  email: 'bob@suivi.local',
  displayName: 'Bob',
  cursorColor: '#0000FF',
};

describe('PresenceService', () => {
  let presence: PresenceService;

  beforeEach(() => {
    presence = new PresenceService();
  });

  it('enregistre un socket sans room au depart', () => {
    presence.add('s1', alice);
    expect(presence.size()).toBe(1);
    expect(presence.getRoom('s1')).toBeNull();
    expect(presence.getUser('s1')).toEqual(alice);
  });

  it('ne liste que les sockets de la room demandee, avec leur socketId', () => {
    presence.add('s1', alice);
    presence.add('s2', bob);
    presence.setRoom('s1', 'month:2026-08');
    presence.setRoom('s2', 'archives');

    expect(presence.listRoom('month:2026-08')).toEqual([
      { ...alice, socketId: 's1' },
    ]);
    expect(presence.listRoom('archives')).toEqual([{ ...bob, socketId: 's2' }]);
    expect(presence.listRoom('month:2026-09')).toEqual([]);
  });

  it('liste deux utilisateurs presents dans la meme room', () => {
    presence.add('s1', alice);
    presence.add('s2', bob);
    presence.setRoom('s1', 'month:2026-08');
    presence.setRoom('s2', 'month:2026-08');

    const users = presence.listRoom('month:2026-08');
    expect(users).toHaveLength(2);
    expect(users.map((u) => u.socketId).sort()).toEqual(['s1', 's2']);
    expect(users.map((u) => u.displayName).sort()).toEqual(['Alice', 'Bob']);
  });

  it('deplace un socket d une room a l autre', () => {
    presence.add('s1', alice);
    presence.setRoom('s1', 'month:2026-08');
    presence.setRoom('s1', 'archives');

    expect(presence.listRoom('month:2026-08')).toEqual([]);
    expect(presence.getRoom('s1')).toBe('archives');
  });

  it('retrouve un utilisateur connecte par son id', () => {
    presence.add('s1', alice);
    expect(presence.findUserById('userA')).toEqual(alice);
    expect(presence.findUserById('inconnu')).toBeUndefined();
  });

  it('retire un socket et retourne son entree', () => {
    presence.add('s1', alice);
    presence.setRoom('s1', 'month:2026-08');

    const entry = presence.remove('s1');
    expect(entry).toEqual({ socketId: 's1', room: 'month:2026-08', user: alice });
    expect(presence.size()).toBe(0);
    expect(presence.listRoom('month:2026-08')).toEqual([]);
    expect(presence.remove('s1')).toBeNull();
  });

  it('ignore setRoom sur un socket inconnu', () => {
    presence.setRoom('inconnu', 'month:2026-08');
    expect(presence.size()).toBe(0);
    expect(presence.getRoom('inconnu')).toBeNull();
    expect(presence.getUser('inconnu')).toBeNull();
  });
});
