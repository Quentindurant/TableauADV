import { slugify, uniqueKey } from './slugify';

describe('slugify', () => {
  it('met en minuscules', () => {
    expect(slugify('CLIENT')).toBe('client');
  });

  it('retire les accents', () => {
    expect(slugify('Matériel reçu')).toBe('materiel_recu');
    expect(slugify('Numéro dossier')).toBe('numero_dossier');
  });

  it('remplace les espaces par des underscores', () => {
    expect(slugify('CP CLIENT')).toBe('cp_client');
  });

  it('remplace toute suite de caractères spéciaux par un seul underscore', () => {
    expect(slugify('N° CHRONO')).toBe('n_chrono');
    expect(slugify('PORTA ET COMMENTAIRES  IMPORTANT')).toBe('porta_et_commentaires_important');
  });

  it('supprime les underscores de tête et de queue', () => {
    expect(slugify('  HEURE  ')).toBe('heure');
    expect(slugify('--- Infos ---')).toBe('infos');
  });

  it('renvoie une chaîne vide si le libellé ne contient aucun caractère alphanumérique', () => {
    expect(slugify('***')).toBe('');
  });
});

describe('uniqueKey', () => {
  it('renvoie la base telle quelle si elle est libre', () => {
    expect(uniqueKey('client', ['statut', 'tech'])).toBe('client');
  });

  it('suffixe _2 à la première collision', () => {
    expect(uniqueKey('client', ['client'])).toBe('client_2');
  });

  it('incrémente le suffixe tant que la clé est prise', () => {
    expect(uniqueKey('client', ['client', 'client_2'])).toBe('client_3');
    expect(uniqueKey('client', ['client', 'client_2', 'client_3'])).toBe('client_4');
  });

  it('se rabat sur "colonne" quand la base est vide', () => {
    expect(uniqueKey('', [])).toBe('colonne');
    expect(uniqueKey('', ['colonne'])).toBe('colonne_2');
  });
});
