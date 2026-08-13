'use client';

import { initialsOf } from '../../lib/coedition';
import { useAppStore } from '../../lib/store';
import './presence-bar.css';

/**
 * Avatars des collègues présents dans la room de la vue courante.
 * L'utilisateur connecté n'y figure pas (filtré par le store).
 */
export function PresenceBar() {
  const presence = useAppStore((state) => state.presence);

  return (
    <div className="presence-bar" data-testid="presence-bar" aria-label="Collègues connectés">
      {presence.length === 0 ? (
        <span className="presence-empty">Seul(e) sur cette vue</span>
      ) : (
        presence.map((user) => (
          <span
            key={user.id}
            className="presence-avatar"
            data-testid={`presence-${user.id}`}
            title={user.displayName}
            aria-label={user.displayName}
            style={{ backgroundColor: user.cursorColor }}
          >
            {initialsOf(user.displayName)}
          </span>
        ))
      )}
    </div>
  );
}

export default PresenceBar;
