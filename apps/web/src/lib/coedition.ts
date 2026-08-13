import type { RowDTO, UserDTO } from '@suivi/shared';
import type { GridView } from './store';

// La vue courante est le couple (view, monthCourant) du store de la Feature 6 :
// `view` vaut 'month' | 'archives', `month` porte le mois affiché.

/** Room Socket.IO correspondant à la vue (contrats : month:<YYYY-MM> | archives). */
export function roomForView(view: GridView, month: string): string {
  return view === 'archives' ? 'archives' : `month:${month}`;
}

/** Chemin REST de rechargement complet des lignes de la vue. */
export function rowsQueryForView(view: GridView, month: string): string {
  return view === 'archives' ? '/rows?archived=true' : `/rows?month=${month}`;
}

/** Une ligne reçue par socket doit-elle apparaître dans la vue courante ? */
export function rowBelongsToView(row: RowDTO, view: GridView, month: string): boolean {
  if (view === 'archives') {
    return row.archived;
  }
  return !row.archived && row.month === month;
}

function byPosition(a: RowDTO, b: RowDTO): number {
  return a.position - b.position || a.id.localeCompare(b.id);
}

/** Insère ou remplace une ligne, tableau trié par position (immuable). */
export function upsertRow(rows: RowDTO[], row: RowDTO): RowDTO[] {
  const index = rows.findIndex((r) => r.id === row.id);
  const next = index === -1 ? [...rows, row] : rows.map((r) => (r.id === row.id ? row : r));
  return next.sort(byPosition);
}

/** Retire une ligne par id (immuable). */
export function removeRow(rows: RowDTO[], rowId: string): RowDTO[] {
  return rows.filter((r) => r.id !== rowId);
}

/**
 * Présence affichable : sans l'utilisateur courant (il se voit déjà) et
 * dédoublonnée — un même membre peut avoir plusieurs sockets dans la room.
 */
export function uniquePresence(users: UserDTO[], meId: string | null): UserDTO[] {
  const seen = new Set<string>();
  const result: UserDTO[] = [];
  for (const user of users) {
    if (user.id === meId || seen.has(user.id)) {
      continue;
    }
    seen.add(user.id);
    result.push(user);
  }
  return result;
}

/** Initiales affichées dans l'avatar de présence. */
export function initialsOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Clé de cellule utilisée pour les verrous (identique au serveur). */
export function cellKey(rowId: string, colKey: string): string {
  return `${rowId}:${colKey}`;
}
