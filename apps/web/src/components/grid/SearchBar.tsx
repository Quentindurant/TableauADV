'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface SearchBarProps {
  initialQuery?: string;
  /** Injecté par les tests ; sinon la barre navigue vers /recherche?q=… */
  onSubmit?: (q: string) => void;
}

/**
 * `useRouter` exige un `AppRouterContext` fourni par Next.js : absent en
 * rendu de test isolé (React Testing Library sans App Router), l'appel
 * lève une erreur. Les tests unitaires de ce composant fournissent
 * toujours `onSubmit`, donc le routeur n'y est jamais utilisé — on
 * l'obtient malgré tout de façon défensive pour ne jamais faire planter
 * le rendu hors contexte App Router.
 */
function useOptionalRouter(): ReturnType<typeof useRouter> | null {
  try {
    return useRouter();
  } catch {
    return null;
  }
}

export function SearchBar({ initialQuery = '', onSubmit }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const router = useOptionalRouter();

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed === '') return;
    if (onSubmit) {
      onSubmit(trimmed);
      return;
    }
    router?.push(`/recherche?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form role="search" onSubmit={submit} style={{ display: 'flex', gap: 6 }}>
      <input
        data-testid="search-input"
        type="search"
        aria-label="Rechercher dans tous les mois"
        placeholder="Rechercher (tous les mois + archives)…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        style={{
          width: 320,
          padding: '5px 8px',
          border: '1px solid #D8DEE4',
          borderRadius: 4,
          font: 'inherit',
        }}
      />
      <button
        type="submit"
        data-testid="search-submit"
        style={{
          padding: '5px 12px',
          border: '1px solid #2772A4',
          borderRadius: 4,
          background: '#2772A4',
          color: '#FFFFFF',
          cursor: 'pointer',
        }}
      >
        Rechercher
      </button>
    </form>
  );
}
