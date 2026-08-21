import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserDTO } from '@suivi/shared';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('../lib/api', () => ({ api: { post: vi.fn(async () => undefined) } }));

import { useAppStore } from '../lib/store';
import { AppHeader } from './AppHeader';

const user: UserDTO = {
  id: 'u1',
  email: 'quentin.durant49@orange.fr',
  displayName: 'Quentin',
  cursorColor: '#3498DB',
};

beforeEach(() => {
  useAppStore.setState({ user });
});

describe('AppHeader — barre du haut unifiée', () => {
  it('rend logo, recherche, présence et menu compte une seule fois', () => {
    render(<AppHeader user={user} />);
    // Logo image cliquable en guise de marque : il ramène à la grille.
    const logo = screen.getByRole('img', { name: 'Groupe GC Développement — Suivi commandes' });
    expect(logo.closest('a')?.getAttribute('href')).toBe('/');
    expect(screen.getAllByRole('search')).toHaveLength(1);
    expect(screen.getAllByTestId('presence-bar')).toHaveLength(1);
    expect(screen.getAllByTestId('account-menu')).toHaveLength(1);
    expect(screen.getByTestId('current-user').textContent).toBe('Quentin');
    expect(screen.getByTestId('account-profile').getAttribute('href')).toBe('/parametres');
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeTruthy();
  });

  it('propose « Aide » au-dessus de « Profil et paramètres » dans le menu compte', () => {
    render(<AppHeader user={user} />);
    const aide = screen.getByTestId('account-help');
    expect(aide.getAttribute('href')).toBe('/aide');
    expect(aide.textContent).toBe('Aide');
    // L'ordre des liens du menu : l'aide d'abord, le profil ensuite.
    const liens = Array.from(screen.getByTestId('account-menu').querySelectorAll('a'));
    expect(liens.map((lien) => lien.getAttribute('href'))).toEqual(['/aide', '/parametres']);
  });
});
