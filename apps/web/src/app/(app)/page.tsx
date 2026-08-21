'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as api from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { DataGrid } from '../../components/grid/DataGrid';
import { MonthNav, latestMonth } from '../../components/grid/MonthNav';
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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {ready ? (
        <DataGrid reload={reload} />
      ) : (
        <p data-testid="grid-loading" className="gc-page">
          Chargement du tableau…
        </p>
      )}

      <div className="gc-footbar">
        <button
          type="button"
          data-testid="add-row"
          onClick={() => void addRow()}
          className="gc-btn-primary"
        >
          + Ajouter une ligne
        </button>
      </div>

      <MonthNav
        months={months}
        current={monthCourant}
        onSelect={(month) => void selectMonth(month)}
        onCreate={(month) => void createMonth(month)}
        onOpenArchives={() => router.push('/archives')}
      />
    </div>
  );
}
