'use client';

import type { MonthInfo } from '@suivi/shared';

const MONTH_NAMES = [
  'JANVIER',
  'FEVRIER',
  'MARS',
  'AVRIL',
  'MAI',
  'JUIN',
  'JUILLET',
  'AOUT',
  'SEPTEMBRE',
  'OCTOBRE',
  'NOVEMBRE',
  'DECEMBRE',
];

export function nextMonth(month: string): string {
  const [year, index] = month.split('-').map((part) => Number(part));
  if (index >= 12) return `${year + 1}-01`;
  return `${year}-${String(index + 1).padStart(2, '0')}`;
}

export function latestMonth(months: MonthInfo[], today: Date = new Date()): string {
  if (months.length === 0) {
    return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return months.map((info) => info.month).sort().at(-1) as string;
}

/** `2026-08` → `AOUT 2026`, comme les onglets du classeur d'origine. */
export function formatMonthLabel(month: string): string {
  const [year, index] = month.split('-');
  const name = MONTH_NAMES[Number(index) - 1] ?? month;
  return `${name} ${year}`;
}

export interface MonthTabsProps {
  months: MonthInfo[];
  current: string;
  onSelect: (month: string) => void;
  onCreate: (month: string) => void;
  onOpenArchives: () => void;
}

export function MonthTabs({
  months,
  current,
  onSelect,
  onCreate,
  onOpenArchives,
}: MonthTabsProps) {
  const ordered = [...months].sort((a, b) => a.month.localeCompare(b.month));

  const tabStyle = (active: boolean): React.CSSProperties => ({
    border: '1px solid #D8DEE4',
    borderBottom: active ? '2px solid #2772A4' : '1px solid #D8DEE4',
    background: active ? '#FFFFFF' : '#EDF1F5',
    fontWeight: active ? 700 : 400,
    padding: '4px 10px',
    borderRadius: '4px 4px 0 0',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  return (
    <nav
      aria-label="Mois"
      style={{
        display: 'flex',
        gap: 4,
        alignItems: 'flex-end',
        overflowX: 'auto',
        padding: '6px 8px 0',
        borderTop: '1px solid #D8DEE4',
        background: '#F7F9FB',
      }}
    >
      {ordered.map((info) => {
        const active = info.month === current;
        return (
          <button
            key={info.month}
            type="button"
            data-testid={`month-tab-${info.month}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => onSelect(info.month)}
            style={tabStyle(active)}
          >
            {formatMonthLabel(info.month)}{' '}
            <span style={{ color: '#6B7785', fontWeight: 400 }}>({info.count})</span>
          </button>
        );
      })}

      <button
        type="button"
        data-testid="month-add"
        title="Créer le mois suivant"
        aria-label="Créer le mois suivant"
        onClick={() => onCreate(nextMonth(latestMonth(ordered)))}
        style={{ ...tabStyle(false), fontWeight: 700 }}
      >
        +
      </button>

      <button
        type="button"
        data-testid="month-archives"
        onClick={onOpenArchives}
        style={{ ...tabStyle(false), marginLeft: 'auto' }}
      >
        ARCHIVES
      </button>
    </nav>
  );
}
