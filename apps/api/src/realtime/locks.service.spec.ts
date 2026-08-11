import { LOCK_TTL_MS, LocksService } from './locks.service';

const T0 = 1_000_000;

function input(overrides: Partial<Parameters<LocksService['acquire']>[0]> = {}) {
  return {
    rowId: 'row1',
    colKey: 'client',
    userId: 'userA',
    socketId: 'socketA',
    room: 'month:2026-08',
    ...overrides,
  };
}

describe('LocksService', () => {
  let locks: LocksService;

  beforeEach(() => {
    locks = new LocksService();
  });

  it('compose la cle de verrou sous la forme "rowId:colKey"', () => {
    expect(LocksService.key('row1', 'client')).toBe('row1:client');
  });

  it('accorde un verrou sur une cellule libre et pose un TTL de 30 s', () => {
    expect(locks.acquire(input(), T0)).toEqual({ granted: true });
    expect(locks.peek('row1', 'client')).toEqual({
      rowId: 'row1',
      colKey: 'client',
      userId: 'userA',
      socketId: 'socketA',
      room: 'month:2026-08',
      expiresAt: T0 + LOCK_TTL_MS,
    });
    expect(LOCK_TTL_MS).toBe(30_000);
  });

  it('refuse le verrou a un autre socket tant qu il n est pas expire', () => {
    locks.acquire(input(), T0);
    const refus = locks.acquire(
      input({ userId: 'userB', socketId: 'socketB' }),
      T0 + LOCK_TTL_MS - 1,
    );
    expect(refus).toEqual({ granted: false, holderUserId: 'userA' });
    expect(locks.peek('row1', 'client')?.socketId).toBe('socketA');
  });

  it('n interfere pas entre deux cellules differentes de la meme ligne', () => {
    locks.acquire(input(), T0);
    expect(
      locks.acquire(
        input({ colKey: 'statut', userId: 'userB', socketId: 'socketB' }),
        T0,
      ),
    ).toEqual({ granted: true });
    expect(locks.size()).toBe(2);
  });

  it('renouvelle le TTL quand le meme socket redemande le verrou (frappe en cours)', () => {
    locks.acquire(input(), T0);
    expect(locks.acquire(input(), T0 + 20_000)).toEqual({ granted: true });
    expect(locks.peek('row1', 'client')?.expiresAt).toBe(T0 + 20_000 + LOCK_TTL_MS);
    expect(locks.size()).toBe(1);
  });

  it('accorde le verrou a un autre socket une fois le TTL expire', () => {
    locks.acquire(input(), T0);
    const apres = locks.acquire(
      input({ userId: 'userB', socketId: 'socketB' }),
      T0 + LOCK_TTL_MS,
    );
    expect(apres).toEqual({ granted: true });
    expect(locks.peek('row1', 'client')?.userId).toBe('userB');
  });

  it('libere le verrou a la demande de son detenteur', () => {
    locks.acquire(input(), T0);
    const libere = locks.release({ rowId: 'row1', colKey: 'client', socketId: 'socketA' });
    expect(libere?.userId).toBe('userA');
    expect(locks.peek('row1', 'client')).toBeNull();
  });

  it('ignore une liberation demandee par un autre socket', () => {
    locks.acquire(input(), T0);
    expect(
      locks.release({ rowId: 'row1', colKey: 'client', socketId: 'socketB' }),
    ).toBeNull();
    expect(locks.peek('row1', 'client')?.socketId).toBe('socketA');
  });

  it('retourne null pour la liberation d une cellule non verrouillee', () => {
    expect(
      locks.release({ rowId: 'inconnue', colKey: 'client', socketId: 'socketA' }),
    ).toBeNull();
  });

  it('libere tous les verrous d un socket et retourne la liste (deconnexion)', () => {
    locks.acquire(input(), T0);
    locks.acquire(input({ colKey: 'statut' }), T0);
    locks.acquire(input({ rowId: 'row2', colKey: 'tech', room: 'archives' }), T0);
    locks.acquire(input({ rowId: 'row3', userId: 'userB', socketId: 'socketB' }), T0);

    const liberes = locks.releaseAllForSocket('socketA');
    expect(liberes).toHaveLength(3);
    expect(liberes.map((l) => `${l.rowId}:${l.colKey}`).sort()).toEqual([
      'row1:client',
      'row1:statut',
      'row2:tech',
    ]);
    expect(liberes.find((l) => l.rowId === 'row2')?.room).toBe('archives');
    expect(locks.size()).toBe(1);
    expect(locks.peek('row3', 'client')?.socketId).toBe('socketB');
  });

  it('retourne un tableau vide si le socket ne detient aucun verrou', () => {
    expect(locks.releaseAllForSocket('socketZ')).toEqual([]);
  });

  it('sweep retire et retourne uniquement les verrous expires', () => {
    locks.acquire(input(), T0);
    locks.acquire(input({ colKey: 'statut' }), T0 + 10_000);

    const expires = locks.sweep(T0 + LOCK_TTL_MS);
    expect(expires).toHaveLength(1);
    expect(expires[0]).toMatchObject({ rowId: 'row1', colKey: 'client', room: 'month:2026-08' });
    expect(locks.size()).toBe(1);
    expect(locks.peek('row1', 'statut')).not.toBeNull();
  });

  it('sweep ne retourne rien quand aucun verrou n est expire', () => {
    locks.acquire(input(), T0);
    expect(locks.sweep(T0 + 1)).toEqual([]);
    expect(locks.size()).toBe(1);
  });
});
