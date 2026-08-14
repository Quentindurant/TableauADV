import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import type { UserDTO } from '@suivi/shared';
import { AppHeader } from '../../components/AppHeader';
import ConnectionBanner from '../../components/grid/ConnectionBanner';
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
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--gc-surface)',
      }}
    >
      <AppHeader user={user} />
      <ConnectionBanner />
      <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
}
