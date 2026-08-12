'use client';

import { useAppStore } from '../../lib/store';

/**
 * Placeholder : affiche uniquement l'utilisateur courant.
 * La Feature 7 (temps réel front) le remplace par la vraie liste de présence
 * alimentée par l'événement Socket.IO `presence`.
 */
export function PresenceBar() {
  const user = useAppStore((state) => state.user);

  return (
    <div
      data-testid="presence-bar"
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
    >
      {user ? (
        <span
          title={user.displayName}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: user.cursorColor,
            color: '#FFFFFF',
            fontWeight: 700,
          }}
        >
          {user.displayName.slice(0, 1).toLocaleUpperCase('fr-FR')}
        </span>
      ) : null}
    </div>
  );
}
