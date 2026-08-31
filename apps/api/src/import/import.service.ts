import { readFile } from 'node:fs/promises';
import { Prisma, PrismaClient } from '@prisma/client';
import { Workbook, type Cell, type FillPattern, type Worksheet } from 'exceljs';
import { allowedValues, CHOICES_BY_COLUMN, COLUMNS, SELECT_KEYS } from './colors';
import { buildHeaderMap, COLUMN_KEYS_IN_ORDER, type HeaderMapping } from './header-mapping';
import { sheetNameToMonth } from './month-mapping';
import { ISO_DATE, normalizeCellValue } from './normalize';
import { repairZohoXlsx } from './repair-zoho';

/** Nom de la feuille d'archives, comparé après `trim()` (le classeur a un espace final). */
export const ARCHIVES_SHEET_NAME = 'ARCHIVES OK';
/** Mois de rattachement d'une ligne d'archives sans date exploitable. */
export const ARCHIVES_FALLBACK_MONTH = '2025-03';
/** Feuille dont les largeurs de colonnes servent de référence. */
export const WIDTH_REFERENCE_SHEET = 'AOUT 2026';
/** Largeur px appliquée quand le fichier n'en fournit aucune. */
export const DEFAULT_COLUMN_WIDTH = 150;

const PIXELS_PAR_CARACTERE = 7;
const MAX_COLONNES = 40;
const MAX_LIGNES = 20000;
const LOT_INSERTION = 500;

/**
 * Purge + création des colonnes/choix + insertion de toutes les lignes
 * peuvent porter sur des dizaines de feuilles et jusqu'à MAX_LIGNES lignes
 * par feuille : le timeout interactif par défaut de Prisma (5 s) est
 * insuffisant, on l'élargit explicitement.
 */
const IMPORT_TRANSACTION_TIMEOUT_MS = 120_000;
const IMPORT_TRANSACTION_MAX_WAIT_MS = 10_000;

// Fonds Zoho reconnus → teintes douces du surligneur (rouge, jaune, orange).
const SURLIGNAGES: Readonly<Record<string, string>> = {
  FF0000: '#EE7A6D',
  FFFF00: '#F7DC6F',
  FFC000: '#F5B041',
};

export interface SheetReport {
  sheet: string;
  month: string | null;
  archived: boolean;
  imported: number;
  ignored: number;
  anomalies: string[];
}

export interface ImportReport {
  file: string;
  columns: number;
  choices: number;
  rows: number;
  sheets: SheetReport[];
}

interface BuiltRow {
  month: string;
  position: number;
  data: Record<string, string>;
  formats: Record<string, { bg: string }>;
  archived: boolean;
}

// ---------------------------------------------------------------- lecture

/** Exporté pour l'import fusion (fusion.service.ts) qui lit les mêmes feuilles. */
export function headersOf(worksheet: Worksheet): (string | null)[] {
  const ligneEntete = worksheet.getRow(1);
  const largeur = Math.min(
    MAX_COLONNES,
    Math.max(worksheet.actualColumnCount, ligneEntete.cellCount, COLUMN_KEYS_IN_ORDER.length),
  );
  const entetes: (string | null)[] = [];
  for (let index = 1; index <= largeur; index++) {
    entetes.push(normalizeCellValue(ligneEntete.getCell(index).value));
  }
  return entetes;
}

function highlightOf(cell: Cell): string | null {
  const remplissage = cell.fill as FillPattern | undefined;
  if (
    remplissage === undefined ||
    remplissage.type !== 'pattern' ||
    remplissage.pattern !== 'solid'
  ) {
    return null;
  }
  const argb = remplissage.fgColor?.argb;
  if (typeof argb !== 'string') {
    return null;
  }
  const hex = (argb.length === 8 ? argb.slice(2) : argb).toUpperCase();
  return SURLIGNAGES[hex] ?? null;
}

function widthOf(worksheet: Worksheet, index: number): number {
  const largeur = worksheet.getColumn(index + 1).width;
  if (typeof largeur !== 'number' || !Number.isFinite(largeur) || largeur <= 0) {
    return DEFAULT_COLUMN_WIDTH;
  }
  return Math.round(largeur * PIXELS_PAR_CARACTERE);
}

function computeWidths(reference: Worksheet | undefined): Record<string, number> {
  const largeurs: Record<string, number> = {};
  for (const colonne of COLUMNS) {
    largeurs[colonne.key] = DEFAULT_COLUMN_WIDTH;
  }
  if (reference === undefined) {
    return largeurs;
  }
  const mapping = buildHeaderMap(headersOf(reference));
  mapping.keyByIndex.forEach((cle, index) => {
    if (cle !== null) {
      largeurs[cle] = widthOf(reference, index);
    }
  });
  return largeurs;
}

// ---------------------------------------------------------------- écriture

/**
 * `tx` est le client transactionnel fourni par `prisma.$transaction(...)` dans
 * `importWorkbook` : purge, création des colonnes/choix et insertion des
 * lignes s'exécutent dans UNE seule transaction, commitée ou annulée en bloc
 * (même pattern que `RowEventsService.record`).
 */
