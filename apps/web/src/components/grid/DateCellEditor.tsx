'use client';

import { useEffect, useRef } from 'react';
import type { CellValue } from '@suivi/shared';

export interface DateCellEditorProps {
  value: CellValue;
  onValueChange: (value: CellValue) => void;
  stopEditing: (cancel?: boolean) => void;
}

/** Un `input[type=date]` n'accepte que le format ISO `YYYY-MM-DD`. */
function toInputValue(value: CellValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

export function DateCellEditor({
  value,
  onValueChange,
  stopEditing,
}: DateCellEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      ref={inputRef}
      data-testid="date-input"
      type="date"
      aria-label="Date"
      defaultValue={toInputValue(value)}
      onChange={(event) => onValueChange(event.target.value === '' ? null : event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          stopEditing();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          stopEditing(true);
        }
      }}
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        border: '1px solid #2772A4',
        padding: '0 4px',
        font: 'inherit',
      }}
    />
  );
}
