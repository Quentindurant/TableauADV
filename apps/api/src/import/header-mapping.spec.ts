import {
  buildHeaderMap,
  columnLetter,
  COLUMN_KEYS_IN_ORDER,
  headerToKey,
  normalizeHeader,
} from './header-mapping';

describe('normalizeHeader', () => {
  it('met en majuscules, retire accents et ponctuation, compacte les espaces', () => {
    expect(normalizeHeader('  Nom   Tech ')).toBe('NOM TECH');
    expect(normalizeHeader('N° CHRONO ')).toBe('N CHRONO');
    expect(normalizeHeader('MATÉRIEL REÇU')).toBe('MATERIEL RECU');
  });
});

describe('headerToKey', () => {
  it('reconnaît les en-têtes de la feuille de référence AOUT 2026', () => {
    expect(headerToKey('IMPE')).toBe('impe');
    expect(headerToKey('CLIENT')).toBe('client');
    expect(headerToKey('DPT')).toBe('dpt');
    expect(headerToKey('CP CLIENT')).toBe('cp_client');
    expect(headerToKey('PARTE')).toBe('partenaire');
    expect(headerToKey('DATE')).toBe('date');
    expect(headerToKey('PORTA ET COMMENTAIRES IMPORTANT')).toBe('porta_commentaires');
    expect(headerToKey('HEURE')).toBe('heure');
    expect(headerToKey('TECH')).toBe('tech');
    expect(headerToKey('NOM TECH')).toBe('nom_tech');
    expect(headerToKey('NOM CP')).toBe('nom_cp');
    expect(headerToKey('INSTALLATION')).toBe('statut');
    expect(headerToKey('COMMENTAIRES PLANIF')).toBe('commentaires_planif');
    expect(headerToKey('MATERIEL RECU')).toBe('materiel_recu');
    expect(headerToKey('N° CHRONO')).toBe('num_chrono');
    expect(headerToKey('INFOS FACTURATION')).toBe('infos_facturation');
  });

  it('reconnaît les variantes historiques des feuilles 2025', () => {
    expect(headerToKey('DATE CDE ')).toBe('impe');
    expect(headerToKey('IMPERATIF ACTION')).toBe('impe');
    expect(headerToKey('IMPER')).toBe('impe');
    expect(headerToKey('DATES IMPERATIFS')).toBe('impe');
    expect(headerToKey('CLIENTS')).toBe('client');
    expect(headerToKey('PARTENAIRE')).toBe('partenaire');
    expect(headerToKey('DATES ')).toBe('date');
    expect(headerToKey('PORTA PREVUE LE')).toBe('porta_commentaires');
    expect(headerToKey('STATUT ')).toBe('statut');
    expect(headerToKey('INFOS FACTURATION POUR LUCIE')).toBe('infos_facturation');
  });

  it('renvoie null pour les en-têtes hors périmètre', () => {
    expect(headerToKey('DERNIERE ADV')).toBeNull();
    expect(headerToKey('SUIVI LIENS')).toBeNull();
    expect(headerToKey('CR ET PV ENVOYES ET CLASSES')).toBeNull();
    expect(headerToKey('COLLECTE')).toBeNull();
    expect(headerToKey('MESSAGE')).toBeNull();
    expect(headerToKey('')).toBeNull();
  });
});

describe('columnLetter', () => {
  it('convertit un index 0-based en lettre de colonne Excel', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(14)).toBe('O');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
  });
});

describe('buildHeaderMap', () => {
  it('mappe la feuille AOUT 2026 sur les 16 clés dans l’ordre A..P', () => {
    const mapping = buildHeaderMap([
      'IMPE', 'CLIENT', 'DPT', 'CP CLIENT', 'PARTE', 'DATE',
      'PORTA ET COMMENTAIRES IMPORTANT', 'HEURE', 'TECH', 'NOM TECH', 'NOM CP',
      'INSTALLATION', 'COMMENTAIRES PLANIF', 'MATERIEL RECU', 'N° CHRONO',
      'INFOS FACTURATION',
    ]);
    expect(mapping.keyByIndex).toEqual([...COLUMN_KEYS_IN_ORDER]);
    expect(mapping.unmapped).toEqual([]);
  });

  it('mappe la feuille historique MARS 2025 et signale ses colonnes hors périmètre', () => {
    const mapping = buildHeaderMap([
      'DATE CDE ', 'CLIENT', 'PARTENAIRE', 'DATES ', 'HEURE ', 'TECH',
      'NOM TECH', 'NOM CP ', 'STATUT ', 'COMMENTAIRES PLANIF ', 'DERNIERE ADV',
      'MATERIEL RECU ', 'N° CHRONO ', 'SUIVI LIENS ',
      'CR ET PV ENVOYES ET CLASSES ',
    ]);
    expect(mapping.keyByIndex).toEqual([
      'impe', 'client', 'partenaire', 'date', 'heure', 'tech', 'nom_tech',
      'nom_cp', 'statut', 'commentaires_planif', null, 'materiel_recu',
      'num_chrono', null, null,
    ]);
    expect(mapping.unmapped).toEqual([10, 13, 14]);
    expect(mapping.labelByIndex[10]).toBe('DERNIERE ADV');
    expect(mapping.labelByIndex[14]).toBe('CR ET PV ENVOYES ET CLASSES');
  });

  it('ne mappe qu’une fois une clé : les doublons d’en-tête deviennent non mappés', () => {
    const mapping = buildHeaderMap(['IMPER', 'IMPER', 'IMPER', 'DATE']);
    expect(mapping.keyByIndex).toEqual(['impe', null, null, 'date']);
    expect(mapping.unmapped).toEqual([1, 2]);
  });

  it('nomme les colonnes sans en-tête par leur lettre Excel (feuille ARCHIVES OK)', () => {
    const mapping = buildHeaderMap([null, null, 'PARTENAIRE', null, null]);
    expect(mapping.keyByIndex).toEqual([null, null, 'partenaire', null, null]);
    expect(mapping.labelByIndex).toEqual([
      'COLONNE A', 'COLONNE B', 'PARTENAIRE', 'COLONNE D', 'COLONNE E',
    ]);
    expect(mapping.unmapped).toEqual([0, 1, 3, 4]);
  });
});