async function purge(tx: Prisma.TransactionClient): Promise<void> {
  // Ordre imposé par les clés étrangères. `User` n'est jamais touché.
  await tx.rowEvent.deleteMany();
  await tx.row.deleteMany();
  await tx.choice.deleteMany();
  await tx.column.deleteMany();
}

async function createColumnsAndChoices(
  tx: Prisma.TransactionClient,
  largeurs: Record<string, number>,
): Promise<number> {
  let nbChoix = 0;
  for (const [position, colonne] of COLUMNS.entries()) {
    const creee = await tx.column.create({
      data: {
        key: colonne.key,
        label: colonne.label,
        type: colonne.type,
        position,
        width: largeurs[colonne.key] ?? DEFAULT_COLUMN_WIDTH,
      },
    });
    const choix = CHOICES_BY_COLUMN[colonne.key];
    if (choix !== undefined && choix.length > 0) {
      await tx.choice.createMany({
        data: choix.map((valeur, rang) => ({
          columnId: creee.id,
          label: valeur.label,
          bgColor: valeur.bgColor,
          textColor: valeur.textColor,
          bold: valeur.bold,
          position: rang,
        })),
      });
      nbChoix += choix.length;
    }
  }
  return nbChoix;
}

async function insertRows(tx: Prisma.TransactionClient, lignes: readonly BuiltRow[]): Promise<void> {
  for (let debut = 0; debut < lignes.length; debut += LOT_INSERTION) {
    const lot = lignes.slice(debut, debut + LOT_INSERTION);
    await tx.row.createMany({
      data: lot.map((ligne) => ({
        month: ligne.month,
        position: ligne.position,
        data: ligne.data as Prisma.InputJsonValue,
        formats: ligne.formats as Prisma.InputJsonValue,
        archived: ligne.archived,
        createdBy: null,
      })),
    });
  }
}

// ---------------------------------------------------------------- pilotage

export async function importWorkbook(
  prisma: PrismaClient,
  filePath: string,
): Promise<ImportReport> {
  const brut = await readFile(filePath);
  const repare = await repairZohoXlsx(brut);
  const workbook = new Workbook();
  // Deux @types/node coexistent dans l'arbre de dépendances (repairZohoXlsx vs
  // exceljs), rendant leurs types Buffer nominalement incompatibles malgré une
  // forme identique. `ArrayBuffer` est le dénominateur commun structurel des
  // deux définitions de Buffer en jeu ici, donc ce détour type-checke sans
  // recourir à `any`.
  await workbook.xlsx.load(repare as unknown as ArrayBuffer);

  const reference = workbook.worksheets.find(
    (feuille) => feuille.name.trim() === WIDTH_REFERENCE_SHEET,
  );

  const rapports: SheetReport[] = [];
  let total = 0;
  let nbChoix = 0;

  // Remplacement intégral en une seule transaction : purge, colonnes/choix
  // et lignes de toutes les feuilles sont commités ensemble ou pas du tout.
  // Un échec en cours de route (colonne, choix ou lot de lignes) ne doit
  // jamais laisser la base dans un état partiellement purgé/reconstruit.
  await prisma.$transaction(
    async (tx) => {
      await purge(tx);
      nbChoix = await createColumnsAndChoices(tx, computeWidths(reference));

      for (const worksheet of workbook.worksheets) {
        const nom = worksheet.name;
        const mois = sheetNameToMonth(nom);
        const estArchive = nom.trim() === ARCHIVES_SHEET_NAME;
        if (mois === null && !estArchive) {
          continue;
        }
        const rapport = await importSheet(tx, worksheet, mois, estArchive);
        rapports.push(rapport);
        total += rapport.imported;
      }
    },
    { timeout: IMPORT_TRANSACTION_TIMEOUT_MS, maxWait: IMPORT_TRANSACTION_MAX_WAIT_MS },
  );

  return {
    file: filePath,
    columns: COLUMNS.length,
    choices: nbChoix,
    rows: total,
    sheets: rapports,
  };
}

export interface CellsOutcome {
  data: Record<string, string>;
  formats: Record<string, { bg: string }>;
  firstIsoDate: string | null;
  offListValues: { key: string; value: string }[];
  overflowIndices: number[];
  empty: boolean;
}

