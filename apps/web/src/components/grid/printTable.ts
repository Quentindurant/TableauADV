import type { CellValue, ChoiceDTO, ColumnType, RowDTO } from '@suivi/shared';

/** Colonne telle que le document imprimé la consomme (sous-ensemble de ColumnDTO). */
export interface ColonneImpression {
  key: string;
  label: string;
  type: ColumnType;
}

export interface ParamsImpression {
  /** En-tête de page, ex. « SEPTEMBRE 2026 » ou « ARCHIVES ». */
  titre: string;
  /** Compteur, ex. « 12 / 195 dossiers — filtres actifs » ou « 195 dossiers ». */
  sousTitre: string;
  /** Colonnes VISIBLES, dans l'ordre de la disposition personnelle. */
  colonnes: ColonneImpression[];
  /** Lignes AFFICHÉES, dans l'ordre de la grille (après filtres et tri). */
  lignes: RowDTO[];
  /** Choix des colonnes SELECT (pastilles), indexés par `Column.key`. */
  choicesParColonne: Record<string, ChoiceDTO[]>;
  /** Date portée par l'en-tête ; fixable par l'appelant (défaut : maintenant). */
  dateImpression?: Date;
}

/**
 * Échappe une valeur pour insertion en HTML (texte ou attribut) : les
 * commentaires ADV peuvent contenir < > & et des guillemets.
 */
function echapperHtml(texte: string): string {
  return texte
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * `2026-08-14` (ou son ISO complet) → `14/08/2026`. Sinon, valeur brute.
 * Copie locale de `formatDateFr` (columnDefs.ts) : ce module reste pur, sans
 * entraîner AG Grid ni les composants React de la grille.
 */
function formaterDateFr(value: CellValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return text;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Date calendaire locale au format JJ/MM/AAAA (en-tête « Imprimé le … »). */
function formaterDateJour(date: Date): string {
  const jour = String(date.getDate()).padStart(2, '0');
  const mois = String(date.getMonth() + 1).padStart(2, '0');
  return `${jour}/${mois}/${date.getFullYear()}`;
}

/** Pastille d'une colonne SELECT : mêmes couleurs métier que SelectCellRenderer. */
function renduPastille(valeur: string, choices: ChoiceDTO[]): string {
  const choice = choices.find((candidat) => candidat.label === valeur);
  const styles: string[] = [];
  if (choice?.bgColor) styles.push(`background:${choice.bgColor}`);
  if (choice?.textColor) styles.push(`color:${choice.textColor}`);
  if (choice?.bold) styles.push('font-weight:700');
  const attribut = styles.length > 0 ? ` style="${echapperHtml(styles.join(';'))}"` : '';
  return `<span class="pastille"${attribut}>${echapperHtml(valeur)}</span>`;
}

/** `<td>` d'une cellule : surlignage manuel en fond, contenu selon le type. */
function renduCellule(
  colonne: ColonneImpression,
  ligne: RowDTO,
  choicesParColonne: Record<string, ChoiceDTO[]>,
): string {
  const brute = ligne.data[colonne.key] ?? null;
  const surlignage = ligne.formats?.[colonne.key]?.bg;
  const attribut = surlignage ? ` style="background:${echapperHtml(surlignage)}"` : '';

  let contenu = '';
  if (brute !== null && String(brute) !== '') {
    if (colonne.type === 'DATE') {
      contenu = echapperHtml(formaterDateFr(brute));
    } else if (colonne.type === 'SELECT') {
      contenu = renduPastille(String(brute), choicesParColonne[colonne.key] ?? []);
    } else {
      contenu = echapperHtml(String(brute));
    }
  }
  return `<td${attribut}>${contenu}</td>`;
}

const STYLES_IMPRESSION = `
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      font-size: 9px;
      color: #10353b;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .entete { margin: 0 0 6px; }
    .entete h1 { margin: 0; font-size: 14px; letter-spacing: 0.04em; }
    .entete p { margin: 2px 0 0; color: #5b6f6b; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th, td {
      border: 1px solid #c9d2cf;
      padding: 2px 4px;
      text-align: left;
      vertical-align: top;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    th { background: #f1f5f3; font-size: 8px; }
    .pastille { display: inline-block; padding: 1px 8px; border-radius: 999px; }
`;

/**
 * Document HTML complet, autonome et prêt à imprimer, du tableau tel
 * qu'affiché : colonnes de la disposition personnelle, lignes après filtres
 * et tri. Fonction pure : l'ouverture de fenêtre et le `print()` restent à
 * la charge de l'appelant (DataGrid).
 *
 * `thead` en `table-header-group` : les libellés de colonnes se répètent en
 * tête de CHAQUE page imprimée.
 */
export function construireDocumentImpression(params: ParamsImpression): string {
  const { titre, sousTitre, colonnes, lignes, choicesParColonne } = params;
  const dateImpression = formaterDateJour(params.dateImpression ?? new Date());

  const enTetes = colonnes
    .map((colonne) => `<th>${echapperHtml(colonne.label)}</th>`)
    .join('');
  const corps = lignes
    .map(
      (ligne) =>
        `<tr>${colonnes.map((colonne) => renduCellule(colonne, ligne, choicesParColonne)).join('')}</tr>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${echapperHtml(titre)}</title>
<style>${STYLES_IMPRESSION}</style>
</head>
<body>
<header class="entete">
<h1>${echapperHtml(titre)}</h1>
<p>${echapperHtml(sousTitre)} — Imprimé le ${dateImpression}</p>
</header>
<table>
<thead><tr>${enTetes}</tr></thead>
<tbody>
${corps}
</tbody>
</table>
</body>
</html>`;
}
