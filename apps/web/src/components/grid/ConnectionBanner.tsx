'use client';

import { useAppStore } from '../../lib/store';
import './presence-bar.css';

export const CONNECTION_LOST_MESSAGE = 'Connexion perdue — reconnexion...';

/** Bandeau permanent tant que le socket n'est pas reconnecté. */
export function ConnectionBanner() {
  const connected = useAppStore((state) => state.connected);

  if (connected) {
    return null;
  }

  return (
    <div className="connection-banner" data-testid="connection-banner" role="status">
      {CONNECTION_LOST_MESSAGE}
    </div>
  );
}

export default ConnectionBanner;
