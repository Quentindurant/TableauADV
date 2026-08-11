import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('GET /api/rows (e2e)', () => {
  let ctx: TestContext;
  let cookie: string[];

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    cookie = (await seedUserAndLogin(ctx)).cookie;
  });

  it('refuse une requête sans filtre : 422 VALIDATION_FAILED', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/rows')
      .set('Cookie', cookie)
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('refuse un mois mal formé : 422 VALIDATION_FAILED', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/rows?month=AOUT-2026')
      .set('Cookie', cookie)
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('refuse archived=false (seul ?archived=true est un filtre) : 422', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/rows?archived=false')
      .set('Cookie', cookie)
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('retourne les lignes du mois triées par position, sans les archivées', async () => {
    await ctx.prisma.row.create({
      data: { month: '2026-08', position: 1, data: { client: 'BETA' } },
    });
    await ctx.prisma.row.create({
      data: { month: '2026-08', position: 0, data: { client: 'ALPHA' } },
    });
    await ctx.prisma.row.create({
      data: { month: '2026-08', position: 2, data: { client: 'ARCHIVEE' }, archived: true },
    });
    await ctx.prisma.row.create({
      data: { month: '2026-09', position: 0, data: { client: 'AUTRE MOIS' } },
    });

    const res = await request(ctx.app.getHttpServer())
      .get('/api/rows?month=2026-08')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body.map((r: { data: { client: string } }) => r.data.client)).toEqual([
      'ALPHA',
      'BETA',
    ]);
    expect(res.body[0]).toMatchObject({
      month: '2026-08',
      position: 0,
      formats: {},
      version: 0,
      archived: false,
    });
    expect(typeof res.body[0].updatedAt).toBe('string');
  });

  it('retourne un tableau vide pour un mois sans ligne', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/rows?month=2026-12')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('retourne toutes les archives, tous mois confondus, triées mois puis position', async () => {
    await ctx.prisma.row.create({
      data: { month: '2026-09', position: 0, data: { client: 'SEPT' }, archived: true },
    });
    await ctx.prisma.row.create({
      data: { month: '2026-08', position: 1, data: { client: 'AOUT B' }, archived: true },
    });
    await ctx.prisma.row.create({
      data: { month: '2026-08', position: 0, data: { client: 'AOUT A' }, archived: true },
    });
    await ctx.prisma.row.create({
      data: { month: '2026-08', position: 5, data: { client: 'ACTIVE' } },
    });

    const res = await request(ctx.app.getHttpServer())
      .get('/api/rows?archived=true')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.map((r: { data: { client: string } }) => r.data.client)).toEqual([
      'AOUT A',
      'AOUT B',
      'SEPT',
    ]);
  });

  it('refuse un visiteur non authentifié : 401', async () => {
    await request(ctx.app.getHttpServer()).get('/api/rows?month=2026-08').expect(401);
  });
});
