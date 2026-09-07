/**
 * Traduction française des libellés AG Grid (filtres natifs des colonnes
 * texte et date, mois du sélecteur). Les clés proviennent de
 * `FILTER_LOCALE_TEXT` et `MONTH_LOCALE_TEXT` d'ag-grid-community 34.3.1 :
 * toute clé absente retomberait sur l'anglais.
 *
 * Le vocabulaire suit celui des ADV plutôt que la traduction littérale
 * (« Contient » et non « Contenir », « Vide » et non « Blanc »).
 */
export const AG_GRID_LOCALE_FR: Record<string, string> = {
  // Boutons du panneau de filtre
  applyFilter: 'Appliquer',
  clearFilter: 'Effacer',
  resetFilter: 'Réinitialiser',
  cancelFilter: 'Annuler',

  // Titres et champ de saisie
  textFilter: 'Filtre texte',
  numberFilter: 'Filtre numérique',
  dateFilter: 'Filtre par date',
  setFilter: 'Filtre par valeurs',
  filterOoo: 'Rechercher…',
  empty: 'Choisir un critère',

  // Opérateurs
  equals: 'Égal à',
  notEqual: 'Différent de',
  lessThan: 'Avant',
  greaterThan: 'Après',
  inRange: 'Entre',
  inRangeStart: 'Du',
  inRangeEnd: 'Au',
  lessThanOrEqual: 'Inférieur ou égal à',
  greaterThanOrEqual: 'Supérieur ou égal à',
  contains: 'Contient',
  notContains: 'Ne contient pas',
  startsWith: 'Commence par',
  endsWith: 'Se termine par',
  blank: 'Vide',
  notBlank: 'Non vide',
  before: 'Avant',
  after: 'Après',
  andCondition: 'ET',
  orCondition: 'OU',
  dateFormatOoo: 'jj/mm/aaaa',

  // Résumés affichés sous l'en-tête de colonne
  filterSummaryInactive: ': tout',
  filterSummaryContains: 'contient',
  filterSummaryNotContains: 'ne contient pas',
  filterSummaryTextEquals: 'égal à',
  filterSummaryTextNotEqual: 'différent de',
  filterSummaryStartsWith: 'commence par',
  filterSummaryEndsWith: 'se termine par',
  filterSummaryBlank: 'est vide',
  filterSummaryNotBlank: "n'est pas vide",
  filterSummaryInRange: 'entre',

  // Mois du sélecteur de date
  january: 'Janvier',
  february: 'Février',
  march: 'Mars',
  april: 'Avril',
  may: 'Mai',
  june: 'Juin',
  july: 'Juillet',
  august: 'Août',
  september: 'Septembre',
  october: 'Octobre',
  november: 'Novembre',
  december: 'Décembre',
};
