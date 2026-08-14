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
      <div className="gc-toolbar">
        <strong className="gc-view-title">Archives</strong>
        <button
          type="button"
          data-testid="back-to-months"
          onClick={() => router.push('/')}
          className="gc-btn-ghost"
        >
          Retour aux mois
        </button>
      </div>

      {ready ? (
        <DataGrid reload={reload} />
      ) : (
        <p data-testid="grid-loading" className="gc-page">
          Chargement des archives…
        </p>
      )}
    </div>
  );
}
