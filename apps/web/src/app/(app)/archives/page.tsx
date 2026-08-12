'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as api from '../../../lib/api';
import { useAppStore } from '../../../lib/store';
import { DataGrid } from '../../../components/grid/DataGrid';
import { messageForError } from '../../../components/grid/cellCommit';

export default function ArchivesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const store = useAppStore.getState();
    try {
      store.setRows(await api.getRows({ archived: true }));
    } catch (error: unknown) {
      store.showToast(messageForError(error), 'error');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap(): Promise<void> {
      const store = useAppStore.getState();
      try {
        const [user, columns, monthList] = await Promise.all([
          api.getMe(),
          api.getColumns(),
          api.getMonths(),
        ]);
        if (cancelled) return;
        store.setUser(user);
        store.setColumns(columns);
        store.setMonths(monthList);
        store.setView('archives');
        store.setRows(await api.getRows({ archived: true }));
        if (!cancelled) setReady(true);
      } catch (error: unknown) {
        if (error instanceof api.ApiRequestError && error.code === 'AUTH_REQUIRED') {
          router.replace('/login');
          return;
        }
        store.showToast(messageForError(error), 'error');
        if (!cancelled) setReady(true);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 12px',
          borderBottom: '1px solid #EDF1F5',
        }}
      >
        <strong style={{ fontSize: 14 }}>Archives</strong>
        <button
          type="button"
          data-testid="back-to-months"
          onClick={() => router.push('/')}
          style={{
            padding: '5px 12px',
            border: '1px solid #D8DEE4',
            borderRadius: 4,
            background: '#FFFFFF',
            cursor: 'pointer',
          }}
        >
          Retour aux mois
        </button>
      </div>

      {ready ? (
        <DataGrid reload={reload} />
      ) : (
        <p data-testid="grid-loading" style={{ padding: 12 }}>
          Chargement des archives…
        </p>
      )}
    </div>
  );
}
