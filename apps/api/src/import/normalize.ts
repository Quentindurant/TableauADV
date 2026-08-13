/** Format de date stocké dans `Row.data` pour les colonnes de type DATE. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const FLOTTANT_PARASITE = /^(\d+)\.0$/;
const ESPACE_INSECABLE = /\u00a0/g;

function versDateIso(valeur: Date): string | null {
  const millisecondes = valeur.getTime();
  if (Number.isNaN(millisecondes)) {
    return null;
  }
  const annee = String(valeur.getUTCFullYear()).padStart(4, '0');
  const mois = String(valeur.getUTCMonth() + 1).padStart(2, '0');
  const jour = String(valeur.getUTCDate()).padStart(2, '0');
  return `${annee}-${mois}-${jour}`;
}

function nettoyerTexte(brut: string): string | null {
  const trime = brut.replace(ESPACE_INSECABLE, ' ').trim();
  if (trime === '') {
    return null;
  }
  const flottant = FLOTTANT_PARASITE.exec(trime);
  return flottant === null ? trime : flottant[1];
}

/**
 * Normalise une valeur brute lue par exceljs vers la représentation stockée
 * dans `Row.data` : chaîne nettoyée, ou `null` si la cellule est vide.
 */
export function normalizeCellValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return versDateIso(value);
  }
  if (typeof value === 'string') {
    return nettoyerTexte(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? nettoyerTexte(String(value)) : null;
  }
  if (typeof value === 'boolean') {
    return value ? 'VRAI' : 'FAUX';
  }
  if (typeof value === 'object') {
    const riche = value as {
      error?: unknown;
      richText?: unknown;
      text?: unknown;
      result?: unknown;
      hyperlink?: unknown;
    };
    if (riche.error !== undefined) {
      return null;
    }
    if (Array.isArray(riche.richText)) {
      const morceaux = riche.richText
        .map((part) => String((part as { text?: unknown }).text ?? ''))
        .join('');
      return nettoyerTexte(morceaux);
    }
    if (riche.text !== undefined) {
      return normalizeCellValue(riche.text);
    }
    if (riche.result !== undefined) {
      return normalizeCellValue(riche.result);
    }
    if (typeof riche.hyperlink === 'string') {
      return nettoyerTexte(riche.hyperlink);
    }
    return null;
  }
  return nettoyerTexte(String(value));
}
