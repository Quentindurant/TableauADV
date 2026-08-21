'use client';

import { useEffect, useState } from 'react';
import type { MonthInfo, RowDTO } from '@suivi/shared';
import { HighlightPalette } from './HighlightPalette';
import { formatMonthLabel } from './MonthTabs';

export interface RowContextMenuProps {
  row: RowDTO;
  /** Colonne sous le curseur : c'est elle que le surlignage cible. */
  colKey: string;
  months: MonthInfo[];
  x: number;
  y: number;
  onClose: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onMoveToMonth: (month: string) => void;
  onToggleArchive: () => void;
  /** Demande de suppression : la confirmation est portée par le parent (dialogue). */
  onDelete: () => void;
  onShowHistory: () => void;
  onHighlight: (color: string | null) => void;
}

const itemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  border: 'none',
  borderRadius: 'var(--gc-radius-sm)',
  background: 'transparent',
  color: 'var(--gc-petrol)',
  cursor: 'pointer',
  padding: '6px 10px',
  font: 'inherit',
  fontWeight: 600,
};

export function RowContextMenu({
  row,
  colKey,
  months,
  x,
  y,
  onClose,
  onInsertAbove,
  onInsertBelow,
  onMoveToMonth,
  onToggleArchive,
  onDelete,
  onShowHistory,
  onHighlight,
}: RowContextMenuProps) {
  const [moveOpen, setMoveOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function run(action: () => void): void {
    action();
    onClose();
  }

  return (
    <div
      role="menu"
      data-testid="row-context-menu"
      aria-label={`Actions sur la ligne ${row.position + 1}`}
      style={{
        position: 'fixed',
        top: y,
        left: x,
        zIndex: 1000,
        minWidth: 230,
        background: 'var(--gc-surface)',
        border: '1px solid var(--gc-border)',
        borderRadius: 'var(--gc-radius)',
        boxShadow: 'var(--gc-shadow-md)',
        padding: 5,
        fontSize: 13,
      }}
    >
      <button type="button" data-testid="menu-insert-above" style={itemStyle} onClick={() => run(onInsertAbove)}>
        Insérer une ligne au-dessus
      </button>
      <button type="button" data-testid="menu-insert-below" style={itemStyle} onClick={() => run(onInsertBelow)}>
        Insérer une ligne en-dessous
      </button>

      <hr style={{ border: 0, borderTop: '1px solid var(--gc-border-soft)', margin: '5px 0' }} />

      <button
        type="button"
        data-testid="menu-move"
        aria-expanded={moveOpen}
        style={itemStyle}
        onClick={() => setMoveOpen((open) => !open)}
      >
        Déplacer vers un autre mois ▸
      </button>
      {moveOpen ? (
        <div style={{ paddingLeft: 12 }}>
          {months
            .filter((info) => info.month !== row.month)
            .map((info) => (
              <button
                key={info.month}
                type="button"
                data-testid={`menu-move-${info.month}`}
                style={itemStyle}
                onClick={() => run(() => onMoveToMonth(info.month))}
              >
                {formatMonthLabel(info.month)}
              </button>
            ))}
        </div>
      ) : null}

      <button type="button" data-testid="menu-archive" style={itemStyle} onClick={() => run(onToggleArchive)}>
        {row.archived ? 'Désarchiver' : 'Archiver'}
      </button>
      <button type="button" data-testid="menu-history" style={itemStyle} onClick={() => run(onShowHistory)}>
        Historique de la ligne
      </button>
      <button
        type="button"
        data-testid="menu-delete"
        style={{ ...itemStyle, color: 'var(--gc-danger)' }}
        onClick={() => run(onDelete)}
      >
        Supprimer la ligne
      </button>

      <hr style={{ border: 0, borderTop: '1px solid var(--gc-border-soft)', margin: '5px 0' }} />

      <div
        style={{
          padding: '2px 10px 0',
          color: 'var(--gc-muted)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Surligner la colonne « {colKey} »
      </div>
      <HighlightPalette onPick={(color) => run(() => onHighlight(color))} />
    </div>
  );
}
