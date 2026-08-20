import { Workbook } from 'exceljs';
import request from 'supertest';
import type { ImportFusionReportDTO } from '@suivi/shared';
import { seed } from '../prisma/seed';
import { RealtimeEmitter } from '../src/realtime/realtime.emitter';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

const ENTETE = [
  'IMPE',
  'CLIENT',
  'DPT',
  'CP CLIENT',
  'PARTE',
  'DATE',
  'PORTA ET COMMENTAIRES IMPORTANT',
  'HEURE',
  'TECH',
  'NOM TECH',
  'NOM CP',
  'INSTALLATION',
  'COMMENTAIRES PLANIF',
  'MATERIEL RECU',
  'N° CHRONO',
  'INFOS FACTURATION',
];

/**
 * Classeur de fusion : un onglet AOUT 2026 avec
 * - ARCADIA : correspondance non ambigüe (ajoute impe, cellule tech vide) ;
 * - CABINET LATES : ambigu (2 lignes en base) ;
 * - NOUVEAU CLIENT : création, avec un statut hors liste ;
 * - une ligne entièrement vide (ignorée).
 */
async function classeurFusion(): Promise<Buffer> {
  const workbook = new Workbook();
  const feuille = workbook.addWorksheet('AOUT 2026');
  feuille.addRow(ENTETE);
  feuille.addRow([
    new Date(Date.UTC(2026, 7, 3)),
    'Arcadia ',
    '49',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  feuille.addRow([
    null,
    'CABINET LATES',
    '2A',
    null, null, null, null, null, null, null, null, null, null, null, null, null,
  ]);
  feuille.addRow([
    null,
    'NOUVEAU CLIENT',
    null, null, null, null, null, null, null, null, null,
    'STATUT HORS LISTE',
    null, null, null, null,
  ]);
  feuille.addRow([null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}

describe('POST /api/import — fusion incrémentale (e2e)', () => {
  let ctx: TestContext;
  let cookie: string[];
  let userId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    await seed(ctx.prisma);
    ({ userId, cookie } = await seedUserAndLogin(ctx, 'import.fusion@test.fr'));
  }, 120000);

  afterAll(async () => {
    await ctx.prisma.rowEvent.deleteMany();
    await ctx.prisma.row.deleteMany();
    await ctx.prisma.user.deleteMany();
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.prisma.rowEvent.deleteMany();
    await ctx.prisma.row.deleteMany();
  });

  async function creerLignesDeBase(): Promise<{ arcadiaId: string; lates1: string; lates2: string; intouchableId: string }> {
    const arcadia = await ctx.prisma.row.create({
      data: {
        month: '2026-08',
        position: 0,
        data: { client: 'ARCADIA', tech: 'DIRECT', commentaires_planif: 'RAS' },
        createdBy: userId,
      },
    });
    const lates1 = await ctx.prisma.row.create({
      data: { month: '2026-08', position: 1, data: { client: 'CABINET LATES' }, createdBy: userId },
    });
    const lates2 = await ctx.prisma.row.create({
      data: { month: '2026-08', position: 2, data: { client: 'CABINET LATES' }, createdBy: userId },
    });
    const intouchable = await ctx.prisma.row.create({
      data: {
        month: '2026-08',
        position: 3,
        data: { client: 'INTOUCHABLE', tech: 'DIRECT' },
        createdBy: userId,
      },
    });
    return { arcadiaId: arcadia.id, lates1: lates1.id, lates2: lates2.id, intouchableId: intouchable.id };
  }

  it('exige une session (401 sans cookie)', async () => {
    await request(ctx.app.getHttpServer())
      .post('/api/import')
      .attach('file', await classeurFusion(), 'classeur.xlsx')
      .expect(401);
  });

  it('refuse une requête sans fichier (422 VALIDATION_FAILED)', async () => {
    const reponse = await request(ctx.app.getHttpServer())
      .post('/api/import')
      .set('Cookie', cookie)
      .expect(422);
    expect(reponse.body.code).toBe('VALIDATION_FAILED');
  });

  it('refuse un fichier non xlsx (422 VALIDATION_FAILED)', async () => {
    const reponse = await request(ctx.app.getHttpServer())
      .post('/api/import')
      .set('Cookie', cookie)
      .attach('file', Buffer.from('pas un classeur'), 'donnees.csv')
      .expect(422);
    expect(reponse.body.code).toBe('VALIDATION_FAILED');
  });

  it('fusionne un onglet-mois : mise à jour non ambigüe, création, ambiguïté intacte, jamais de suppression', async () => {
    const ids = await creerLignesDeBase();
    const emitter = ctx.app.get(RealtimeEmitter);
    const espionCreation = jest.spyOn(emitter, 'emitRowCreated');
    const espionMaj = jest.spyOn(emitter, 'emitRowUpdated');

    const reponse = await request(ctx.app.getHttpServer())
      .post('/api/import')
      .set('Cookie', cookie)
      .attach('file', await classeurFusion(), 'classeur.xlsx')
      .expect(201);

    const rapport = reponse.body as ImportFusionReportDTO;
    expect(rapport.erreurs).toEqual([]);
    expect(rapport.parOnglet).toHaveLength(1);
    expect(rapport.parOnglet[0]).toMatchObject({
      mois: '2026-08',
      creees: 1,
      misesAJour: 1,
      inchangees: 0,
    });
    expect(rapport.parOnglet[0].ambiguites).toHaveLength(1);
    expect(rapport.parOnglet[0].ambiguites[0]).toMatchObject({
      client: 'CABINET LATES',
      lignesBase: [ids.lates1, ids.lates2],
    });
    // Valeur hors liste importée telle quelle ET signalée.
    expect(rapport.parOnglet[0].horsListe.join(' ')).toContain('STATUT HORS LISTE');

    // ARCADIA : impe ajouté, dpt ajouté, tech/commentaires intacts, version incrémentée.
    const arcadia = await ctx.prisma.row.findUniqueOrThrow({ where: { id: ids.arcadiaId } });
    expect(arcadia.data).toMatchObject({
      client: 'ARCADIA',
      impe: '2026-08-03',
      dpt: '49',
      tech: 'DIRECT',
      commentaires_planif: 'RAS',
    });
    expect(arcadia.version).toBe(1);

    // Journal : un RowEvent update pour ARCADIA, un create pour la nouvelle ligne.
    const evenements = await ctx.prisma.rowEvent.findMany({ where: { rowId: ids.arcadiaId } });
    expect(evenements).toHaveLength(1);
    expect(evenements[0].type).toBe('update');

    // CABINET LATES (ambigu) : rien n'a bougé.
    for (const id of [ids.lates1, ids.lates2]) {
      const ligne = await ctx.prisma.row.findUniqueOrThrow({ where: { id } });
      expect(ligne.version).toBe(0);
      expect(ligne.data).toEqual({ client: 'CABINET LATES' });
    }

    // INTOUCHABLE (absente du fichier) : intacte — jamais de suppression.
    const intouchable = await ctx.prisma.row.findUniqueOrThrow({ where: { id: ids.intouchableId } });
    expect(intouchable.data).toEqual({ client: 'INTOUCHABLE', tech: 'DIRECT' });

    // NOUVEAU CLIENT : créée en fin de mois avec la valeur hors liste telle quelle.
    const nouvelle = await ctx.prisma.row.findFirstOrThrow({
      where: { month: '2026-08', data: { path: ['client'], equals: 'NOUVEAU CLIENT' } },
    });
    expect(nouvelle.position).toBe(4);
    expect(nouvelle.archived).toBe(false);
    expect((nouvelle.data as Record<string, string>).statut).toBe('STATUT HORS LISTE');

    // Temps réel APRÈS commit : un row.created (création) + un row.updated (fusion).
    expect(espionCreation).toHaveBeenCalledTimes(1);
    expect(espionMaj).toHaveBeenCalledTimes(1);
    expect(espionMaj.mock.calls[0][0].id).toBe(ids.arcadiaId);
    expect(espionMaj.mock.calls[0][1]).toEqual(expect.arrayContaining(['impe', 'dpt']));
  });

  it('est idempotent : rejouer le même fichier ne crée rien et ne modifie rien', async () => {
    await creerLignesDeBase();

    await request(ctx.app.getHttpServer())
      .post('/api/import')
      .set('Cookie', cookie)
      .attach('file', await classeurFusion(), 'classeur.xlsx')
      .expect(201);

    const deuxieme = await request(ctx.app.getHttpServer())
      .post('/api/import')
      .set('Cookie', cookie)
      .attach('file', await classeurFusion(), 'classeur.xlsx')
      .expect(201);

    const rapport = deuxieme.body as ImportFusionReportDTO;
    expect(rapport.parOnglet[0]).toMatchObject({ creees: 0, misesAJour: 0, inchangees: 2 });
    expect(await ctx.prisma.row.count({ where: { month: '2026-08' } })).toBe(5);
  });
});
