'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { UserDTO } from '@suivi/shared';
import { ApiRequestError, api } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.post<{ user: UserDTO }>('/auth/login', { email, password });
      router.replace('/');
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Connexion impossible. Réessayez.',
      );
      setPending(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          width: '20rem',
          padding: '2rem',
          border: '1px solid #d5d8dc',
          borderRadius: '0.5rem',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Suivi commandes</h1>

        <label htmlFor="email">Adresse e-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="password">Mot de passe</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error !== null && (
          <p role="alert" style={{ color: '#c0392b', margin: 0 }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={pending}>
          {pending ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
