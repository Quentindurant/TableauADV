import type { ColumnDTO } from '@suivi/shared';

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
 */
export function debouncePerKey<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
  keyOf: (...args: A) => string,
): ((...args: A) => void) & { cancelAll: () => void } {
  const debounced = new Map<string, ReturnType<typeof debounce<A>>>();

  const perKey = (...args: A): void => {
    const key = keyOf(...args);
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

/** Sous-ensemble de `ColumnDTO` que `PATCH /columns/:id` accepte pour la mise en page. */
export interface ColumnFieldPatch {
  width?: number;
  position?: number;
}

export interface PersistColumnFieldDeps {
  getColumns: () => ColumnDTO[];
  patchColumn: (id: string, body: ColumnFieldPatch) => Promise<ColumnDTO>;
  setColumns: (columns: ColumnDTO[]) => void;
  onError: (error: unknown) => void;
}

/**
 * PATCH d'un champ de mise en page de colonne (largeur ou position) résolu
 * depuis son `colKey` AG Grid, puis resynchronisation du store avec la
 * réponse serveur en cas de succès.
 *
 * Cette resynchronisation est indispensable : `buildColumnDefs` lit
 * `column.width`/`column.position` depuis le store, et `columnDefs` se
 * recalcule dès que la référence `columns` change (réordonnancement
 * ultérieur, synchro temps réel). Sans mise à jour du store après un succès,
 * AG Grid peut recevoir une valeur obsolète au prochain recalcul et faire
 * revenir visuellement la colonne à son ancien état alors que le serveur a
 * la bonne valeur.
 */
export async function persistColumnField(
  colKey: string,
  patch: ColumnFieldPatch,
  deps: PersistColumnFieldDeps,
): Promise<void> {
  const id = resolveColumnId(deps.getColumns(), colKey);
  if (!id) return;
  try {
    const updated = await deps.patchColumn(id, patch);
    const next = deps.getColumns().map((column) => (column.id === updated.id ? updated : column));
    deps.setColumns(next);
  } catch (error) {
    deps.onError(error);
  }
}
