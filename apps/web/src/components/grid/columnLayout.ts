import type { ColumnDTO, UserColumnLayoutDTO } from '@suivi/shared';

/**
 * Regroupe les rafales d'événements AG Grid (drag de redimensionnement)
 * en un seul PATCH réseau.
 *
 * Attention : cette primitive ferme sur un timer UNIQUE. Si on partage une
 * même instance entre plusieurs colonnes, chaque appel annule le précédent
 * et seuls les derniers arguments survivent — un redimensionnement sur la
 * colonne A suivi d'un redimensionnement sur la colonne B dans la fenêtre de
 * debounce ferait perdre silencieusement le PATCH de A. Pour coalescer par
 * colonne, utiliser `debouncePerKey`.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): ((...args: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: A): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };

  debounced.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}

/**
 * Comme `debounce`, mais coalesce indépendamment PAR CLÉ : une instance
 * `debounce()` distincte est créée à la demande pour chaque clé (via une
 * `Map<clé, DebouncedFn>`), de sorte qu'un appel sur la clé B n'annule jamais
 * un appel en attente sur la clé A. `cancelAll()` annule toutes les entrées
 * en attente, quelle que soit la clé — à utiliser dans le cleanup d'un
 * `useEffect` de démontage.
 *
 * Le `keyOf` reçoit le premier argument (la clé) et retourne un identifiant
 * pour coalescer les appels.
 */
export function debouncePerKey<A extends [string, ...unknown[]]>(
  fn: (...args: A) => void,
  delayMs: number,
  keyOf: (key: A[0]) => string,
): ((...args: A) => void) & { cancelAll: () => void } {
  const debounced = new Map<string, ReturnType<typeof debounce<A>>>();

  const perKey = (...args: A): void => {
    const key = keyOf(args[0]);
    let entry = debounced.get(key);
    if (!entry) {
      entry = debounce(fn, delayMs);
      debounced.set(key, entry);
    }
    entry(...args);
  };

  perKey.cancelAll = (): void => {
    for (const entry of debounced.values()) {
      entry.cancel();
    }
  };

  return perKey;
}

/** AG Grid raisonne en `colId` (= Column.key) ; l'API attend l'`id` (cuid). */
export function resolveColumnId(
  columns: ColumnDTO[],
  colKey: string | null | undefined,
): string | null {
  if (!colKey) return null;
  return columns.find((column) => column.key === colKey)?.id ?? null;
}

/** Sous-ensemble que `PATCH /me/column-layout/:columnId` accepte. */
export interface ColumnFieldPatch {
  width?: number;
  position?: number;
  hidden?: boolean;
}

export interface PersistColumnFieldDeps {
  getColumns: () => ColumnDTO[];
  patchMyColumnLayout: (
    columnId: string,
    patch: ColumnFieldPatch,
  ) => Promise<UserColumnLayoutDTO>;
  applyUserLayoutEntries: (entries: UserColumnLayoutDTO[]) => void;
  onError: (error: unknown) => void;
}

/**
 * PATCH d'un réglage PERSONNEL de colonne (largeur, masquage) résolu depuis
 * son `colKey` AG Grid, puis fusion de l'entrée upsertée dans le store en
 * cas de succès.
 *
 * Cette fusion est indispensable : `buildColumnDefs` consomme les colonnes
 * EFFECTIVES (`fusionnerDisposition(columns, userLayout)`), et `columnDefs`
 * se recalcule dès que `columns` ou `userLayout` change (config.changed
 * admin, autre réglage perso). Sans mise à jour de `userLayout` après un
 * succès, AG Grid recevrait une valeur obsolète au prochain recalcul et
 * ferait revenir visuellement la colonne à son ancien état alors que le
 * serveur a la bonne valeur.
 */
export async function persistColumnField(
  colKey: string,
  patch: ColumnFieldPatch,
  deps: PersistColumnFieldDeps,
): Promise<void> {
  const id = resolveColumnId(deps.getColumns(), colKey);
  if (!id) return;
  try {
    const entry = await deps.patchMyColumnLayout(id, patch);
    deps.applyUserLayoutEntries([entry]);
  } catch (error) {
    deps.onError(error);
  }
}

/**
 * Enregistre l'ordre COMPLET des colonnes affichées après un déplacement :
 * une entrée `position` par colonne (rangs 0..n-1), pas de trous ambigus au
 * départage de la fusion.
 *
 * Les entrées upsertées ne sont fusionnées dans le store qu'en FIN de
 * rafale : appliquer chaque position au fil de l'eau ferait retomber les
 * colonnes pas encore PATCHées sur leur position standard, et la grille
 * afficherait un ordre transitoirement incohérent à chaque recalcul.
 */
export async function persistColumnOrder(
  colKeys: string[],
  deps: PersistColumnFieldDeps,
): Promise<void> {
  const columns = deps.getColumns();
  const entries: UserColumnLayoutDTO[] = [];
  try {
    // Compteur séparé de l'index : une clé non résolue (défensif) ne doit
    // pas laisser de trou dans la séquence des positions enregistrées.
    let position = 0;
    for (const colKey of colKeys) {
      const id = resolveColumnId(columns, colKey);
      if (!id) continue;
      entries.push(await deps.patchMyColumnLayout(id, { position }));
      position += 1;
    }
    deps.applyUserLayoutEntries(entries);
  } catch (error) {
    // Les entrées déjà upsertées côté serveur sont conservées : l'état local
    // reste aligné sur ce que le serveur a réellement enregistré.
    deps.applyUserLayoutEntries(entries);
    deps.onError(error);
  }
}
