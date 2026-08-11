import type { Choice, Column } from '@prisma/client';
import type { ChoiceDTO, ColumnDTO, ColumnType } from '@suivi/shared';

export function toChoiceDTO(choice: Choice): ChoiceDTO {
  return {
    id: choice.id,
    columnId: choice.columnId,
    label: choice.label,
    bgColor: choice.bgColor,
    textColor: choice.textColor,
    bold: choice.bold,
    position: choice.position,
    archived: choice.archived,
  };
}

export function toColumnDTO(column: Column & { choices?: Choice[] }): ColumnDTO {
  return {
    id: column.id,
    key: column.key,
    label: column.label,
    type: column.type as ColumnType,
    position: column.position,
    width: column.width,
    visible: column.visible,
    choices: (column.choices ?? []).map(toChoiceDTO),
  };
}
