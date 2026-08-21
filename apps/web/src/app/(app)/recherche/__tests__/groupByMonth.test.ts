import { describe, expect, it } from 'vitest';
import type { RowDTO } from '@suivi/shared';
import { groupByMonth } from '../page';

function ligne(month: string, archived = false): RowDTO {
  return {
    id: `${month}-${archived ? 'a' : 'v'}-${Math.random().toString(36).slice(2, 6)}`,
    month,
    position: 0,
    data: {},
    formats: {},
    version: 0,
    archived,
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

describe('groupByMonth — ordre des groupes de résultats', () => {
  it('classe les mois du plus récent au plus ancien, archives en dernier', () => {
    const rows = [
      ligne('2026-06'),
      ligne('2025-12', true),
      ligne('2026-08'),
      ligne('2026-07'),
      ligne('2026-08'),
    ];
    const groupes = groupByMonth(rows).map(([cle]) => cle);
    expect(groupes).toEqual(['2026-08', '2026-07', '2026-06', 'archives']);
  });

  it("conserve l'ordre de l'API à l'intérieur d'un groupe", () => {
    const a = ligne('2026-08');
    const b = ligne('2026-08');
    const [, lignesDuMois] = groupByMonth([a, b])[0];
    expect(lignesDuMois.map((l) => l.id)).toEqual([a.id, b.id]);
  });
});
