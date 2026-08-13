import { formatReport, type ImportReport } from './import.service';

const RAPPORT: ImportReport = {
  file: '/tmp/classeur.xlsx',
  columns: 16,
  choices: 83,
  rows: 203,
  sheets: [
    {
      sheet: 'AOUT 2026',
      month: '2026-08',
      archived: false,
      imported: 200,
      ignored: 823,
      anomalies: ['valeur « PARTE INCONNU » hors liste pour la colonne partenaire (2 ligne(s)) — importée telle quelle'],
    },
    { sheet: 'MARS 2025', month: '2025-03', archived: false, imported: 1, ignored: 0, anomalies: [] },
    { sheet: 'ARCHIVES OK ', month: null, archived: true, imported: 2, ignored: 0, anomalies: [] },
  ],
};

describe('formatReport', () => {
  it('affiche les compteurs globaux', () => {
    const texte = formatReport(RAPPORT);
    expect(texte).toContain('Import terminé — fichier : /tmp/classeur.xlsx');
    expect(texte).toContain('Colonnes créées : 16');
    expect(texte).toContain('choix créés : 83');
    expect(texte).toContain('lignes créées : 203');
  });

  it('affiche une ligne par feuille avec importées / ignorées / anomalies', () => {
    const lignes = formatReport(RAPPORT).split('\n');
    expect(lignes.some((l) => l.includes('AOUT 2026') && l.includes('2026-08') && l.includes('200') && l.includes('823'))).toBe(true);
    expect(lignes.some((l) => l.includes('ARCHIVES OK') && l.includes('archives'))).toBe(true);
  });

  it('détaille les anomalies feuille par feuille', () => {
    const texte = formatReport(RAPPORT);
    expect(texte).toContain('Anomalies détaillées :');
    expect(texte).toContain('[AOUT 2026]');
    expect(texte).toContain('PARTE INCONNU');
  });

  it('omet la section des anomalies quand il n’y en a aucune', () => {
    const texte = formatReport({ ...RAPPORT, sheets: [RAPPORT.sheets[1]] });
    expect(texte).not.toContain('Anomalies détaillées :');
  });
});
