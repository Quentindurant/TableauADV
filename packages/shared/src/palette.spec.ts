import { PASTEL_PALETTE, pastelFor } from './palette';

const PARTENAIRES_SANS_COULEUR_EXCEL = [
  'CUBE', 'ESPACE BUREAUTIQUE', 'IT ADEPT', '2A Consulting', 'ALLIPCOM',
  'BUREAUTIK SERVICES', 'MABUROTIC', 'CG CONEKT', 'LEA NUMERIQUE', 'COM2S',
  'DBTELECOM', 'ECS', 'GOOD MORNING OFFICE', 'GROUPE TCV', 'KOTEL',
  'I PLANETHI', 'DJEFFREY', 'LDS SOLUTIONS', 'MIKADO SOLUTIONS', 'MY OBS',
  'ODH SOLUTIONS', 'OMNITEL', 'PRO FIBRE', 'RESEAU LINE', 'SNS SOLUTIONS',
  'SQUARTIS', 'TELPRO', 'ODS', 'TOPLINIE', 'UNITED TELECOM', 'YOWIGO',
  'VD COM', 'REVOLY', 'FR TELECOM', 'HOIST GROUP',
];

describe('PASTEL_PALETTE', () => {
  it('contient 24 paires bg/text hexadécimales, fonds tous distincts', () => {
    expect(PASTEL_PALETTE).toHaveLength(24);
    expect(new Set(PASTEL_PALETTE.map((p) => p.bg)).size).toBe(24);
    for (const { bg, text } of PASTEL_PALETTE) {
      expect(bg).toMatch(/^#[0-9A-F]{6}$/);
      expect(text).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe('pastelFor', () => {
  it('est déterministe, insensible à la casse et aux espaces parasites', () => {
    expect(pastelFor('CUBE')).toEqual(pastelFor('  cube  '));
    expect(pastelFor('CUBE')).toEqual({ bg: '#D1F2EB', text: '#0B5345' });
    expect(pastelFor('ALLIPCOM')).toEqual({ bg: '#FFE0B2', text: '#BF360C' });
    expect(pastelFor('2A Consulting')).toEqual({ bg: '#B3E5FC', text: '#01579B' });
  });

  it('retourne toujours une entrée de la palette', () => {
    for (const label of PARTENAIRES_SANS_COULEUR_EXCEL) {
      expect(PASTEL_PALETTE).toContainEqual(pastelFor(label));
    }
  });

  it('distribue correctement : les 35 partenaires reçoivent au moins 15 couleurs distinctes', () => {
    const distinct = new Set(
      PARTENAIRES_SANS_COULEUR_EXCEL.map((label) => pastelFor(label).bg),
    );
    expect(distinct.size).toBeGreaterThanOrEqual(15);
  });

  it('couvre les 24 entrées de la palette sur un large échantillon', () => {
    const buckets = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      buckets.add(pastelFor(`LABEL-${i}`).bg);
    }
    expect(buckets.size).toBe(24);
  });
});
