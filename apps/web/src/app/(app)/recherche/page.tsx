'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { RowDTO } from '@suivi/shared';
import * as api from '../../../lib/api';
import { useAppStore } from '../../../lib/store';
import { formatMonthLabel } from '../../../components/grid/MonthTabs';
import { messageForError } from '../../../components/grid/cellCommit';

function groupByMonth(rows: RowDTO[]): [string, RowDTO[]][] {
  const groups = new Map<string, RowDTO[]>();
  for (const row of rows) {
    const key = row.archived ? 'archives' : row.month;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
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
    <div style={{ padding: 12 }}>
      {loading ? <p data-testid="search-loading">Recherche en cours…</p> : null}

      {!loading && query.trim() !== '' && rows.length === 0 ? (
        <p data-testid="search-empty">Aucun résultat pour « {query} ».</p>
      ) : null}

      {groupByMonth(rows).map(([group, groupRows]) => (
        <section key={group} data-testid={`search-group-${group}`} style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 14, margin: '0 0 6px' }}>
            {group === 'archives' ? 'ARCHIVES' : formatMonthLabel(group)} — {groupRows.length}{' '}
            ligne(s)
          </h2>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {preview.map((column) => (
                  <th
                    key={column.key}
                    style={{
                      textAlign: 'left',
                      borderBottom: '1px solid #D8DEE4',
                      padding: '4px 6px',
                    }}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupRows.map((row) => (
                <tr
                  key={row.id}
                  data-testid={`search-row-${row.id}`}
                  onClick={() => openMonth(row)}
                  style={{ cursor: 'pointer' }}
                >
                  {preview.map((column) => (
                    <td
                      key={column.key}
                      style={{ borderBottom: '1px solid #EDF1F5', padding: '4px 6px' }}
                    >
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
    <Suspense fallback={<p style={{ padding: 12 }}>Chargement…</p>}>
      <ResultatsRecherche />
    </Suspense>
  );
}
