import type { Row } from '@prisma/client';
import type { CellFormat, CellValue, RowDTO } from '@suivi/shared';

/**
 * Projection Prisma -> contrat RowDTO.
 * `data` et `formats` sont des JSONB typés `Prisma.JsonValue` : on les ramène
 * aux formes du contrat et on remplace null/valeur scalaire par un objet vide.
 */
export function toRowDTO(row: Row): RowDTO {
  return {
    id: row.id,
    month: row.month,
    position: row.position,
    data: asObject<CellValue>(row.data),
    formats: asObject<CellFormat>(row.formats),
    version: row.version,
    archived: row.archived,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function asObject<T>(value: unknown): Record<string, T> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, T>;
}
