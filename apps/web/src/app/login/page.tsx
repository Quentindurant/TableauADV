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
    <main className="gc-login">
      <form onSubmit={handleSubmit} className="gc-login__form">
        <span className="gc-login__eyebrow">Groupe GC</span>
        <h1 className="gc-login__title">Suivi commandes</h1>

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
          <p role="alert" className="gc-login__error">
            {error}
          </p>
        )}

        <button type="submit" className="gc-login__submit" disabled={pending}>
          {pending ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
