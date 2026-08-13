import { MOIS_FRANCAIS, sheetNameToMonth } from './month-mapping';

describe('MOIS_FRANCAIS', () => {
  it('couvre les 12 mois français sans accents', () => {
    expect(Object.keys(MOIS_FRANCAIS)).toEqual([
      'JANVIER',
      'FEVRIER',
      'MARS',
      'AVRIL',
      'MAI',
      'JUIN',
      'JUILLET',
      'AOUT',
      'SEPTEMBRE',
      'OCTOBRE',
      'NOVEMBRE',
      'DECEMBRE',
    ]);
    expect(Object.values(MOIS_FRANCAIS)).toEqual([
      '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
    ]);
  });
});

describe('sheetNameToMonth', () => {
  it('mappe les 18 feuilles mensuelles réelles du classeur', () => {
    expect(sheetNameToMonth('MARS 2025')).toBe('2025-03');
    expect(sheetNameToMonth('AVRIL 2025')).toBe('2025-04');
    expect(sheetNameToMonth('MAI 2025')).toBe('2025-05');
    expect(sheetNameToMonth('JUIN 2025')).toBe('2025-06');
    expect(sheetNameToMonth('JUILLET 2025')).toBe('2025-07');
    expect(sheetNameToMonth('AOUT 2025')).toBe('2025-08');
    expect(sheetNameToMonth('SEPTEMBRE 2025')).toBe('2025-09');
    expect(sheetNameToMonth('OCTOBRE 2025')).toBe('2025-10');
    expect(sheetNameToMonth('NOVEMBRE 2025')).toBe('2025-11');
    expect(sheetNameToMonth('DECEMBRE 2025')).toBe('2025-12');
    expect(sheetNameToMonth('JANVIER 26')).toBe('2026-01');
    expect(sheetNameToMonth('FEVRIER 26')).toBe('2026-02');
    expect(sheetNameToMonth('MARS 26')).toBe('2026-03');
    expect(sheetNameToMonth('AVRIL 26')).toBe('2026-04');
    expect(sheetNameToMonth('MAI 26')).toBe('2026-05');
    expect(sheetNameToMonth('JUIN 26')).toBe('2026-06');
    expect(sheetNameToMonth('JUILLET 2026')).toBe('2026-07');
    expect(sheetNameToMonth('AOUT 2026')).toBe('2026-08');
  });

  it('tolère la casse, les espaces multiples, les espaces de bord et les accents', () => {
    expect(sheetNameToMonth('  aout   2026 ')).toBe('2026-08');
    expect(sheetNameToMonth('Août 2026')).toBe('2026-08');
    expect(sheetNameToMonth('DÉCEMBRE 2025')).toBe('2025-12');
    expect(sheetNameToMonth('mars 25')).toBe('2025-03');
  });

  it('renvoie null pour les feuilles non mensuelles du classeur', () => {
    expect(sheetNameToMonth('TEST')).toBeNull();
    expect(sheetNameToMonth('Feuille1')).toBeNull();
    expect(sheetNameToMonth('ARCHIVES OK ')).toBeNull();
    expect(sheetNameToMonth('ARCHIVES OK')).toBeNull();
  });

  it('renvoie null pour les libellés mal formés', () => {
    expect(sheetNameToMonth('')).toBeNull();
    expect(sheetNameToMonth('MARS')).toBeNull();
    expect(sheetNameToMonth('2025')).toBeNull();
    expect(sheetNameToMonth('MARSS 2025')).toBeNull();
    expect(sheetNameToMonth('MARS 202')).toBeNull();
    expect(sheetNameToMonth('MARS 2025 BIS')).toBeNull();
  });
});
