'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { RowDTO } from '@suivi/shared';
import * as api from '../../../lib/api';
import { useAppStore } from '../../../lib/store';
import { formatMonthLabel } from '../../../components/grid/MonthTabs';
import { messageForError } from '../../../components/grid/cellCommit';

export function groupByMonth(rows: RowDTO[]): [string, RowDTO[]][] {
  const groups = new Map<string, RowDTO[]>();
  for (const row of rows) {
    const key = row.archived ? 'archives' : row.month;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  // Mois les plus récents d'abord ; les archives ferment toujours la liste.
  return [...groups.entries()].sort((a, b) => {
    if (a[0] === 'archives') return 1;
    if (b[0] === 'archives') return -1;
    return b[0].localeCompare(a[0]);
  });
}

function ResultatsRecherche() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.get('q') ?? '';
  const columns = useAppStore((state) => state.columns);
  const [rows, setRows] = useState<RowDTO[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run(): Promise<void> {
      const store = useAppStore.getState();
      if (store.columns.length === 0) {
        try {
          store.setColumns(await api.getColumns());
        } catch {
          // Les colonnes servent seulement à choisir les champs affichés.
        }
      }
      if (query.trim() === '') {
        setRows([]);
        return;
      }
      setLoading(true);
      try {
        const found = await api.searchRows(query);
        if (!cancelled) setRows(found);
      } catch (error: unknown) {
        store.showToast(messageForError(error), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const preview = columns.filter((column) => column.visible).slice(0, 5);

  function openMonth(row: RowDTO): void {
    if (row.archived) {
      router.push('/archives');
      return;
    }
    useAppStore.getState().setMonthCourant(row.month);
    router.push('/');
  }

  return (
    <div className="gc-page">
      {loading ? <p data-testid="search-loading">Recherche en cours…</p> : null}

      {!loading && query.trim() !== '' && rows.length === 0 ? (
        <p data-testid="search-empty">Aucun résultat pour « {query} ».</p>
      ) : null}

      {groupByMonth(rows).map(([group, groupRows]) => (
        <section key={group} data-testid={`search-group-${group}`} className="gc-results__group">
          <h2 className="gc-results__title">
            {group === 'archives' ? 'ARCHIVES' : formatMonthLabel(group)} — {groupRows.length}{' '}
            ligne(s)
          </h2>
          <table className="gc-results__table">
            <thead>
              <tr>
                {preview.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupRows.map((row) => (
                <tr
                  key={row.id}
                  data-testid={`search-row-${row.id}`}
                  onClick={() => openMonth(row)}
                  className="gc-results__row"
                >
                  {preview.map((column) => (
                    <td key={column.key}>
                      {row.data[column.key] === null || row.data[column.key] === undefined
                        ? ''
                        : String(row.data[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

export default function RecherchePage() {
  return (
    <Suspense fallback={<p className="gc-page">Chargement…</p>}>
      <ResultatsRecherche />
    </Suspense>
  );
}
