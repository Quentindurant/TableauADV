// 24 fonds pastel lisibles, chacun apparié à un texte foncé de la même teinte.
// Aucun fond ne reprend les 6 couleurs partenaires figées de l'Excel
// (#229955, #C39BD3, #2772A4, #F1C40F, #AED6F1, #FCDAE3).
export const PASTEL_PALETTE: { bg: string; text: string }[] = [
  { bg: '#FFCDD2', text: '#B71C1C' }, // 0  rose
  { bg: '#F8BBD0', text: '#880E4F' }, // 1  rose bonbon
  { bg: '#E1BEE7', text: '#4A148C' }, // 2  lilas
  { bg: '#D1C4E9', text: '#311B92' }, // 3  parme
  { bg: '#C5CAE9', text: '#1A237E' }, // 4  bleu lavande
  { bg: '#BBDEFB', text: '#0D47A1' }, // 5  bleu clair
  { bg: '#B3E5FC', text: '#01579B' }, // 6  bleu ciel
  { bg: '#B2EBF2', text: '#006064' }, // 7  cyan pâle
  { bg: '#B2DFDB', text: '#004D40' }, // 8  turquoise pâle
  { bg: '#C8E6C9', text: '#1B5E20' }, // 9  vert pâle
  { bg: '#DCEDC8', text: '#33691E' }, // 10 vert tilleul
  { bg: '#F0F4C3', text: '#827717' }, // 11 citron vert
  { bg: '#FFF9C4', text: '#6D4C41' }, // 12 jaune pâle
  { bg: '#FFECB3', text: '#5D4037' }, // 13 ambre pâle
  { bg: '#FFE0B2', text: '#BF360C' }, // 14 orange pâle
  { bg: '#FFCCBC', text: '#9C2A00' }, // 15 corail pâle
  { bg: '#D7CCC8', text: '#3E2723' }, // 16 taupe
  { bg: '#CFD8DC', text: '#263238' }, // 17 gris bleuté
  { bg: '#F6DDCC', text: '#6E2C00' }, // 18 pêche
  { bg: '#D6EAF8', text: '#154360' }, // 19 bleu glacier
  { bg: '#D1F2EB', text: '#0B5345' }, // 20 menthe
  { bg: '#FCF3CF', text: '#7D6608' }, // 21 vanille
  { bg: '#E8DAEF', text: '#512E5F' }, // 22 glycine
  { bg: '#FDEBD0', text: '#784212' }, // 23 abricot
];

/**
 * Couleur pastel déterministe pour un libellé : hash djb2 du libellé
 * trimmé et passé en majuscules, modulo 24. Même libellé => même couleur,
 * à chaque exécution (import rejouable, seed idempotent).
 */
export function pastelFor(label: string): { bg: string; text: string } {
  const normalized = label.trim().toUpperCase();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    // djb2 : hash * 33 + code, contraint en entier non signé 32 bits.
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) >>> 0;
  }
  return PASTEL_PALETTE[hash % 24];
}
