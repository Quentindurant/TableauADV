'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as api from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { DataGrid } from '../../components/grid/DataGrid';
import { MonthTabs, latestMonth } from '../../components/grid/MonthTabs';
import { PresenceBar } from '../../components/grid/PresenceBar';
import { SearchBar } from '../../components/grid/SearchBar';
import { messageForError } from '../../components/grid/cellCommit';

export default function MoisPage() {
  const router = useRouter();
  const monthCourant = useAppStore((state) => state.monthCourant);
  const months = useAppStore((state) => state.months);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const store = useAppStore.getState();
    try {
      const rows = await api.getRows({ month: store.monthCourant });
      store.setRows(rows);
    } catch (error: unknown) {
      store.showToast(messageForError(error), 'error');
    }
  }, []);

  // Chargement initial : profil, colonnes, mois, puis lignes du mois courant.
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
        store.setView('month');
        const target = monthList.some((info) => info.month === store.monthCourant)
          ? store.monthCourant
          : latestMonth(monthList);
        store.setMonthCourant(target);
        store.setRows(await api.getRows({ month: target }));
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

  async function selectMonth(month: string): Promise<void> {
    useAppStore.getState().setMonthCourant(month);
    await reload();
  }

  async function createMonth(month: string): Promise<void> {
    const store = useAppStore.getState();
    try {
      await api.createRow({ month });
      store.setMonths(await api.getMonths());
      store.setMonthCourant(month);
      store.setRows(await api.getRows({ month }));
    } catch (error: unknown) {
      store.showToast(messageForError(error), 'error');
    }
  }

  async function addRow(): Promise<void> {
    const store = useAppStore.getState();
    try {
      const created = await api.createRow({ month: store.monthCourant });
      store.addRow(created);
      store.setMonths(await api.getMonths());
    } catch (error: unknown) {
      store.showToast(messageForError(error), 'error');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 12px',
          borderBottom: '1px solid #D8DEE4',
          background: '#F7F9FB',
        }}
      >
        <strong style={{ fontSize: 15 }}>Suivi commandes</strong>
        <SearchBar />
        <div style={{ marginLeft: 'auto' }}>
          <PresenceBar />
        </div>
      </header>

      {ready ? (
        <DataGrid reload={reload} />
      ) : (
        <p data-testid="grid-loading" style={{ padding: 12 }}>
          Chargement du tableau…
        </p>
      )}

      <div style={{ padding: '6px 12px', borderTop: '1px solid #EDF1F5' }}>
        <button
          type="button"
          data-testid="add-row"
          onClick={() => void addRow()}
          style={{
            padding: '5px 12px',
            border: '1px solid #2772A4',
            borderRadius: 4,
            background: '#FFFFFF',
            color: '#2772A4',
            cursor: 'pointer',
          }}
        >
          + Ajouter une ligne
        </button>
      </div>

      <MonthTabs
        months={months}
        current={monthCourant}
        onSelect={(month) => void selectMonth(month)}
        onCreate={(month) => void createMonth(month)}
        onOpenArchives={() => router.push('/archives')}
      />
    </div>
  );
}
