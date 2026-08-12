'use client';

import type { CellValue, ChoiceDTO } from '@suivi/shared';

export function findChoice(
  choices: ChoiceDTO[],
  value: CellValue,
): ChoiceDTO | undefined {
  if (value === null || value === undefined) return undefined;
  const label = String(value);
  return choices.find((choice) => choice.label === label);
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
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        padding: '1px 6px',
        borderRadius: 3,
        lineHeight: '20px',
        backgroundColor: choice?.bgColor ?? undefined,
        color: choice?.textColor ?? undefined,
        fontWeight: choice?.bold ? 700 : 400,
      }}
    >
      {String(value)}
    </span>
  );
}
