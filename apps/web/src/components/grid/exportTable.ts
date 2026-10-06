import type { CellValue, ChoiceDTO, RowDTO } from '@suivi/shared';
import type { CellValue as ValeurExcel, Fill, Font, Worksheet } from 'exceljs';
import type { ColonneImpression } from './printTable';

export interface ParamsExport {
  /** Nom de l'onglet, ex. « SEPTEMBRE 2026 » ou « ARCHIVES ». */
  titre: string;
  /** Colonnes VISIBLES, dans l'ordre de la disposition personnelle. */
  colonnes: ColonneImpression[];
  /** Lignes AFFICHÉES, dans l'ordre de la grille (après filtres et tri). */
  lignes: RowDTO[];
  /** Choix des colonnes SELECT (couleurs des pastilles), indexés par `Column.key`. */
  choicesParColonne: Record<string, ChoiceDTO[]>;
}

export const TYPE_MIME_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Même teinte d'en-tête et de traits que le document imprimé. */
const FOND_EN_TETE = 'FFF1F5F3';
const COULEUR_TRAIT = 'FFC9D2CF';
/** Largeur Excel (en caractères) d'une colonne sans largeur connue. */
const LARGEUR_PAR_DEFAUT = 18;

/** `#RRGGBB` → `FFRRGGBB` (ARGB opaque attendu par Excel), sinon undefined. */
function versArgb(hex: string | null | undefined): string | undefined {
  const match = hex ? /^#([0-9A-Fa-f]{6})$/.exec(hex) : null;
  return match ? `FF${match[1].toUpperCase()}` : undefined;
}

/**
 * Nom d'onglet accepté par Excel : 31 caractères maximum, sans `\ / ? * [ ] :`
 * ni apostrophe en bordure. Jamais vide.
 */
export function nomOnglet(titre: string): string {
  const nettoye = titre
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/^'+|'+$/g, '')
    .trim()
    .slice(0, 31)
    .trim();
  return nettoye === '' ? 'Tableau' : nettoye;
}

/** `suivi-commandes-2026-09.xlsx`, ou `suivi-commandes-archives.xlsx`. */
export function nomFichierExport(view: string, month: string): string {
  return view === 'archives'
    ? 'suivi-commandes-archives.xlsx'
    : `suivi-commandes-${month}.xlsx`;
}

/**
 * `2026-08-14` (ou son ISO complet) → vraie date Excel, triable et filtrable.
 * Minuit UTC : ExcelJS convertit l'horodatage UTC en numéro de série, le jour
 * reste donc le bon quel que soit le fuseau du poste. Date impossible
 * (2026-02-31) ou texte libre → null, la valeur brute est alors conservée.
 */
