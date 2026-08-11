import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RealtimeEmitter } from '../realtime/realtime.emitter';
import { ChoicesService } from './choices.service';

/** Simule la violation Postgres de contrainte unique (P2002) que Prisma remonte. */
function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`columnId`,`label`)',
    { code: 'P2002', clientVersion: '6.19.3' },
  );
}

/** Émetteur factice : ces tests couvrent des chemins d'erreur avant toute émission. */
function fakeEmitter(): RealtimeEmitter {
  return { emitConfigChanged: jest.fn() } as unknown as RealtimeEmitter;
}

describe('ChoicesService', () => {
  describe('create', () => {
    it('convertit une violation P2002 concurrente en 422 avec le même message que le pré-check', async () => {
      const tx = {
        choice: {
          findFirst: jest.fn().mockResolvedValue(null), // pré-check : pas de doublon détecté
          aggregate: jest.fn().mockResolvedValue({ _max: { position: null } }),
          create: jest.fn().mockRejectedValue(uniqueConstraintError()),
        },
      };
      const prisma = {
        column: {
          findUnique: jest.fn().mockResolvedValue({ id: 'c1', label: 'Statut', type: 'SELECT' }),
        },
        $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
      } as unknown as PrismaService;

      const service = new ChoicesService(prisma, fakeEmitter());

      const error = await service.create('c1', { label: 'Nouveau' }).then(
        () => {
          throw new Error('aurait dû échouer');
        },
        (e) => e,
      );

      expect(error).toMatchObject({
        code: 'VALIDATION_FAILED',
        userMessage: 'La valeur « Nouveau » existe déjà dans cette liste.',
      });
      expect(error.getStatus()).toBe(422);
    });

    it('laisse fuiter les erreurs qui ne sont pas des violations de contrainte unique', async () => {
      const boom = new Error('panne inattendue');
      const tx = {
        choice: {
          findFirst: jest.fn().mockResolvedValue(null),
          aggregate: jest.fn().mockResolvedValue({ _max: { position: null } }),
          create: jest.fn().mockRejectedValue(boom),
        },
      };
      const prisma = {
        column: {
          findUnique: jest.fn().mockResolvedValue({ id: 'c1', label: 'Statut', type: 'SELECT' }),
        },
        $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
      } as unknown as PrismaService;

      const service = new ChoicesService(prisma, fakeEmitter());

      await expect(service.create('c1', { label: 'Nouveau' })).rejects.toBe(boom);
    });
  });

  describe('update', () => {
    function existingChoice() {
      return {
        id: 'ch1',
        columnId: 'c1',
        label: 'Ancien',
        bgColor: null,
        textColor: null,
        bold: false,
        position: 0,
        archived: false,
        column: { key: 'statut', label: 'Statut' },
      };
    }

    it('convertit une violation P2002 concurrente en 422 avec le même message que le pré-check', async () => {
      const tx = {
        choice: {
          count: jest.fn().mockResolvedValue(1),
          updateMany: jest.fn(),
          update: jest.fn().mockRejectedValue(uniqueConstraintError()),
        },
        $executeRaw: jest.fn(),
      };
      const prisma = {
        choice: {
          findUnique: jest.fn().mockResolvedValue(existingChoice()),
          findFirst: jest.fn().mockResolvedValue(null), // pré-check hors transaction : pas de doublon détecté
        },
        $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
      } as unknown as PrismaService;

      const service = new ChoicesService(prisma, fakeEmitter());

      const error = await service.update('ch1', { label: 'Nouveau' }).then(
        () => {
          throw new Error('aurait dû échouer');
        },
        (e) => e,
      );

      expect(error).toMatchObject({
        code: 'VALIDATION_FAILED',
        userMessage: 'La valeur « Nouveau » existe déjà dans cette liste.',
      });
      expect(error.getStatus()).toBe(422);
    });

    it('laisse fuiter les erreurs qui ne sont pas des violations de contrainte unique', async () => {
      const boom = new Error('panne inattendue');
      const tx = {
        choice: {
          count: jest.fn().mockResolvedValue(1),
          updateMany: jest.fn(),
          update: jest.fn().mockRejectedValue(boom),
        },
        $executeRaw: jest.fn(),
      };
      const prisma = {
        choice: {
          findUnique: jest.fn().mockResolvedValue(existingChoice()),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
      } as unknown as PrismaService;

      const service = new ChoicesService(prisma, fakeEmitter());

      await expect(service.update('ch1', { label: 'Nouveau' })).rejects.toBe(boom);
    });
  });
});
