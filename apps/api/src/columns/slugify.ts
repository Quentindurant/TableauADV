/**
 * Transforme un libellé de colonne en clé technique stable
 * (utilisée comme clé dans le JSONB `Row.data`).
 * Exemple : "Matériel reçu" -> "materiel_recu".
 */
export function slugify(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '');
}

/**
 * Rend la clé unique parmi celles déjà prises : "client", "client_2", "client_3"…
 */
export function uniqueKey(base: string, taken: readonly string[]): string {
  const root = base === '' ? 'colonne' : base;
  if (!taken.includes(root)) {
    return root;
  }
  let suffix = 2;
  while (taken.includes(`${root}_${suffix}`)) {
    suffix += 1;
  }
  return `${root}_${suffix}`;
}
