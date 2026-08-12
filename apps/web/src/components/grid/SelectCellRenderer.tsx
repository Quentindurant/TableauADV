'use client';

import type { CellValue, ChoiceDTO } from '@suivi/shared';

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function findChoice(choices: ChoiceDTO[], value: CellValue): ChoiceDTO | undefined {
  return choices.find((c) => c.label === String(value));
}

export interface SelectCellRendererProps {
  value: CellValue;
  choices: ChoiceDTO[];
}

export function SelectCellRenderer({ value, choices }: SelectCellRendererProps) {
  if (value === null || value === undefined || String(value) === '') {
    return <span />;
  }

  const choice = findChoice(choices, value);

  return (
    <span
      data-testid="select-pastille"
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 3,
        lineHeight: '20px',
        backgroundColor: choice?.bgColor ? hexToRgb(choice.bgColor) : undefined,
        color: choice?.textColor ? hexToRgb(choice.textColor) : undefined,
        fontWeight: choice?.bold ? 700 : 400,
      }}
    >
      {String(value)}
    </span>
  );
}
