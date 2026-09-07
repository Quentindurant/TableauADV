import { describe, expect, it } from 'vitest';
import { AG_GRID_LOCALE_FR } from './localeFr';

/**
 * Clés effectivement rencontrées par les ADV : filtre texte des colonnes
 * libres, filtre par plage de dates (IMPE, DATE) et sélecteur de mois. Une
 * clé oubliée retomberait silencieusement sur l'anglais.
 */
const CLES_ATTENDUES = [
  'applyFilter',
  'clearFilter',
  'resetFilter',
  'cancelFilter',
  'textFilter',
  'dateFilter',
  'filterOoo',
  'empty',
  'equals',
  'notEqual',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'blank',
  'notBlank',
  'before',
  'after',
  'inRange',
  'inRangeStart',
  'inRangeEnd',
  'andCondition',
  'orCondition',
  'dateFormatOoo',
  'january',
  'december',
];

describe('AG_GRID_LOCALE_FR', () => {
  it('traduit toutes les clés visibles par les ADV', () => {
    for (const cle of CLES_ATTENDUES) {
      expect(AG_GRID_LOCALE_FR[cle], `clé manquante : ${cle}`).toBeTruthy();
    }
  });

  it('emploie le vocabulaire des ADV et le format de date français', () => {
    expect(AG_GRID_LOCALE_FR.contains).toBe('Contient');
    expect(AG_GRID_LOCALE_FR.inRange).toBe('Entre');
    expect(AG_GRID_LOCALE_FR.inRangeStart).toBe('Du');
    expect(AG_GRID_LOCALE_FR.inRangeEnd).toBe('Au');
    expect(AG_GRID_LOCALE_FR.blank).toBe('Vide');
    expect(AG_GRID_LOCALE_FR.dateFormatOoo).toBe('jj/mm/aaaa');
  });

  it('ne laisse aucune valeur vide ni reliquat anglais courant', () => {
    for (const [cle, valeur] of Object.entries(AG_GRID_LOCALE_FR)) {
      expect(valeur.length, `valeur vide : ${cle}`).toBeGreaterThan(0);
      expect(['Apply', 'Clear', 'Contains', 'Between', 'Blank']).not.toContain(valeur);
    }
  });
});
