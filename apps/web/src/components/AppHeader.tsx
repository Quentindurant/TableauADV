'use client';

import Link from 'next/link';
import type { UserDTO } from '@suivi/shared';
import { LogoutButton } from './LogoutButton';
import { PresenceBar } from './grid/PresenceBar';
import { SearchBar } from './grid/SearchBar';
import { initialsOf } from '../lib/coedition';

export interface AppHeaderProps {
  user: UserDTO;
}

export function AppHeader({ user }: AppHeaderProps) {
  return (
    <header data-testid="app-header" className="gc-topbar">
      <div className="gc-topbar__brand">
        <span className="gc-topbar__eyebrow">Groupe GC</span>
        <span className="gc-topbar__title">Suivi commandes</span>
      </div>

      <div className="gc-topbar__right">
        <SearchBar />
        <PresenceBar />
        <details data-testid="account-menu" className="gc-account">
          <summary className="gc-account__summary">
            {/* Fond de la pastille = couleur MÉTIER du curseur de l'utilisateur. */}
            <span className="gc-account__avatar" style={{ backgroundColor: user.cursorColor }}>
              {initialsOf(user.displayName)}
            </span>
            <span data-testid="current-user">{user.displayName}</span>
          </summary>
          <div className="gc-account__menu">
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
