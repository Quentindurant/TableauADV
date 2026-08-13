/** Les 12 mois francais, ecrits sans accents (forme normalisee). */
export const MOIS_FRANCAIS: Readonly<Record<string, string>> = {
  JANVIER: '01',
  FEVRIER: '02',
  MARS: '03',
  AVRIL: '04',
  MAI: '05',
  JUIN: '06',
  JUILLET: '07',
  AOUT: '08',
  SEPTEMBRE: '09',
  OCTOBRE: '10',
  NOVEMBRE: '11',
  DECEMBRE: '12',
};

const NOM_FEUILLE = /^([A-Z]+) (\d{4}|\d{2})$/;

/**
 * Convertit un nom d'onglet du classeur Zoho en mois `YYYY-MM`.
 * Renvoie `null` si l'onglet n'est pas un onglet mensuel
 * (`TEST`, `Feuille1`, `ARCHIVES OK `, en-tetes libres...).
 */
export function sheetNameToMonth(name: string): string | null {
  const normalise = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

  const correspondance = NOM_FEUILLE.exec(normalise);
  if (correspondance === null) {
    return null;
  }

  const mois = MOIS_FRANCAIS[correspondance[1]];
  if (mois === undefined) {
    return null;
  }

  const anneeBrute = correspondance[2];
  const annee = anneeBrute.length === 4 ? anneeBrute : `20${anneeBrute}`;
  return `${annee}-${mois}`;
}
