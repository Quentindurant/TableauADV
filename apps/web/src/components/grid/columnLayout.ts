import type { ColumnDTO } from '@suivi/shared';

/**
 * Regroupe les rafales d'événements AG Grid (drag de redimensionnement)
 * en un seul PATCH réseau.
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

/** AG Grid raisonne en `colId` (= Column.key) ; l'API attend l'`id` (cuid). */
export function resolveColumnId(
  columns: ColumnDTO[],
  colKey: string | null | undefined,
): string | null {
  if (!colKey) return null;
  return columns.find((column) => column.key === colKey)?.id ?? null;
}