function dateExcel(valeur: CellValue): Date | null {
  if (typeof valeur !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(valeur);
  if (!match) return null;
  const annee = Number(match[1]);
  const mois = Number(match[2]);
  const jour = Number(match[3]);
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  if (date.getUTCMonth() !== mois - 1 || date.getUTCDate() !== jour) return null;
  return date;
}

/** Seuls les liens web et mail deviennent cliquables dans le classeur. */
const LIEN_CLIQUABLE = /^(https?:\/\/|mailto:)/i;

/**
 * Valeur typée de la cellule : date réelle pour DATE, nombre conservé tel
 * quel, lien cliquable pour LINK, texte sinon. Jamais de formule : une
 * valeur commençant par « = » reste du texte.
 */
function valeurCellule(colonne: ColonneImpression, brute: CellValue): ValeurExcel {
  if (brute === null || brute === undefined || String(brute) === '') return null;
  if (colonne.type === 'DATE') {
    return dateExcel(brute) ?? String(brute);
  }
  if (typeof brute === 'number') return brute;
  const texte = String(brute);
  if (colonne.type === 'LINK' && LIEN_CLIQUABLE.test(texte)) {
    return { text: texte, hyperlink: texte };
  }
  return texte;
}

/**
 * Couleurs d'une cellule, au plus près de la grille :
 * - surlignage manuel (`formats.bg`) prioritaire en fond : c'est l'info que
 *   l'équipe pose à la main et que le filtre couleur exploite ;
 * - sinon, pour une colonne SELECT, fond et texte de la pastille du choix
 *   (couleur partenaire, statut…). Le texte du choix n'est pas repris sur un
 *   surlignage : un blanc sur jaune serait illisible ;
 * - couleur de texte manuelle (`formats.fg`), hors SELECT (sans effet dans
 *   la grille sur ces colonnes).
 */
function styleCellule(
  colonne: ColonneImpression,
  ligne: RowDTO,
  choicesParColonne: Record<string, ChoiceDTO[]>,
): { fond?: string; texte?: string; gras: boolean } {
  const format = ligne.formats?.[colonne.key];
  const surlignage = versArgb(format?.bg);

  if (colonne.type === 'SELECT') {
    const brute = ligne.data[colonne.key];
    const choice =
      brute === null || brute === undefined
        ? undefined
        : (choicesParColonne[colonne.key] ?? []).find((c) => c.label === String(brute));
    return {
      fond: surlignage ?? versArgb(choice?.bgColor),
      texte: surlignage ? undefined : versArgb(choice?.textColor),
      gras: choice?.bold ?? false,
    };
  }
  return { fond: surlignage, texte: versArgb(format?.fg), gras: false };
}

function remplissage(argb: string): Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

const TRAIT = { style: 'thin' as const, color: { argb: COULEUR_TRAIT } };
const CADRE = { top: TRAIT, left: TRAIT, bottom: TRAIT, right: TRAIT };

/** Largeur écran (px) → largeur Excel (caractères ≈ 7 px), bornée. */
function largeurExcel(px: number | undefined): number {
  if (px === undefined) return LARGEUR_PAR_DEFAUT;
  return Math.min(Math.max(Math.round((px - 5) / 7), 6), 100);
}

function remplirFeuille(feuille: Worksheet, params: ParamsExport): void {
  const { colonnes, lignes, choicesParColonne } = params;

  feuille.columns = colonnes.map((colonne) => ({
    key: colonne.key,
    width: largeurExcel(colonne.width),
    style:
      colonne.type === 'DATE'
        ? { numFmt: 'dd/mm/yyyy' }
        : colonne.type === 'LONGTEXT'
          ? { alignment: { wrapText: true, vertical: 'top' } }
          : {},
  }));

  const enTete = feuille.getRow(1);
  colonnes.forEach((colonne, index) => {
    const cellule = enTete.getCell(index + 1);
    cellule.value = colonne.label;
    cellule.font = { bold: true };
    cellule.fill = remplissage(FOND_EN_TETE);
    cellule.border = CADRE;
    cellule.alignment = { vertical: 'top' };
  });

  lignes.forEach((ligne, indexLigne) => {
    const rangee = feuille.getRow(indexLigne + 2);
    colonnes.forEach((colonne, indexColonne) => {
      const cellule = rangee.getCell(indexColonne + 1);
      const valeur = valeurCellule(colonne, ligne.data[colonne.key] ?? null);
      cellule.value = valeur;
      cellule.border = CADRE;

      const { fond, texte, gras } = styleCellule(colonne, ligne, choicesParColonne);
      if (fond) cellule.fill = remplissage(fond);
      const police: Partial<Font> = {};
      if (texte) police.color = { argb: texte };
      if (gras) police.bold = true;
      if (typeof valeur === 'object' && valeur !== null && 'hyperlink' in valeur) {
        // Lien : souligné, bleu sauf couleur métier explicite.
        police.underline = true;
        police.color ??= { argb: 'FF0563C1' };
      }
      if (Object.keys(police).length > 0) cellule.font = police;
    });
  });

  // En-tête figé et filtres Excel prêts à l'emploi sur toutes les colonnes.
  feuille.views = [{ state: 'frozen', ySplit: 1 }];
  if (colonnes.length > 0) {
    feuille.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: colonnes.length },
    };
  }
}

/**
 * Charge ExcelJS à la demande (~1 Mo) : la grille n'en paie le coût qu'au
 * premier export. Module CommonJS : selon le bundler, l'API est exposée sur
 * l'espace de noms ou sur `default`.
 */
async function chargerExcelJS(): Promise<typeof import('exceljs')> {
  const module = await import('exceljs');
  return (module as { default?: typeof import('exceljs') }).default ?? module;
}

/**
 * Classeur `.xlsx` du tableau tel qu'affiché : un onglet, en-tête figé avec
 * filtres, colonnes de la disposition personnelle (ordre et largeurs),
 * lignes après filtres et tri, dates réelles au format JJ/MM/AAAA, couleurs
 * des pastilles et surlignages conservés. Aucun effet de bord : le
 * téléchargement reste à la charge de l'appelant.
 */
export async function construireClasseurExcel(params: ParamsExport): Promise<ArrayBuffer> {
  const ExcelJS = await chargerExcelJS();
  const classeur = new ExcelJS.Workbook();
  classeur.creator = 'Suivi commandes';
  classeur.created = new Date();
  remplirFeuille(classeur.addWorksheet(nomOnglet(params.titre)), params);
  return classeur.xlsx.writeBuffer();
}

/** Enregistre `contenu` sous `nomFichier` via un lien de téléchargement éphémère. */
export function declencherTelechargement(
  contenu: BlobPart,
  nomFichier: string,
  type: string,
): void {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  lien.style.display = 'none';
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  // Libéré au tour suivant : certains navigateurs lisent l'URL après le clic.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
