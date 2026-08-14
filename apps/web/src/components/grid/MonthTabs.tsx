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

  return (
    <nav aria-label="Mois" className="gc-tabs">
      {ordered.map((info) => {
        const active = info.month === current;
        return (
          <button
            key={info.month}
            type="button"
            data-testid={`month-tab-${info.month}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => onSelect(info.month)}
            className="gc-tab"
          >
            {formatMonthLabel(info.month)}{' '}
            <span className="gc-tab__count">({info.count})</span>
          </button>
        );
      })}

      <button
        type="button"
        data-testid="month-add"
        title="Créer le mois suivant"
        aria-label="Créer le mois suivant"
        onClick={() => onCreate(nextMonth(latestMonth(ordered)))}
        className="gc-tab"
      >
        +
      </button>

      <button
        type="button"
        data-testid="month-archives"
        onClick={onOpenArchives}
        className="gc-tab gc-tabs__end"
      >
        ARCHIVES
      </button>
    </nav>
  );
}
