import JSZip from 'jszip';
import { repairZohoXlsx, ZOHO_OPERATORS } from './repair-zoho';

const FEUILLE_ZOHO = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet>
  <conditionalFormatting sqref="A1:A10">
    <cfRule type="timePeriod" operator="today" priority="1"/>
    <cfRule type="timePeriod" operator="yesterday" priority="2"/>
    <cfRule type="timePeriod" operator="lastWeek" priority="3"/>
    <cfRule type="timePeriod" operator="last7Days" priority="4"/>
    <cfRule type="timePeriod" operator="lastMonth" priority="5"/>
    <cfRule type="cellIs" operator="greaterThan" priority="6"/>
  </conditionalFormatting>
</worksheet>`;

const STYLES = '<styleSheet><x operator="today"/></styleSheet>';

async function zipDeTest(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('xl/worksheets/sheet1.xml', FEUILLE_ZOHO);
  zip.file('xl/worksheets/sheet2.xml', FEUILLE_ZOHO);
  zip.file('xl/styles.xml', STYLES);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function lire(buffer: Buffer, chemin: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file(chemin);
  if (entry === null) {
    throw new Error(`Entrée absente du zip : ${chemin}`);
  }
  return entry.async('string');
}

describe('repairZohoXlsx', () => {
  it('expose les 5 opérateurs non standard de Zoho', () => {
    expect([...ZOHO_OPERATORS].sort()).toEqual([
      'last7Days',
      'lastMonth',
      'lastWeek',
      'today',
      'yesterday',
    ]);
  });

  it('remplace tous les opérateurs Zoho par operator="equal" dans chaque feuille', async () => {
    const repare = await repairZohoXlsx(await zipDeTest());

    for (const chemin of ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
      const xml = await lire(repare, chemin);
      for (const operateur of ZOHO_OPERATORS) {
        expect(xml).not.toContain(`operator="${operateur}"`);
      }
      expect(xml.match(/operator="equal"/g)).toHaveLength(5);
    }
  });

  it('ne touche ni les opérateurs standard ni les fichiers hors xl/worksheets', async () => {
    const repare = await repairZohoXlsx(await zipDeTest());

    const feuille = await lire(repare, 'xl/worksheets/sheet1.xml');
    expect(feuille).toContain('operator="greaterThan"');

    const styles = await lire(repare, 'xl/styles.xml');
    expect(styles).toBe(STYLES);
  });

  it('rend un zip relisible et laisse un classeur sain inchangé dans son contenu', async () => {
    const zip = new JSZip();
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><cfRule operator="equal"/></worksheet>');
    const sain = await zip.generateAsync({ type: 'nodebuffer' });

    const repare = await repairZohoXlsx(sain);
    expect(await lire(repare, 'xl/worksheets/sheet1.xml')).toBe(
      '<worksheet><cfRule operator="equal"/></worksheet>',
    );
  });
});
