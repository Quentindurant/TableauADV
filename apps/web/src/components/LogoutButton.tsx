'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '../lib/api';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick(): Promise<void> {
    setPending(true);
    try {
      await api.post<void>('/auth/logout');
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={pending}>
      Se déconnecter
    </button>
  );
}
