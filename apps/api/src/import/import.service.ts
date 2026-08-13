import { readFile } from 'node:fs/promises';
import { Prisma, PrismaClient } from '@prisma/client';
import { Workbook, type Worksheet } from 'exceljs';
import { CHOICES_BY_COLUMN, COLUMNS } from './colors';
import { buildHeaderMap, COLUMN_KEYS_IN_ORDER } from './header-mapping';
import { sheetNameToMonth } from './month-mapping';
import { normalizeCellValue } from './normalize';
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
const LOT_INSERTION = 500;

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

function headersOf(worksheet: Worksheet): (string | null)[] {
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

async function purge(prisma: PrismaClient): Promise<void> {
  // Ordre imposé par les clés étrangères. `User` n'est jamais touché.
  await prisma.rowEvent.deleteMany();
  await prisma.row.deleteMany();
  await prisma.choice.deleteMany();
  await prisma.column.deleteMany();
}

async function createColumnsAndChoices(
  prisma: PrismaClient,
  largeurs: Record<string, number>,
): Promise<number> {
  let nbChoix = 0;
  for (const [position, colonne] of COLUMNS.entries()) {
    const creee = await prisma.column.create({
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
      await prisma.choice.createMany({
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- utilisé à la Task 9.7
async function insertRows(prisma: PrismaClient, lignes: readonly BuiltRow[]): Promise<void> {
  for (let debut = 0; debut < lignes.length; debut += LOT_INSERTION) {
    const lot = lignes.slice(debut, debut + LOT_INSERTION);
    await prisma.row.createMany({
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
  // forme identique.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(repare as any);

  const reference = workbook.worksheets.find(
    (feuille) => feuille.name.trim() === WIDTH_REFERENCE_SHEET,
  );

  await purge(prisma);
  const nbChoix = await createColumnsAndChoices(prisma, computeWidths(reference));

  const rapports: SheetReport[] = [];
  let total = 0;

  for (const worksheet of workbook.worksheets) {
    const nom = worksheet.name;
    const mois = sheetNameToMonth(nom);
    const estArchive = nom.trim() === ARCHIVES_SHEET_NAME;
    if (mois === null && !estArchive) {
      continue;
    }
    const rapport = await importSheet(prisma, worksheet, mois, estArchive);
    rapports.push(rapport);
    total += rapport.imported;
  }

  return {
    file: filePath,
    columns: COLUMNS.length,
    choices: nbChoix,
    rows: total,
    sheets: rapports,
  };
}

// Lecture des lignes ajoutée à la Task 9.7 ; stub provisoire pour cette tâche.
async function importSheet(
  _prisma: PrismaClient,
  worksheet: Worksheet,
  month: string | null,
  archived: boolean,
): Promise<SheetReport> {
  return { sheet: worksheet.name, month, archived, imported: 0, ignored: 0, anomalies: [] };
}
