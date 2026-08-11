import {
  buildDiff,
  changedKeysOf,
  changedKeysOfPayload,
  conflictKeys,
  mergeData,
  mergeFormats,
  versionOfPayload,
} from './merge';

describe('mergeData', () => {
  it('applique les valeurs du patch et conserve les autres clés', () => {
    const result = mergeData(
      { client: 'ARCADIA', statut: 'NEW' },
      { statut: 'A SUIVRE' },
    );
    expect(result).toEqual({ client: 'ARCADIA', statut: 'A SUIVRE' });
  });

  it('efface la clé quand la valeur du patch est null', () => {
    const result = mergeData({ client: 'ARCADIA', heure: '14H' }, { heure: null });
    expect(result).toEqual({ client: 'ARCADIA' });
    expect('heure' in result).toBe(false);
  });

  it('accepte les valeurs numériques', () => {
    expect(mergeData({}, { num_chrono: 78 })).toEqual({ num_chrono: 78 });
  });

  it('ne mute pas l objet source', () => {
    const current = { client: 'ARCADIA' };
    mergeData(current, { client: 'AUTRE', statut: 'NEW' });
    expect(current).toEqual({ client: 'ARCADIA' });
  });

  it('fusionne deux patchs concurrents portant sur des clés différentes', () => {
    const apresA = mergeData({}, { client: 'ARCADIA' });
    const apresB = mergeData(apresA, { statut: 'NEW' });
    expect(apresB).toEqual({ client: 'ARCADIA', statut: 'NEW' });
  });
});

describe('mergeFormats', () => {
  it('ajoute et remplace un format clé par clé', () => {
    const result = mergeFormats(
      { impe: { bg: '#FFFF00' } },
      { num_chrono: { bg: '#FF0000' } },
    );
    expect(result).toEqual({
      impe: { bg: '#FFFF00' },
      num_chrono: { bg: '#FF0000' },
    });
  });

  it('remplace entièrement le format d une clé existante', () => {
    expect(mergeFormats({ impe: { bg: '#FFFF00' } }, { impe: { bg: '#FF0000' } })).toEqual({
      impe: { bg: '#FF0000' },
    });
  });

  it('retire le format quand la valeur du patch est null', () => {
    const result = mergeFormats({ impe: { bg: '#FFFF00' }, client: { bg: '#FF0000' } }, { impe: null });
    expect(result).toEqual({ client: { bg: '#FF0000' } });
  });

  it('ne mute pas l objet source', () => {
    const current = { impe: { bg: '#FFFF00' } };
    mergeFormats(current, { impe: null });
    expect(current).toEqual({ impe: { bg: '#FFFF00' } });
  });
});

describe('changedKeysOf', () => {
  it('retourne les clés du patch puis celles des formats, sans doublon', () => {
    expect(
      changedKeysOf({ client: 'ARCADIA', statut: null }, { statut: null, impe: { bg: '#FF0000' } }),
    ).toEqual(['client', 'statut', 'impe']);
  });

  it('retourne un tableau vide sans patch ni formats', () => {
    expect(changedKeysOf({}, {})).toEqual([]);
  });
});

describe('buildDiff', () => {
  it('décrit from/to pour chaque clé du patch', () => {
    expect(buildDiff({ client: 'ARCADIA' }, { client: 'AUTRE' })).toEqual({
      client: { from: 'ARCADIA', to: 'AUTRE' },
    });
  });

  it('utilise null comme valeur de départ quand la clé était absente', () => {
    expect(buildDiff({}, { statut: 'NEW' })).toEqual({ statut: { from: null, to: 'NEW' } });
  });

  it('décrit un effacement comme to: null', () => {
    expect(buildDiff({ heure: '14H' }, { heure: null })).toEqual({
      heure: { from: '14H', to: null },
    });
  });
});

describe('changedKeysOfPayload', () => {
  it('extrait changedKeys d un payload d événement update', () => {
    expect(changedKeysOfPayload({ version: 3, changedKeys: ['client', 'statut'] })).toEqual([
      'client',
      'statut',
    ]);
  });

  it('tolère un payload sans changedKeys, null ou non objet', () => {
    expect(changedKeysOfPayload({ version: 3 })).toEqual([]);
    expect(changedKeysOfPayload(null)).toEqual([]);
    expect(changedKeysOfPayload('texte')).toEqual([]);
  });

  it('ignore les entrées non textuelles de changedKeys', () => {
    expect(changedKeysOfPayload({ changedKeys: ['client', 42, null] })).toEqual(['client']);
  });
});

describe('versionOfPayload', () => {
  it('retourne la version quand elle est numérique', () => {
    expect(versionOfPayload({ version: 4 })).toBe(4);
  });

  it('retourne null quand la version est absente ou non numérique', () => {
    expect(versionOfPayload({})).toBeNull();
    expect(versionOfPayload(null)).toBeNull();
    expect(versionOfPayload({ version: 'quatre' })).toBeNull();
  });
});

describe('conflictKeys', () => {
  it('retourne un tableau vide quand les clés modifiées sont disjointes du patch', () => {
    const events = [{ payload: { version: 1, changedKeys: ['statut'] } }];
    expect(conflictKeys(events, ['client'])).toEqual([]);
  });

  it('retourne les clés communes quand la même clé a été modifiée entre-temps', () => {
    const events = [{ payload: { version: 1, changedKeys: ['client', 'statut'] } }];
    expect(conflictKeys(events, ['client'])).toEqual(['client']);
  });

  it('agrège les clés de plusieurs événements et préserve l ordre du patch', () => {
    const events = [
      { payload: { version: 2, changedKeys: ['statut'] } },
      { payload: { version: 1, changedKeys: ['client'] } },
    ];
    expect(conflictKeys(events, ['client', 'heure', 'statut'])).toEqual(['client', 'statut']);
  });

  it('retourne un tableau vide sans aucun événement postérieur', () => {
    expect(conflictKeys([], ['client'])).toEqual([]);
  });
});
