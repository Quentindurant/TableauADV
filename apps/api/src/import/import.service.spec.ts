import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { buildTestWorkbookBuffer } from '../../test/helpers/build-workbook';
import { importWorkbook } from './import.service';

/**
 * Ces tests ne vérifient pas un vrai ROLLBACK Postgres : le simuler demanderait
 * d'injecter une panne au milieu d'une vraie transaction (hors périmètre d'un
 * test unitaire, cf. les e2e qui couvrent le comportement fonctionnel avec une
 * vraie base). Ils vérifient la condition structurelle qui rend ce rollback
 * automatique possible côté Prisma : purge, colonnes/choix et lignes passent
 * TOUJOURS par le client `tx` d'un unique `$transaction`, jamais par le client
 * externe, et une erreur survenue à n'importe quelle étape interrompt
 * immédiatement la suite (aucune écriture « rattrapée » après coup). La
 * garantie de rollback elle-même est déléguée à Prisma/Postgres.
 */

interface FailSpec {
  model: string;
  method: string;
  /** Nombre d'appels réussis avant que l'appel suivant échoue. */
  afterCalls: number;
}

function buildFakeTx(callLog: string[], failOn?: FailSpec) {
  const counts: Record<string, number> = {};
  let nextColumnId = 0;

  function make(model: string, method: string, produce: (...args: unknown[]) => unknown) {
    return jest.fn((...args: unknown[]) => {
      const key = `${model}.${method}`;
      counts[key] = (counts[key] ?? 0) + 1;
      if (failOn && key === `${failOn.model}.${failOn.method}` && counts[key] > failOn.afterCalls) {
        return Promise.reject(new Error(`échec simulé sur ${key}`));
      }
      callLog.push(key);
      return Promise.resolve(produce(...args));
    });
  }

  return {
    rowEvent: { deleteMany: make('rowEvent', 'deleteMany', () => ({ count: 0 })) },
    row: {
      deleteMany: make('row', 'deleteMany', () => ({ count: 0 })),
      createMany: make('row', 'createMany', () => ({ count: 0 })),
    },
    choice: {
      deleteMany: make('choice', 'deleteMany', () => ({ count: 0 })),
      createMany: make('choice', 'createMany', () => ({ count: 0 })),
    },
    column: {
      deleteMany: make('column', 'deleteMany', () => ({ count: 0 })),
      create: make('column', 'create', () => ({ id: `col-${++nextColumnId}` })),
    },
  };
}

describe('importWorkbook — atomicité de la transaction (unit)', () => {
  let chemin: string;

  beforeAll(async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'suivi-import-unit-'));
    chemin = join(dossier, 'classeur.xlsx');
    await writeFile(chemin, await buildTestWorkbookBuffer());
  });

  it('route toute l’écriture (purge, colonnes/choix, lignes) par le client transactionnel unique, avec un timeout explicite', async () => {
    const callLog: string[] = [];
    const tx = buildFakeTx(callLog);
    const transaction = jest.fn((callback: (tx: unknown) => unknown) => callback(tx)) as jest.Mock<
      unknown,
      [callback: (tx: unknown) => unknown, options?: { timeout: number; maxWait: number }]
    >;
    const prisma = {
      $transaction: transaction,
      // Le client externe ne doit jamais être sollicité directement pour
      // l'écriture : s'il l'était, ces appels rejetteraient et feraient
      // échouer le test.
      column: { create: jest.fn().mockRejectedValue(new Error('appelé hors transaction')) },
      row: { createMany: jest.fn().mockRejectedValue(new Error('appelé hors transaction')) },
    } as unknown as PrismaClient;

    await importWorkbook(prisma, chemin);

    expect(transaction).toHaveBeenCalledTimes(1);
    // Options de timeout explicites (le défaut Prisma de 5s ne suffit pas
    // pour 88 choix + lot de lignes, cf. finding majeur du brief).
    const options = transaction.mock.calls[0][1];
    expect(options?.timeout).toBeGreaterThanOrEqual(60_000);
    expect(options?.maxWait).toBeGreaterThan(0);

    expect(callLog.slice(0, 4)).toEqual([
      'rowEvent.deleteMany',
      'row.deleteMany',
      'choice.deleteMany',
      'column.deleteMany',
    ]);
    expect(callLog).toContain('column.create');
    expect(callLog).toContain('choice.createMany');
    expect(callLog).toContain('row.createMany');
  });

  it("interrompt immédiatement toute écriture ultérieure dès qu'une étape échoue dans la transaction, et propage l'erreur", async () => {
    const callLog: string[] = [];
    // Échoue à la 3e colonne (sur 17, aucune des deux premières — impe, no —
    // n'a de choix associé) : si le code n'était pas transactionnel, ces 2 colonnes
    // resteraient créées et l'import continuerait sur les feuilles suivantes.
    const tx = buildFakeTx(callLog, { model: 'column', method: 'create', afterCalls: 2 });
    const transaction = jest.fn((callback: (tx: unknown) => unknown) => callback(tx));
    const prisma = { $transaction: transaction } as unknown as PrismaClient;

    await expect(importWorkbook(prisma, chemin)).rejects.toThrow('échec simulé sur column.create');

    expect(callLog.filter((appel) => appel === 'column.create')).toHaveLength(2);
    expect(callLog).not.toContain('choice.createMany');
    expect(callLog).not.toContain('row.createMany');
  });
});
