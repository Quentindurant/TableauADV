'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CellValue, ChoiceDTO } from '@suivi/shared';

export interface SelectCellEditorProps {
  value: CellValue;
  choices: ChoiceDTO[];
  onValueChange: (value: CellValue) => void;
  stopEditing: (cancel?: boolean) => void;
}

export function SelectCellEditor(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { value, choices, onValueChange, stopEditing }: SelectCellEditorProps,
) {
  const [filter, setFilter] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const needle = filter.trim().toLocaleUpperCase('fr-FR');
    return choices
      .filter((choice) => !choice.archived)
      .filter((choice) =>
        needle === '' ? true : choice.label.toLocaleUpperCase('fr-FR').includes(needle),
      );
  }, [filter, choices]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setHighlighted(0);
  }, [filter]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      setHighlighted((current) => Math.min(current + 1, visible.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      setHighlighted((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      const choice = visible[highlighted];
      if (choice) pick(choice.label);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      stopEditing(true);
    }
  }

  function pick(next: CellValue): void {
    onValueChange(next);
    stopEditing();
  }

  return (
    <div
      data-testid="select-editor"
      style={{
        background: '#FFFFFF',
        border: '1px solid #D8DEE4',
        borderRadius: 4,
        boxShadow: '0 6px 18px rgba(0,0,0,0.14)',
        minWidth: 200,
        padding: 4,
      }}
    >
      <input
        ref={inputRef}
        data-testid="select-filter"
        aria-label="Filtrer les choix"
        placeholder="Filtrer…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '4px 6px',
          border: '1px solid #D8DEE4',
          borderRadius: 3,
          font: 'inherit',
        }}
      />
      <ul
        style={{
          listStyle: 'none',
          margin: '4px 0 0',
          padding: 0,
          maxHeight: 240,
          overflowY: 'auto',
        }}
      >
        {visible.map((choice, index) => (
          <li key={choice.id}>
            <button
              type="button"
              data-testid={`select-option-${choice.label}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(choice.label)}
              onMouseEnter={() => setHighlighted(index)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: index === highlighted ? '2px solid #0066CC' : 'none',
                cursor: 'pointer',
                padding: '3px 4px',
                background: index === highlighted ? '#EDF1F5' : 'transparent',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  padding: '1px 6px',
                  borderRadius: 3,
                  backgroundColor: choice.bgColor ?? undefined,
                  color: choice.textColor ?? undefined,
                  fontWeight: choice.bold ? 700 : 400,
                }}
              >
                {choice.label}
              </span>
            </button>
          </li>
        ))}
        {visible.length === 0 ? (
          <li style={{ padding: '4px 6px', color: '#6B7785' }}>Aucun choix</li>
        ) : null}
      </ul>
      <button
        type="button"
        data-testid="select-clear"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => pick(null)}
        style={{
          marginTop: 4,
          width: '100%',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          padding: '3px 6px',
          color: '#6B7785',
        }}
      >
        Vider la cellule
      </button>
    </div>
  );
}
