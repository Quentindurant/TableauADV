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
    expect(screen.getAllByText('Suivi commandes')).toHaveLength(1);
    expect(screen.getAllByRole('search')).toHaveLength(1);
    expect(screen.getAllByTestId('presence-bar')).toHaveLength(1);
    expect(screen.getAllByTestId('account-menu')).toHaveLength(1);
    expect(screen.getByTestId('current-user').textContent).toBe('Quentin');
    expect(screen.getByTestId('account-profile').getAttribute('href')).toBe('/parametres');
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeTruthy();
  });
});
