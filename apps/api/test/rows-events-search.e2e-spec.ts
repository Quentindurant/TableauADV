import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('Historique et recherche de lignes (e2e)', () => {
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

  describe('GET /api/rows/:id/events', () => {
    it('retourne l historique de la ligne, plus récent d abord, avec le nom de l auteur', async () => {
      const row = await ctx.prisma.row.create({ data: { month: '2026-08', position: 0 } });
      await ctx.prisma.rowEvent.create({
        data: {
          rowId: row.id,
          userId,
          type: 'create',
          payload: { month: '2026-08', position: 0 },
          at: new Date('2026-08-01T10:00:00.000Z'),
        },
      });
      await ctx.prisma.rowEvent.create({
        data: {
          rowId: row.id,
          userId,
          type: 'update',
          payload: { version: 1, changedKeys: ['client'] },
          at: new Date('2026-08-02T10:00:00.000Z'),
        },
      });

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/rows/${row.id}/events`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.map((event: { type: string }) => event.type)).toEqual(['update', 'create']);
      expect(res.body[0]).toMatchObject({
        rowId: row.id,
        userId,
        userName: 'Testeur',
        at: '2026-08-02T10:00:00.000Z',
        payload: { version: 1, changedKeys: ['client'] },
      });
    });

    it('limite l historique à 100 entrées', async () => {
      const row = await ctx.prisma.row.create({ data: { month: '2026-08', position: 0 } });
      for (let index = 0; index < 105; index += 1) {
        await ctx.prisma.rowEvent.create({
          data: {
            rowId: row.id,
            userId,
            type: 'update',
            payload: { version: index + 1, changedKeys: ['client'] },
            at: new Date(Date.UTC(2026, 7, 1, 0, 0, index)),
          },
        });
      }

      const res = await request(ctx.app.getHttpServer())
        .get(`/api/rows/${row.id}/events`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toHaveLength(100);
      expect(res.body[0].payload.version).toBe(105);
    });

    it('retourne un tableau vide pour une ligne sans historique', async () => {
      const row = await ctx.prisma.row.create({ data: { month: '2026-08', position: 0 } });
      const res = await request(ctx.app.getHttpServer())
        .get(`/api/rows/${row.id}/events`)
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('refuse une ligne inconnue : 404 NOT_FOUND', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/rows/inconnue/events')
        .set('Cookie', cookie)
        .expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/rows/search', () => {
    beforeEach(async () => {
      await ctx.prisma.row.create({
        data: { month: '2026-08', position: 0, data: { client: 'ARCADIA', dpt: '49' } },
      });
      await ctx.prisma.row.create({
        data: { month: '2026-09', position: 0, data: { client: 'BOULANGERIE ARCADE' } },
      });
      await ctx.prisma.row.create({
        data: {
          month: '2025-03',
          position: 0,
          data: { client: 'ARCADIA HISTORIQUE' },
          archived: true,
        },
      });
      await ctx.prisma.row.create({
        data: { month: '2026-08', position: 1, data: { client: 'AUTRE SOCIETE' } },
      });
    });

    it('trouve les lignes de tous les mois et des archives, sans tenir compte de la casse', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/rows/search?q=arcad')
        .set('Cookie', cookie)
        .expect(200);

      const clients = res.body.map((row: { data: { client: string } }) => row.data.client).sort();
      expect(clients).toEqual(['ARCADIA', 'ARCADIA HISTORIQUE', 'BOULANGERIE ARCADE']);
    });

    it('cherche dans toutes les valeurs de la ligne, pas seulement le client', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/rows/search?q=49')
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].data.client).toBe('ARCADIA');
    });

    it('retourne un tableau vide sans résultat', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/rows/search?q=zzzinconnu')
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('retourne un tableau vide quand q est vide ou absent', async () => {
      const vide = await request(ctx.app.getHttpServer())
        .get('/api/rows/search?q=')
        .set('Cookie', cookie)
        .expect(200);
      expect(vide.body).toEqual([]);

      const absent = await request(ctx.app.getHttpServer())
        .get('/api/rows/search')
        .set('Cookie', cookie)
        .expect(200);
      expect(absent.body).toEqual([]);
    });

    it('traite le caractère % comme du texte et non comme un joker', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/rows/search?q=%25')
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('retourne un tableau vide (pas 500) quand q est répété (Express en fait un tableau)', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/rows/search?q=a&q=b')
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });
});
