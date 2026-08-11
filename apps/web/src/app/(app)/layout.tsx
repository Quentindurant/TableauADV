import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import type { UserDTO } from '@suivi/shared';
import { LogoutButton } from '../../components/LogoutButton';
import { serverApiBaseUrl } from '../../lib/api';

/**
 * Vérifie la session côté serveur : le middleware ne contrôle que la
 * PRÉSENCE du cookie, jamais sa validité (il ne peut pas vérifier la
 * signature JWT). C'est ce fetch qui tranche.
 */
async function fetchCurrentUser(): Promise<UserDTO | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token');
  if (!token) {
    return null;
  }
  const response = await fetch(`${serverApiBaseUrl()}/api/auth/me`, {
    headers: { cookie: `token=${token.value}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { user: UserDTO };
  return body.user;
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await fetchCurrentUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid #d5d8dc',
        }}
      >
        <strong style={{ marginRight: 'auto' }}>Suivi commandes</strong>
        <span
          data-testid="current-user"
          style={{ color: user.cursorColor, fontWeight: 600 }}
        >
          {user.displayName}
        </span>
        <LogoutButton />
      </header>
      <main style={{ padding: '1rem' }}>{children}</main>
    </div>
  );
}
