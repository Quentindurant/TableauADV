import type { UserDTO } from '@suivi/shared';
import { cellKey } from './coedition';
import type { RemoteFocus, RemoteLock } from './store';

/** Sous-ensemble du store nécessaire pour décorer une cellule. */
export interface CellCoeditionState {
  focuses: Record<string, RemoteFocus>;
  locks: Record<string, RemoteLock>;
  presence: UserDTO[];
  meId: string | null;
}

export interface CellDecoration {
  /** Collègue dont le curseur est sur la cellule (bordure + étiquette). */
  focusedBy: UserDTO | null;
  /** Collègue qui édite la cellule (hachures + non éditable). */
  lockedBy: UserDTO | null;
}

export function decorateCell(
  rowId: string,
  colKey: string,
  state: CellCoeditionState,
): CellDecoration {
  const focus = Object.values(state.focuses).find(
    (f) => f.rowId === rowId && f.colKey === colKey && f.userId !== state.meId,
  );
  const focusedBy = focus
    ? (state.presence.find((user) => user.id === focus.userId) ?? null)
    : null;

  const lock = state.locks[cellKey(rowId, colKey)];
  const lockedBy = lock && lock.user.id !== state.meId ? lock.user : null;

  return { focusedBy, lockedBy };
}

export function isLockedByOther(
  rowId: string,
  colKey: string,
  state: CellCoeditionState,
): boolean {
  return decorateCell(rowId, colKey, state).lockedBy !== null;
}

/**
 * Variables CSS injectées en style inline sur la cellule AG Grid.
 * `--coedition-label` contient une chaîne CSS déjà entre guillemets, prête
 * pour `content: var(--coedition-label)`.
 */
export function cellStyleFor(decoration: CellDecoration): Record<string, string> | null {
  const user = decoration.lockedBy ?? decoration.focusedBy;
  if (!user) {
    return null;
  }
  const label = user.displayName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return {
    '--coedition-color': user.cursorColor,
    '--coedition-label': `"${label}"`,
  };
}
