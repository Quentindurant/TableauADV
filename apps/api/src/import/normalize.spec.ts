import { ISO_DATE, normalizeCellValue } from './normalize';

describe('normalizeCellValue', () => {
  it('rend null pour les valeurs vides', () => {
    expect(normalizeCellValue(null)).toBeNull();
    expect(normalizeCellValue(undefined)).toBeNull();
    expect(normalizeCellValue('')).toBeNull();
    expect(normalizeCellValue('    ')).toBeNull();
    expect(normalizeCellValue(' ')).toBeNull();
  });

  it('trime les espaces parasites, y compris les espaces insécables', () => {
    expect(normalizeCellValue('ATT CLIENT  ')).toBe('ATT CLIENT');
    expect(normalizeCellValue('  ENTREPRISE PRO ')).toBe('ENTREPRISE PRO');
    expect(normalizeCellValue(' MARS ')).toBe('MARS');
  });

  it('conserve les espaces internes et les retours à la ligne des commentaires', () => {
    expect(normalizeCellValue(' Durée 1h\nde 14h40 à 15h45 ')).toBe('Durée 1h\nde 14h40 à 15h45');
  });

  it('nettoie les flottants parasites « 78.0 » en « 78 »', () => {
    expect(normalizeCellValue('78.0')).toBe('78');
    expect(normalizeCellValue(' 0.0 ')).toBe('0');
    expect(normalizeCellValue('45702.0')).toBe('45702');
    expect(normalizeCellValue('78.00')).toBe('78.00');
    expect(normalizeCellValue('78.5')).toBe('78.5');
  });

  it('préserve les codes textuels (zéros initiaux, « 2A »)', () => {
    expect(normalizeCellValue('2A')).toBe('2A');
    expect(normalizeCellValue('04510')).toBe('04510');
    expect(normalizeCellValue('14h')).toBe('14h');
  });

  it('convertit les nombres en texte', () => {
    expect(normalizeCellValue(78)).toBe('78');
    expect(normalizeCellValue(78.5)).toBe('78.5');
    expect(normalizeCellValue(0)).toBe('0');
  });

  it('convertit les dates exceljs en YYYY-MM-DD (UTC)', () => {
    expect(normalizeCellValue(new Date(Date.UTC(2026, 7, 14)))).toBe('2026-08-14');
    expect(normalizeCellValue(new Date(Date.UTC(2025, 0, 1, 23, 59, 59)))).toBe('2025-01-01');
    expect(normalizeCellValue(new Date('date invalide'))).toBeNull();
  });

  it('aplatit les valeurs riches d’exceljs', () => {
    expect(normalizeCellValue({ richText: [{ text: 'ATT ' }, { text: 'PV' }] })).toBe('ATT PV');
    expect(
      normalizeCellValue({ text: 'https://zfrmz.eu/abc', hyperlink: 'https://zfrmz.eu/abc' }),
    ).toBe('https://zfrmz.eu/abc');
    expect(normalizeCellValue({ formula: 'A1*2', result: ' 12.0 ' })).toBe('12');
    expect(normalizeCellValue({ error: '#REF!' })).toBeNull();
  });

  it('convertit les booléens en texte français', () => {
    expect(normalizeCellValue(true)).toBe('VRAI');
    expect(normalizeCellValue(false)).toBe('FAUX');
  });
});

describe('ISO_DATE', () => {
  it('ne reconnaît que le format YYYY-MM-DD', () => {
    expect(ISO_DATE.test('2026-08-14')).toBe(true);
    expect(ISO_DATE.test('14/08/2026')).toBe(false);
    expect(ISO_DATE.test('2026-08')).toBe(false);
  });
});
