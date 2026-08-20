import type { Row } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RowEventsService } from '../events/row-events.service';
import type { RealtimeEmitter } from '../realtime/realtime.emitter';
import { ImportFusionService } from './fusion.service';

/**
 * Garde optimiste d'`appliquerPlan` : l'instantané des lignes actives est lu
 * sans `FOR UPDATE`, un PATCH concurrent peut committer pendant la fusion.
 * L'update filtré sur `version` doit alors laisser la ligne intacte et la
 * consigner en conflit — jamais d'écrasement silencieux ni de version rejouée.
 */
function ligneBase(): Row {
  return {
    id: 'r1',
    month: '2026-08',
    position: 0,
    data: { client: 'ARCADIA' },
    formats: {},
    version: 3,
    archived: false,
    createdBy: 'u1',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  } as unknown as Row;
}

const LIGNE_FICHIER = { numero: 2, data: { client: 'Arcadia ', dpt: '49' }, formats: {} };

function creerService(events: RowEventsService): ImportFusionService {
  return new ImportFusionService(
    {} as unknown as PrismaService,
    events,
    { emitRowCreated: jest.fn(), emitRowUpdated: jest.fn() } as unknown as RealtimeEmitter,
  );
}

describe('ImportFusionService — garde de version pendant la fusion', () => {
  it("consigne un conflit et n'écrit aucun événement si la ligne a bougé depuis l'instantané", async () => {
    const events = { record: jest.fn() } as unknown as RowEventsService;
    const tx = {
      row: {
        findMany: jest.fn().mockResolvedValue([ligneBase()]),
        // Un PATCH concurrent a déjà committé : la version 3 n'existe plus.
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn(),
      },
    };

    const service = creerService(events);
    const resultat = await service['appliquerPlan'](
      tx as never,
      '2026-08',
      [LIGNE_FICHIER],
      'u1',
    );

    expect(tx.row.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1', version: 3 } }),
    );
    expect(resultat.majs).toHaveLength(0);
    expect(resultat.conflits).toEqual([
      expect.objectContaining({ client: 'ARCADIA', lignesBase: ['r1'] }),
    ]);
    expect(events.record).not.toHaveBeenCalled();
    expect(tx.row.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('applique la mise à jour et journalise version + 1 quand la version est intacte', async () => {
    const events = { record: jest.fn() } as unknown as RowEventsService;
    const enregistree = { ...ligneBase(), data: { client: 'ARCADIA', dpt: '49' }, version: 4 };
    const tx = {
      row: {
        findMany: jest.fn().mockResolvedValue([ligneBase()]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(enregistree),
      },
    };

    const service = creerService(events);
    const resultat = await service['appliquerPlan'](
      tx as never,
      '2026-08',
      [LIGNE_FICHIER],
      'u1',
    );

    expect(resultat.conflits).toHaveLength(0);
    expect(resultat.majs).toEqual([{ row: enregistree, changedKeys: ['dpt'] }]);
    expect(events.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        rowId: 'r1',
        type: 'update',
        payload: expect.objectContaining({ version: 4, changedKeys: ['dpt'] }),
      }),
    );
  });
});
