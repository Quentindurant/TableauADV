'use client';

import Link from 'next/link';
import type { UserDTO } from '@suivi/shared';
import { LogoutButton } from './LogoutButton';
import { PresenceBar } from './grid/PresenceBar';
import { SearchBar } from './grid/SearchBar';

export interface AppHeaderProps {
  user: UserDTO;
}

export function AppHeader({ user }: AppHeaderProps) {
  return (
    <header
      data-testid="app-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '8px 12px',
        borderBottom: '1px solid #D8DEE4',
        background: '#F7F9FB',
      }}
    >
      <strong style={{ fontSize: 15 }}>Suivi commandes</strong>
      <SearchBar />
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <PresenceBar />
        <details data-testid="account-menu" style={{ position: 'relative' }}>
          <summary
            data-testid="current-user"
            style={{
              cursor: 'pointer',
              listStyle: 'none',
              color: user.cursorColor,
              fontWeight: 600,
            }}
          >
            {user.displayName}
          </summary>
          <div
            style={{
              position: 'absolute',
              right: 0,
              marginTop: 6,
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              background: '#FFFFFF',
              border: '1px solid #D8DEE4',
              borderRadius: 4,
              zIndex: 1200,
              whiteSpace: 'nowrap',
            }}
          >
            <Link href="/parametres" data-testid="account-profile">
              Profil et paramètres
            </Link>
            <LogoutButton />
          </div>
        </details>
      </div>
    </header>
  );
}
