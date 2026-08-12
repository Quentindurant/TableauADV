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
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    return choices.filter((c) => !c.archived && c.label.toUpperCase().includes(filter.toUpperCase()));
  }, [filter, choices]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      stopEditing(true);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((prev) => (prev < visible.length - 1 ? prev + 1 : prev));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((prev) => (prev > -1 ? prev - 1 : prev));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (highlighted >= 0 && visible[highlighted]) {
        onValueChange(visible[highlighted].label);
        stopEditing();
      }
    }
  };

  const handleClear = () => {
    onValueChange(null);
    stopEditing();
  };

  const handleOptionClick = (label: string) => {
    onValueChange(label);
    stopEditing();
  };

  return (
    <div
      data-testid="select-editor"
      style={{
        position: 'absolute',
        zIndex: 1000,
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
        onChange={(event) => {
          setFilter(event.target.value);
          setHighlighted(0);
        }}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '4px 6px',
          border: '1px solid #D8DEE4',
          borderRadius: 3,
          fontFamily: 'inherit',
          fontSize: 'inherit',
        }}
      />
      <div
        style={{
          marginTop: 4,
          maxHeight: 300,
          overflowY: 'auto',
        }}
      >
        {visible.map((choice, idx) => (
          <button
            key={choice.id}
            data-testid={`select-option-${choice.label}`}
            onClick={() => handleOptionClick(choice.label)}
            onMouseEnter={() => setHighlighted(idx)}
            type="button"
            style={{
              marginTop: 4,
              width: '100%',
              border: 'none',
              backgroundColor: idx === highlighted && !choice.bgColor ? '#F0F0F0' : (choice.bgColor ?? 'transparent'),
              cursor: 'pointer',
              textAlign: 'left',
              padding: '3px 6px',
              borderRadius: 2,
              color: choice.textColor ?? 'inherit',
              fontWeight: choice.bold ? 700 : 400,
              transition: 'background-color 0.1s ease',
            }}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <button
        data-testid="select-clear"
        type="button"
        onClick={handleClear}
        style={{
          marginTop: 4,
          width: '100%',
          border: 'none',
          backgroundColor: 'transparent',
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
