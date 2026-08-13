import { COLUMNS } from './colors';

/** Les 16 clés de colonne, ordre A..P de la spec §2.1. */
export const COLUMN_KEYS_IN_ORDER: readonly string[] = COLUMNS.map((column) => column.key);

/**
 * Alias d'en-têtes relevés dans les 18 feuilles mensuelles du classeur,
 * exprimés sous forme normalisée (majuscules, sans accents ni ponctuation).
 */
const ALIAS: Readonly<Record<string, string>> = {
  IMPE: 'impe',
  IMPER: 'impe',
  'IMPERATIF ACTION': 'impe',
  'DATE CDE': 'impe',
  'DATES IMPERATIFS': 'impe',
  CLIENT: 'client',
  CLIENTS: 'client',
  DPT: 'dpt',
  'CP CLIENT': 'cp_client',
  PARTE: 'partenaire',
  PARTENAIRE: 'partenaire',
  DATE: 'date',
  DATES: 'date',
  'PORTA ET COMMENTAIRES IMPORTANT': 'porta_commentaires',
  'PORTA PREVUE LE': 'porta_commentaires',
  HEURE: 'heure',
  TECH: 'tech',
  'NOM TECH': 'nom_tech',
  'NOM CP': 'nom_cp',
  STATUT: 'statut',
  INSTALLATION: 'statut',
  'COMMENTAIRES PLANIF': 'commentaires_planif',
  'MATERIEL RECU': 'materiel_recu',
  'N CHRONO': 'num_chrono',
  'NO CHRONO': 'num_chrono',
  'NUM CHRONO': 'num_chrono',
  'INFOS FACTURATION': 'infos_facturation',
  'INFOS FACTURATION POUR LUCIE': 'infos_facturation',
};

/** Majuscules, sans accents, ponctuation remplacée par des espaces compactés. */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clé de colonne correspondant à un en-tête Excel, ou `null` si inconnu. */
export function headerToKey(header: string): string | null {
  return ALIAS[normalizeHeader(header)] ?? null;
}

/** Index 0-based vers lettre de colonne Excel (0 → A, 26 → AA). */
export function columnLetter(index: number): string {
  let reste = index + 1;
  let lettres = '';
  while (reste > 0) {
    const modulo = (reste - 1) % 26;
    lettres = String.fromCharCode(65 + modulo) + lettres;
    reste = Math.floor((reste - 1) / 26);
  }
  return lettres;
}

export interface HeaderMapping {
  /** Clé de colonne par index de colonne Excel (0 = A) ; `null` si non mappée. */
  keyByIndex: (string | null)[];
  /** Libellé lisible par index : en-tête trimé, ou `COLONNE <lettre>` si vide. */
  labelByIndex: string[];
  /** Indices non mappés (valeurs déversées dans `commentaires_planif`). */
  unmapped: number[];
}

/**
 * Construit la table de correspondance d'une feuille à partir de sa ligne
 * d'en-tête réelle. Première occurrence gagnante : un second en-tête visant
 * une clé déjà prise reste non mappé.
 */
export function buildHeaderMap(headers: readonly (string | null)[]): HeaderMapping {
  const keyByIndex: (string | null)[] = [];
  const labelByIndex: string[] = [];
  const unmapped: number[] = [];
  const dejaPrises = new Set<string>();

  headers.forEach((header, index) => {
    const brut = (header ?? '').trim();
    labelByIndex.push(brut === '' ? `COLONNE ${columnLetter(index)}` : brut);

    const cle = brut === '' ? null : headerToKey(brut);
    if (cle === null || dejaPrises.has(cle)) {
      keyByIndex.push(null);
      unmapped.push(index);
      return;
    }
    dejaPrises.add(cle);
    keyByIndex.push(cle);
  });

  return { keyByIndex, labelByIndex, unmapped };
}
