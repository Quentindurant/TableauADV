import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('Report des dossiers au mois suivant (e2e)', () => {
  let ctx: TestContext;
  let cookie: string[];
  let userId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    const session = await seedUserAndLogin(ctx);
    cookie = session.cookie;
    userId = session.userId;
  });

  interface SeedLigne {
    client: string;
    date?: string;
    statut?: string;
    archived?: boolean;
    formats?: Record<string, { bg?: string }>;
    version?: number;
  }

  /** Sème un mois : positions 0..n-1 dans l'ordre du tableau fourni. */
  async function seedMonth(month: string, lignes: SeedLigne[]): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 0; index < lignes.length; index += 1) {
      const ligne = lignes[index];
      const data: Record<string, string> = { client: ligne.client };
      if (ligne.date !== undefined) {
        data.date = ligne.date;
      }
      if (ligne.statut !== undefined) {
        data.statut = ligne.statut;
      }
      const row = await ctx.prisma.row.create({
        data: {
          month,
          position: index,
          data,
          formats: ligne.formats ?? {},
          version: ligne.version ?? 0,
          archived: ligne.archived ?? false,
        },
      });
      ids.push(row.id);
    }
    return ids;
  }

  function preview(to: string): request.Test {
    return request(ctx.app.getHttpServer())
      .get(`/api/months/report-preview?to=${to}`)
      .set('Cookie', cookie);
  }

  function report(to: string): request.Test {
    return request(ctx.app.getHttpServer())
      .post('/api/months/report')
      .set('Cookie', cookie)
      .send({ to });
  }

  describe('GET /api/months/report-preview', () => {
    it('compte une ligne dont la date tombe dans le mois cible, pas celle d un autre mois', async () => {
      await seedMonth('2026-08', [
        { client: 'ALPHA', date: '2026-09-15' },
        { client: 'BETA', date: '2026-08-20' },
        { client: 'GAMMA', date: '2026-10-01' },
      ]);

      const res = await preview('2026-09').expect(200);
      expect(res.body).toEqual({ from: '2026-08', count: 1 });
    });

    it('compte les lignes sans date ou à date vide', async () => {
      await seedMonth('2026-08', [
        { client: 'SANS-DATE' },
        { client: 'DATE-VIDE', date: '' },
        { client: 'AUTRE-MOIS', date: '2026-08-05' },
      ]);

      const res = await preview('2026-09').expect(200);
      expect(res.body).toEqual({ from: '2026-08', count: 2 });
    });

    it('exclut CLOTUREE et ANNULEE même sans date', async () => {
      await seedMonth('2026-08', [
        { client: 'FINI', statut: 'CLOTUREE' },
        { client: 'ABANDONNE', statut: 'ANNULEE', date: '2026-09-10' },
        { client: 'EN-COURS', statut: 'EN COURS' },
      ]);

      const res = await preview('2026-09').expect(200);
      expect(res.body).toEqual({ from: '2026-08', count: 1 });
    });

    it('exclut les lignes archivées', async () => {
      await seedMonth('2026-08', [
        { client: 'ACTIF', date: '2026-09-02' },
        { client: 'ARCHIVE', date: '2026-09-03', archived: true },
      ]);

      const res = await preview('2026-09').expect(200);
      expect(res.body).toEqual({ from: '2026-08', count: 1 });
    });

    it('retourne from null et count 0 sans aucun mois antérieur', async () => {
      const res = await preview('2026-09').expect(200);
      expect(res.body).toEqual({ from: null, count: 0 });
    });

    it('prend le dernier mois actif comme source même avec des mois à trous', async () => {
      await seedMonth('2026-03', [{ client: 'VIEUX' }]);
      await seedMonth('2026-06', [{ client: 'RECENT' }]);
      // Mois plus récent mais entièrement archivé : ignoré.
      await seedMonth('2026-07', [{ client: 'FANTOME', archived: true }]);

      const res = await preview('2026-09').expect(200);
      expect(res.body).toEqual({ from: '2026-06', count: 1 });
    });

    it('ne modifie rien en base', async () => {
      await seedMonth('2026-08', [{ client: 'ALPHA' }]);
      await preview('2026-09').expect(200);

      expect(await ctx.prisma.row.count()).toBe(1);
      expect(await ctx.prisma.rowEvent.count()).toBe(0);
    });

    it('refuse un mois mal formé : 422 VALIDATION_FAILED', async () => {
      const res = await preview('2026-13').expect(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('refuse un visiteur non authentifié : 401', async () => {
      await request(ctx.app.getHttpServer())
        .get('/api/months/report-preview?to=2026-09')
        .expect(401);
    });
  });

  describe('POST /api/months/report', () => {
    it('recopie les candidates vers le mois cible sans toucher au mois source', async () => {
      await seedMonth('2026-08', [
        { client: 'ALPHA', date: '2026-09-15' },
        { client: 'BETA', date: '2026-08-20', statut: 'CLOTUREE' },
        { client: 'GAMMA' },
      ]);

      const res = await report('2026-09').expect(201);
      expect(res.body).toEqual({ from: '2026-08', created: 2 });

      const cibles = await ctx.prisma.row.findMany({
        where: { month: '2026-09' },
        orderBy: { position: 'asc' },
      });
      expect(cibles.map((row) => (row.data as { client: string }).client)).toEqual([
        'ALPHA',
        'GAMMA',
      ]);
      // Le mois source reste intact : aucune ligne déplacée ni modifiée.
      const sources = await ctx.prisma.row.findMany({
        where: { month: '2026-08' },
        orderBy: { position: 'asc' },
      });
      expect(sources).toHaveLength(3);
      expect(sources.map((row) => row.position)).toEqual([0, 1, 2]);
    });

    it('préserve l ordre relatif du mois source en positions 0..n-1', async () => {
      await seedMonth('2026-08', [
        { client: 'A', date: '2026-09-01' },
        { client: 'B', date: '2026-08-15' },
        { client: 'C' },
        { client: 'D', date: '2026-09-30' },
      ]);

      await report('2026-09').expect(201);

      const cibles = await ctx.prisma.row.findMany({
        where: { month: '2026-09' },
        orderBy: { position: 'asc' },
      });
      expect(cibles.map((row) => (row.data as { client: string }).client)).toEqual([
        'A',
        'C',
        'D',
      ]);
      expect(cibles.map((row) => row.position)).toEqual([0, 1, 2]);
    });

    it('copie data et formats tels quels, remet la version à 0 et attribue la copie à l auteur', async () => {
      await seedMonth('2026-08', [
        {
          client: 'ALPHA',
          date: '2026-09-15',
          statut: 'EN COURS',
          formats: { client: { bg: '#FFEE00' } },
          version: 7,
        },
      ]);

      await report('2026-09').expect(201);

      const copie = await ctx.prisma.row.findFirstOrThrow({ where: { month: '2026-09' } });
      expect(copie.data).toEqual({ client: 'ALPHA', date: '2026-09-15', statut: 'EN COURS' });
      expect(copie.formats).toEqual({ client: { bg: '#FFEE00' } });
      expect(copie.version).toBe(0);
      expect(copie.archived).toBe(false);
      expect(copie.createdBy).toBe(userId);
    });

    it('consigne un RowEvent create par copie avec reportFrom et sourceMonth', async () => {
      const ids = await seedMonth('2026-08', [{ client: 'ALPHA', date: '2026-09-15' }]);

      await report('2026-09').expect(201);

      const copie = await ctx.prisma.row.findFirstOrThrow({ where: { month: '2026-09' } });
      const events = await ctx.prisma.rowEvent.findMany({ where: { rowId: copie.id } });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('create');
      expect(events[0].userId).toBe(userId);
      expect(events[0].payload).toEqual({ reportFrom: ids[0], sourceMonth: '2026-08' });
    });

    it('crée une ligne vide quand aucune candidate (mois source entièrement clôturé)', async () => {
      await seedMonth('2026-08', [
        { client: 'FINI', statut: 'CLOTUREE' },
        { client: 'ABANDONNE', statut: 'ANNULEE' },
      ]);

      const res = await report('2026-09').expect(201);
      expect(res.body).toEqual({ from: '2026-08', created: 0 });

      const cibles = await ctx.prisma.row.findMany({ where: { month: '2026-09' } });
      expect(cibles).toHaveLength(1);
      expect(cibles[0].data).toEqual({});
      expect(cibles[0].position).toBe(0);
    });

    it('crée une ligne vide quand aucun mois antérieur n existe', async () => {
      const res = await report('2026-09').expect(201);
      expect(res.body).toEqual({ from: null, created: 0 });

      const cibles = await ctx.prisma.row.findMany({ where: { month: '2026-09' } });
      expect(cibles).toHaveLength(1);
      expect(cibles[0].data).toEqual({});
    });

    it('reporte depuis le dernier mois actif même avec des mois à trous', async () => {
      await seedMonth('2026-03', [{ client: 'VIEUX', date: '2026-09-01' }]);
      await seedMonth('2026-06', [{ client: 'RECENT' }]);

      const res = await report('2026-09').expect(201);
      expect(res.body).toEqual({ from: '2026-06', created: 1 });

      const cibles = await ctx.prisma.row.findMany({ where: { month: '2026-09' } });
      expect(cibles.map((row) => (row.data as { client: string }).client)).toEqual(['RECENT']);
    });

    it('insère en tête et décale les lignes déjà présentes dans le mois cible', async () => {
      await seedMonth('2026-08', [{ client: 'REPORTE' }]);
      const existantes = await seedMonth('2026-09', [{ client: 'DEJA-LA' }]);

      await report('2026-09').expect(201);

      const cibles = await ctx.prisma.row.findMany({
        where: { month: '2026-09' },
        orderBy: { position: 'asc' },
      });
      expect(cibles.map((row) => (row.data as { client: string }).client)).toEqual([
        'REPORTE',
        'DEJA-LA',
      ]);
      expect(cibles.map((row) => row.position)).toEqual([0, 1]);
      expect(cibles[1].id).toBe(existantes[0]);
    });

    it('refuse un mois mal formé : 422 VALIDATION_FAILED', async () => {
      const res = await report('AOUT 2026').expect(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('refuse un visiteur non authentifié : 401', async () => {
      await request(ctx.app.getHttpServer())
        .post('/api/months/report')
        .send({ to: '2026-09' })
        .expect(401);
    });
  });
});
