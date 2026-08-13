import JSZip from 'jszip';

/**
 * Opérateurs de format conditionnel écrits par Zoho Sheet et refusés par
 * la validation OOXML : exceljs lève sur ces valeurs à la lecture.
 */
export const ZOHO_OPERATORS: readonly string[] = [
  'last7Days',
  'lastMonth',
  'lastWeek',
  'today',
  'yesterday',
] as const;

const WORKSHEET_ENTRY = /^xl\/worksheets\/[^/]+\.xml$/;

/**
 * Réécrit un classeur .xlsx exporté par Zoho en remplaçant, dans chaque
 * feuille, les opérateurs non standard par `operator="equal"`.
 * Les autres entrées du zip (styles, chaînes partagées, relations) sont
 * recopiées telles quelles.
 */
export async function repairZohoXlsx(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const motif = new RegExp(`operator="(?:${ZOHO_OPERATORS.join('|')})"`, 'g');

  for (const entry of zip.file(WORKSHEET_ENTRY)) {
    const xml = await entry.async('string');
    const repare = xml.replace(motif, 'operator="equal"');
    if (repare !== xml) {
      zip.file(entry.name, repare);
    }
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
