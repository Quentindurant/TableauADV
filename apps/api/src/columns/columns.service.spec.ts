import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { ColumnsService } from './columns.service';

/** Simule la violation Postgres de contrainte unique (P2002) que Prisma remonte. */
function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`key`)',
    { code: 'P2002', clientVersion: '6.19.3' },
  );
}

describe('ColumnsService', () => {
  describe('create', () => {
    it('convertit une violation P2002 concurrente (course sur la clé) en 422 VALIDATION_FAILED', async () => {
      const tx = {
        column: {
          findMany: jest.fn().mockResolvedValue([]),
          aggregate: jest.fn().mockResolvedValue({ _max: { position: null } }),
          create: jest.fn().mockRejectedValue(uniqueConstraintError()),
        },
      };
      const transaction = jest.fn((callback: (tx: unknown) => unknown) => callback(tx));
      const prisma = { $transaction: transaction } as unknown as PrismaService;

      const service = new ColumnsService(prisma);

      const error = await service.create({ label: 'Statut', type: 'TEXT' }).then(
        () => {
          throw new Error('aurait dû échouer');
        },
        (e) => e,
      );

      expect(error).toMatchObject({
        code: 'VALIDATION_FAILED',
        userMessage: 'Une colonne portant ce nom existe déjà.',
      });
      expect(error.getStatus()).toBe(422);
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('laisse fuiter les erreurs qui ne sont pas des violations de contrainte unique', async () => {
      const boom = new Error('panne inattendue');
      const tx = {
        column: {
          findMany: jest.fn().mockResolvedValue([]),
          aggregate: jest.fn().mockResolvedValue({ _max: { position: null } }),
          create: jest.fn().mockRejectedValue(boom),
        },
      };
      const prisma = {
        $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
      } as unknown as PrismaService;

      const service = new ColumnsService(prisma);

      await expect(service.create({ label: 'Statut', type: 'TEXT' })).rejects.toBe(boom);
    });
  });
});