/** Exporté pour l'import fusion (fusion.service.ts) qui lit les mêmes feuilles. */
export function readRowCells(
  worksheet: Worksheet,
  rowNumber: number,
  mapping: HeaderMapping,
): CellsOutcome {
  const ligne = worksheet.getRow(rowNumber);
  const data: Record<string, string> = {};
  const formats: Record<string, { bg: string }> = {};
  const overflowIndices: number[] = [];
  const overflowTextes: string[] = [];
  let firstIsoDate: string | null = null;
  let nbValeurs = 0;

  for (let index = 0; index < mapping.keyByIndex.length; index++) {
    const cellule = ligne.getCell(index + 1);
    const valeur = normalizeCellValue(cellule.value);
    if (valeur === null) {
      continue;
    }
    nbValeurs++;
    if (firstIsoDate === null && ISO_DATE.test(valeur)) {
      firstIsoDate = valeur;
    }

    const cle = mapping.keyByIndex[index];
    if (cle === null) {
      overflowIndices.push(index);
      overflowTextes.push(`${mapping.labelByIndex[index]}: ${valeur}`);
      continue;
    }

    data[cle] = valeur;
    const surlignage = highlightOf(cellule);
    if (surlignage !== null) {
      formats[cle] = { bg: surlignage };
    }
  }

  if (overflowTextes.length > 0) {
    const existant = data['commentaires_planif'];
    const deverse = overflowTextes.join(' | ');
    data['commentaires_planif'] = existant === undefined ? deverse : `${existant} | ${deverse}`;
  }

  const offListValues: { key: string; value: string }[] = [];
  for (const key of SELECT_KEYS) {
    const valeur = data[key];
    if (valeur !== undefined && !allowedValues(key).has(valeur)) {
      offListValues.push({ key, value: valeur });
    }
  }

  return {
    data,
    formats,
    firstIsoDate,
    offListValues,
    overflowIndices,
    empty: nbValeurs === 0,
  };
}

function monthOfRow(cells: CellsOutcome): string {
  const candidats = [cells.data['date'], cells.data['impe'], cells.firstIsoDate];
  for (const candidat of candidats) {
    if (typeof candidat === 'string' && ISO_DATE.test(candidat)) {
      return candidat.slice(0, 7);
    }
  }
  return ARCHIVES_FALLBACK_MONTH;
}

async function importSheet(
  tx: Prisma.TransactionClient,
  worksheet: Worksheet,
  month: string | null,
  archived: boolean,
): Promise<SheetReport> {
  const mapping = buildHeaderMap(headersOf(worksheet));
  const lignes: BuiltRow[] = [];
  const horsListe = new Map<string, number>();
  const nonMappees = new Set<number>();
  let ignorees = 0;

  const derniereLigne = Math.min(worksheet.rowCount, MAX_LIGNES);
  for (let numero = 2; numero <= derniereLigne; numero++) {
    const cells = readRowCells(worksheet, numero, mapping);
    if (cells.empty) {
      ignorees++;
      continue;
    }

    for (const index of cells.overflowIndices) {
      nonMappees.add(index);
    }
    for (const hors of cells.offListValues) {
      const cle = `${hors.key} ${hors.value}`;
      horsListe.set(cle, (horsListe.get(cle) ?? 0) + 1);
    }

    lignes.push({
      month: month ?? monthOfRow(cells),
      position: lignes.length,
      data: cells.data,
      formats: cells.formats,
      archived,
    });
  }

  await insertRows(tx, lignes);

  const anomalies: string[] = [];
  if (nonMappees.size > 0) {
    const libelles = [...nonMappees]
      .sort((a, b) => a - b)
      .map((index) => mapping.labelByIndex[index]);
    anomalies.push(
      `colonnes hors périmètre reportées dans commentaires_planif : ${libelles.join(', ')}`,
    );
  }
  for (const [cle, occurrences] of horsListe) {
    const separateur = cle.indexOf(' ');
    const colonne = cle.slice(0, separateur);
    const valeur = cle.slice(separateur + 1);
    anomalies.push(
      `valeur « ${valeur} » hors liste pour la colonne ${colonne} (${occurrences} ligne(s)) — importée telle quelle`,
    );
  }

  return {
    sheet: worksheet.name,
    month,
    archived,
    imported: lignes.length,
    ignored: ignorees,
    anomalies,
  };
}

// ---------------------------------------------------------------- rapport

/** Rapport texte affiché en fin d'import par le script CLI. */
export function formatReport(report: ImportReport): string {
  const lignes: string[] = [];
  lignes.push(`Import terminé — fichier : ${report.file}`);
  lignes.push(
    `Colonnes créées : ${report.columns} — choix créés : ${report.choices} — lignes créées : ${report.rows}`,
  );
  lignes.push('');
  lignes.push('Feuille                     | Mois     | Importées | Ignorées | Anomalies');
  lignes.push('----------------------------+----------+-----------+----------+----------');

  for (const feuille of report.sheets) {
    const nom = feuille.sheet.padEnd(27).slice(0, 27);
    const mois = (feuille.archived ? 'archives' : (feuille.month ?? '-')).padEnd(8);
    const importees = String(feuille.imported).padStart(9);
    const ignorees = String(feuille.ignored).padStart(8);
    const anomalies = String(feuille.anomalies.length).padStart(9);
    lignes.push(`${nom} | ${mois} | ${importees} | ${ignorees} | ${anomalies}`);
  }

  const avecAnomalies = report.sheets.filter((feuille) => feuille.anomalies.length > 0);
  if (avecAnomalies.length > 0) {
    lignes.push('');
    lignes.push('Anomalies détaillées :');
    for (const feuille of avecAnomalies) {
      lignes.push(`  [${feuille.sheet}]`);
      for (const anomalie of feuille.anomalies) {
        lignes.push(`    - ${anomalie}`);
      }
    }
  }

  return lignes.join('\n');
}
