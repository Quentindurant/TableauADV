'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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

/**
 * Mois existant voisin du mois AFFICHÉ (pas du mois calendaire) : les flèches
 * naviguent dans la liste des mois réellement présents, trous compris.
 */
export function adjacentMonth(
  months: MonthInfo[],
  current: string,
  delta: -1 | 1,
): string | null {
  const ordered = months.map((info) => info.month).sort();
  const index = ordered.indexOf(current);
  if (index === -1) return null;
  return ordered[index + delta] ?? null;
}

export interface MonthNavProps {
  months: MonthInfo[];
  current: string;
  onSelect: (month: string) => void;
  onCreate: (month: string) => void;
  onOpenArchives: () => void;
  /** Emplacement libre dans la barre (compteur de dossiers, etc.). */
  children?: ReactNode;
}

export function MonthNav({
  months,
  current,
  onSelect,
  onCreate,
  onOpenArchives,
  children,
}: MonthNavProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const previous = adjacentMonth(months, current, -1);
  const next = adjacentMonth(months, current, 1);
  const currentInfo = months.find((info) => info.month === current);
  // Menu du plus récent au plus ancien : les mois travaillés sont en haut.
  const recentFirst = [...months].sort((a, b) => b.month.localeCompare(a.month));

  useEffect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent): void {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function select(month: string): void {
    setOpen(false);
    onSelect(month);
  }

  return (
    <nav aria-label="Mois" className="gc-tabs">
      <button
        type="button"
        data-testid="month-prev"
        aria-label="Mois précédent"
        disabled={previous === null}
        onClick={() => previous !== null && onSelect(previous)}
        className="gc-tab gc-monthnav__arrow"
      >
        ◀
      </button>

      <div ref={wrapRef} className="gc-monthnav__wrap">
        <button
          type="button"
          data-testid="month-current"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="gc-tab gc-monthnav__current"
        >
          {formatMonthLabel(current)}
          {currentInfo ? (
            <span className="gc-tab__count">({currentInfo.count})</span>
          ) : null}
          <span aria-hidden="true" className="gc-monthnav__caret">
            ▾
          </span>
        </button>

        {open ? (
          <div
            role="listbox"
            aria-label="Tous les mois"
            data-testid="month-menu"
            className="gc-monthnav__menu"
          >
            {recentFirst.map((info) => {
              const selected = info.month === current;
              return (
                <button
                  key={info.month}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid={`month-option-${info.month}`}
                  onClick={() => select(info.month)}
                  className="gc-monthnav__option"
                >
                  {formatMonthLabel(info.month)}
                  <span className="gc-tab__count">({info.count})</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        data-testid="month-next"
        aria-label="Mois suivant"
        disabled={next === null}
        onClick={() => next !== null && onSelect(next)}
        className="gc-tab gc-monthnav__arrow"
      >
        ▶
      </button>

      <button
        type="button"
        data-testid="month-add"
        title="Créer le mois suivant"
        aria-label="Créer le mois suivant"
        onClick={() => onCreate(nextMonth(latestMonth(months)))}
        className="gc-tab"
      >
        +
      </button>

      {children}

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
