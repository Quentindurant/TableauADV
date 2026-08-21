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
      // La feuille fait foi : NOUVEAU CLIENT remonte en position 1, les
      // lignes hors feuille (ambiguës + INTOUCHABLE) glissent après le bloc.
      reordonnees: 4,
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

    // NOUVEAU CLIENT : créée avec la valeur hors liste telle quelle, placée
    // selon la feuille (juste après ARCADIA).
    const nouvelle = await ctx.prisma.row.findFirstOrThrow({
      where: { month: '2026-08', data: { path: ['client'], equals: 'NOUVEAU CLIENT' } },
    });
    expect(nouvelle.position).toBe(1);
    expect(nouvelle.archived).toBe(false);
    expect((nouvelle.data as Record<string, string>).statut).toBe('STATUT HORS LISTE');

    // Ordre final du mois = bloc feuille (ARCADIA, NOUVEAU CLIENT) puis les
    // lignes hors feuille dans leur ordre relatif d'origine.
    const ordonnees = await ctx.prisma.row.findMany({
      where: { month: '2026-08' },
      orderBy: { position: 'asc' },
    });
    expect(ordonnees.map((ligne) => (ligne.data as Record<string, string>).client)).toEqual([
      'ARCADIA',
      'NOUVEAU CLIENT',
      'CABINET LATES',
      'CABINET LATES',
      'INTOUCHABLE',
    ]);
    expect(ordonnees.map((ligne) => ligne.position)).toEqual([0, 1, 2, 3, 4]);

    // Le réordonnancement ne consigne aucun RowEvent (même précédent que le
    // renumérotage du move manuel) et ne touche pas les versions.
    expect(await ctx.prisma.rowEvent.count({ where: { type: 'move' } })).toBe(0);

    // Temps réel APRÈS commit : un row.created (position finale) + un
    // row.updated de fusion (ARCADIA) + un row.updated par ligne repositionnée
    // (changedKeys vides, version intacte) — le contrat déjà digéré du front.
    expect(espionCreation).toHaveBeenCalledTimes(1);
    expect(espionCreation.mock.calls[0][0].position).toBe(1);
    expect(espionMaj).toHaveBeenCalledTimes(4);
    expect(espionMaj.mock.calls[0][0].id).toBe(ids.arcadiaId);
    expect(espionMaj.mock.calls[0][1]).toEqual(expect.arrayContaining(['impe', 'dpt']));
    const repositionnees = espionMaj.mock.calls.slice(1);
    expect(repositionnees.map(([dto]) => [dto.id, dto.position])).toEqual([
      [ids.lates1, 2],
      [ids.lates2, 3],
      [ids.intouchableId, 4],
    ]);
    for (const [dto, changedKeys] of repositionnees) {
      expect(changedKeys).toEqual([]);
      expect(dto.version).toBe(0);
    }
  });

  it('est idempotent : rejouer le même fichier ne crée rien, ne modifie rien, ne réordonne rien', async () => {
    await creerLignesDeBase();

    await request(ctx.app.getHttpServer())
      .post('/api/import')
      .set('Cookie', cookie)
      .attach('file', await classeurFusion(), 'classeur.xlsx')
      .expect(201);

    const apresPremier = await ctx.prisma.row.findMany({
      where: { month: '2026-08' },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    });

    const deuxieme = await request(ctx.app.getHttpServer())
      .post('/api/import')
      .set('Cookie', cookie)
      .attach('file', await classeurFusion(), 'classeur.xlsx')
      .expect(201);

    const rapport = deuxieme.body as ImportFusionReportDTO;
    expect(rapport.parOnglet[0]).toMatchObject({
      creees: 0,
      misesAJour: 0,
      inchangees: 2,
      reordonnees: 0,
    });
    expect(await ctx.prisma.row.count({ where: { month: '2026-08' } })).toBe(5);

    // L'ordre du mois est strictement inchangé au rejeu.
    const apresSecond = await ctx.prisma.row.findMany({
      where: { month: '2026-08' },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    });
    expect(apresSecond).toEqual(apresPremier);
  });

  it("réordonne les lignes appariées selon la feuille, lignes hors fichier après le bloc et intactes", async () => {
    // Base : ARCADIA(0), BRAVO(1), INTOUCHABLE(2) — la feuille liste BRAVO puis ARCADIA.
    const arcadia = await ctx.prisma.row.create({
      data: { month: '2026-08', position: 0, data: { client: 'ARCADIA' }, createdBy: userId },
    });
    const bravo = await ctx.prisma.row.create({
      data: { month: '2026-08', position: 1, data: { client: 'BRAVO' }, createdBy: userId },
    });
    const intouchable = await ctx.prisma.row.create({
      data: {
        month: '2026-08',
        position: 2,
        data: { client: 'INTOUCHABLE', tech: 'DIRECT' },
        createdBy: userId,
      },
    });

    const workbook = new Workbook();
    const feuille = workbook.addWorksheet('AOUT 2026');
    feuille.addRow(ENTETE);
    feuille.addRow([null, 'BRAVO', null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
    feuille.addRow([null, 'ARCADIA', null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
    const classeur = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;

    const emitter = ctx.app.get(RealtimeEmitter);
    const espionMaj = jest.spyOn(emitter, 'emitRowUpdated');
    espionMaj.mockClear();

    const premiere = await request(ctx.app.getHttpServer())
      .post('/api/import')
      .set('Cookie', cookie)
      .attach('file', classeur, 'classeur.xlsx')
      .expect(201);

    expect((premiere.body as ImportFusionReportDTO).parOnglet[0]).toMatchObject({
      creees: 0,
      misesAJour: 0,
      inchangees: 2,
      reordonnees: 2,
    });

    // Ordre final : BRAVO, ARCADIA (feuille) puis INTOUCHABLE (hors fichier, intacte).
    const ordonnees = await ctx.prisma.row.findMany({
      where: { month: '2026-08' },
      orderBy: { position: 'asc' },
    });
    expect(ordonnees.map((ligne) => ligne.id)).toEqual([bravo.id, arcadia.id, intouchable.id]);
    expect(ordonnees.map((ligne) => ligne.position)).toEqual([0, 1, 2]);
    // Contenu et versions intacts : seul `position` a bougé.
    for (const ligne of ordonnees) {
      expect(ligne.version).toBe(0);
    }
    expect(ordonnees[2].data).toEqual({ client: 'INTOUCHABLE', tech: 'DIRECT' });
    expect(await ctx.prisma.rowEvent.count()).toBe(0);

    // Deux row.updated de repositionnement (changedKeys vides), INTOUCHABLE muette.
    expect(espionMaj).toHaveBeenCalledTimes(2);
    expect(espionMaj.mock.calls.map(([dto, cles]) => [dto.id, dto.position, cles])).toEqual([
      [bravo.id, 0, []],
      [arcadia.id, 1, []],
    ]);

    // Rejeu : la base est déjà dans l'ordre feuille — zéro réordonnancement.
    espionMaj.mockClear();
    const seconde = await request(ctx.app.getHttpServer())
      .post('/api/import')
      .set('Cookie', cookie)
      .attach('file', classeur, 'classeur.xlsx')
      .expect(201);
    expect((seconde.body as ImportFusionReportDTO).parOnglet[0]).toMatchObject({
      inchangees: 2,
      reordonnees: 0,
    });
    expect(espionMaj).not.toHaveBeenCalled();
  });
});
