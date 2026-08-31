'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  // Position fixe du panneau (portail) : calée sur la pilule à l'ouverture.
  const [menuPosition, setMenuPosition] = useState<{ left: number; bottom: number } | null>(
    null,
  );
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const previous = adjacentMonth(months, current, -1);
  const next = adjacentMonth(months, current, 1);
  const currentInfo = months.find((info) => info.month === current);
  // Menu du plus récent au plus ancien : les mois travaillés sont en haut.
  const recentFirst = [...months].sort((a, b) => b.month.localeCompare(a.month));

  useEffect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent): void {
      const target = event.target as Node;
      // Le panneau vit dans un portail : un clic dedans est hors du wrap.
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    // Panneau en position fixe : on le referme dès que la fenêtre bouge.
    function onWindowChange(): void {
      setOpen(false);
    }
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onWindowChange);
    window.addEventListener('resize', onWindowChange);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onWindowChange);
      window.removeEventListener('resize', onWindowChange);
    };
  }, [open]);

  /**
   * Le panneau est rendu en portail (document.body) : la barre `.gc-tabs`
   * porte un `overflow-x: auto` qui rognerait un panneau positionné en
   * absolu dans le wrap. On l'ancre donc en `fixed`, au-dessus de la pilule.
   */
  function toggleMenu(): void {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPosition({ left: rect.left, bottom: window.innerHeight - rect.top + 6 });
    setOpen(true);
  }

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
          onClick={toggleMenu}
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

        {open && menuPosition
          ? createPortal(
              <div
                ref={menuRef}
                role="listbox"
                aria-label="Tous les mois"
                data-testid="month-menu"
                className="gc-monthnav__menu"
                style={{ left: menuPosition.left, bottom: menuPosition.bottom }}
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
              </div>,
              document.body,
            )
          : null}
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
