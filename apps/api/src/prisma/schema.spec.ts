import { ColumnType, Prisma } from '@prisma/client';

describe('Schéma Prisma', () => {
  it('expose les cinq modèles du contrat', () => {
    expect(Prisma.ModelName.User).toBe('User');
    expect(Prisma.ModelName.Column).toBe('Column');
    expect(Prisma.ModelName.Choice).toBe('Choice');
    expect(Prisma.ModelName.Row).toBe('Row');
    expect(Prisma.ModelName.RowEvent).toBe('RowEvent');
  });

  it('expose les sept types de colonne du contrat', () => {
    expect(Object.values(ColumnType).sort()).toEqual([
      'DATE',
      'LINK',
      'LONGTEXT',
      'NUMBER',
      'SELECT',
      'TEXT',
      'TIME',
    ]);
  });
});
