import { Workbook, type Worksheet } from 'exceljs';

const ENTETE_2026 = [
  'IMPE',
  'CLIENT',
  'DPT',
  'CP CLIENT',
  'PARTE',
  'DATE',
  'PORTA ET COMMENTAIRES IMPORTANT',
  'HEURE',
  'TECH',
  'NOM TECH',
  'NOM CP',
  'INSTALLATION',
  'COMMENTAIRES PLANIF',
  'MATERIEL RECU',
  'N° CHRONO',
  'INFOS FACTURATION',
];

const LARGEURS_2026 = [10, 30, 5, 9, 15, 10, 40, 7, 13, 13, 10, 15, 20, 9, 17, 9];

function remplir(feuille: Worksheet, entetes: string[], largeurs?: number[]): void {
  feuille.columns = entetes.map((header, index) => ({
    header,
    width: largeurs === undefined ? undefined : largeurs[index],
  }));
}

function surligner(feuille: Worksheet, ligne: number, colonne: number, argb: string): void {
  feuille.getRow(ligne).getCell(colonne).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb },
  };
}

/**
 * Classeur synthétique reproduisant les particularités du classeur Zoho :
 * feuille moderne (A..P), feuille historique à en-têtes décalés, feuille
 * ignorée, feuille d'archives sans en-tête exploitable.
 */
export async function buildTestWorkbookBuffer(): Promise<Buffer> {
  const workbook = new Workbook();

  // --- AOUT 2026 : feuille de référence des largeurs, en-tête A..P ---
  const aout = workbook.addWorksheet('AOUT 2026');
  remplir(aout, ENTETE_2026, LARGEURS_2026);
  aout.addRow([
    new Date(Date.UTC(2026, 7, 3)),
    'ARCADIA',
    '49',
    '49000',
    'EVERLINK',
    new Date(Date.UTC(2026, 7, 14)),
    'porta ok',
    '14h',
    'DIRECT',
    'Amar',
    'QUENTIN',
    'ATT CLIENT  ',
    'RAS',
    'ENVOYE',
    '78.0',
    'a facturer',
  ]);
  aout.addRow([
    null,
    'CABINET LATES',
    '2A',
    '20000',
    'PARTENAIRE INCONNU',
    null,
    null,
    '9H',
    'DIRECT',
    null,
    'PIERRE',
    'CLOTUREE',
    null,
    null,
    null,
    null,
  ]);
  aout.addRow([
    '   ',
    '',
    '  ',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  aout.addRow([
    null,
    'AEC AIR BEL',
    null,
    null,
    'OMNITEL',
    null,
    null,
    null,
    null,
    null,
    null,
    'INSTALLATION',
    null,
    null,
    'XA710513661FR',
    null,
  ]);
  surligner(aout, 5, 15, 'FFFF0000'); // N° CHRONO en rouge
  surligner(aout, 5, 1, 'FFFFFF00'); // IMPE en jaune

  // --- MARS 2025 : en-tête historique, 3 colonnes hors périmètre ---
  const mars = workbook.addWorksheet('MARS 2025');
  remplir(mars, [
    'DATE CDE ',
    'CLIENT',
    'PARTENAIRE',
    'DATES ',
    'HEURE ',
    'TECH',
    'NOM TECH',
    'NOM CP ',
    'STATUT ',
    'COMMENTAIRES PLANIF ',
    'DERNIERE ADV',
    'MATERIEL RECU ',
    'N° CHRONO ',
    'SUIVI LIENS ',
    'CR ET PV ENVOYES ET CLASSES ',
  ]);
  mars.addRow([
    new Date(Date.UTC(2025, 2, 4)),
    'MAIRIE DE X',
    'OR-TEL',
    new Date(Date.UTC(2025, 2, 18)),
    '10h',
    'ADWEB',
    'Chaabane',
    'MARCO',
    'CLOTUREE',
    'installe',
    'ADV du 12/03',
    'LIVRE',
    'XB123',
    'https://z.eu/1',
    'CLASSE',
  ]);

  // --- TEST : doit être ignorée ---
  const test = workbook.addWorksheet('TEST');
  remplir(test, ENTETE_2026);
  test.addRow([
    null,
    'NE DOIT PAS ETRE IMPORTE',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);

  // --- ARCHIVES OK  : ligne 1 quasi vide, données de A à I ---
  const archives = workbook.addWorksheet('ARCHIVES OK ');
  archives.getRow(1).getCell(3).value = 'PARTENAIRE';
  archives.addRow([
    new Date(Date.UTC(2025, 1, 14)),
    'CABINET DENTAIRE',
    'ENTREPRISE PRO ',
    new Date(Date.UTC(2025, 2, 6)),
    '14h',
    'DIRECT',
    'Amar',
    'PIERRE',
    'CLOTUREE',
  ]);
  archives.addRow([null, 'AEC AIR BEL', 'OMNITEL', null, null, null, null, null, 'INSTALLATION']);

  const ecrit = await workbook.xlsx.writeBuffer();
  return Buffer.from(ecrit as ArrayBuffer);
}
