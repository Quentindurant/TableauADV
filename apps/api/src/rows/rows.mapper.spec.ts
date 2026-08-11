import type { Row } from '@prisma/client';
import { toRowDTO } from './rows.mapper';

function fakeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'row_1',
    month: '2026-08',
    position: 3,
    data: { client: 'ARCADIA', num_chrono: 78 },
    formats: { num_chrono: { bg: '#FF0000' } },
    version: 5,
    archived: false,
    createdBy: 'user_1',
    createdAt: new Date('2026-08-01T08:00:00.000Z'),
    updatedAt: new Date('2026-08-10T12:34:56.000Z'),
    ...overrides,
  } as Row;
}

describe('toRowDTO', () => {
  it('projette la ligne Prisma sur le contrat RowDTO', () => {
    expect(toRowDTO(fakeRow())).toEqual({
      id: 'row_1',
      month: '2026-08',
      position: 3,
      data: { client: 'ARCADIA', num_chrono: 78 },
      formats: { num_chrono: { bg: '#FF0000' } },
      version: 5,
      archived: false,
      updatedAt: '2026-08-10T12:34:56.000Z',
    });
  });

  it('n expose ni createdBy ni createdAt', () => {
    const dto = toRowDTO(fakeRow());
    expect('createdBy' in dto).toBe(false);
    expect('createdAt' in dto).toBe(false);
  });

  it('normalise data et formats absents en objets vides', () => {
    const dto = toRowDTO(fakeRow({ data: null, formats: null }));
    expect(dto.data).toEqual({});
    expect(dto.formats).toEqual({});
  });
});
