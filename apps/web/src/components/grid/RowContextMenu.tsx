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
  onDelete: () => void;
  onShowHistory: () => void;
  onHighlight: (color: string | null) => void;
}

const itemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: '5px 10px',
  font: 'inherit',
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

  function askDelete(): void {
    const confirmed = window.confirm(
      'Supprimer définitivement cette ligne ? Cette action est irréversible.',
    );
    if (!confirmed) return;
    run(onDelete);
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
        background: '#FFFFFF',
        border: '1px solid #D8DEE4',
        borderRadius: 4,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        padding: '4px 0',
        fontSize: 13,
      }}
    >
      <button type="button" data-testid="menu-insert-above" style={itemStyle} onClick={() => run(onInsertAbove)}>
        Insérer une ligne au-dessus
      </button>
      <button type="button" data-testid="menu-insert-below" style={itemStyle} onClick={() => run(onInsertBelow)}>
        Insérer une ligne en-dessous
      </button>

      <hr style={{ border: 0, borderTop: '1px solid #EDF1F5', margin: '4px 0' }} />

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
        style={{ ...itemStyle, color: '#C0392B' }}
        onClick={askDelete}
      >
        Supprimer la ligne
      </button>

      <hr style={{ border: 0, borderTop: '1px solid #EDF1F5', margin: '4px 0' }} />

      <div style={{ padding: '2px 10px 0', color: '#6B7785', fontSize: 12 }}>
        Surligner la colonne « {colKey} »
      </div>
      <HighlightPalette onPick={(color) => run(() => onHighlight(color))} />
    </div>
  );
}
