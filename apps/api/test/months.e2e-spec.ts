import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('GET /api/months (e2e)', () => {
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

  it('retourne un tableau vide sans aucune ligne', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/months')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('retourne les mois existants avec leur compteur, en ordre chronologique', async () => {
    await ctx.prisma.row.create({ data: { month: '2026-09', position: 0 } });
    await ctx.prisma.row.create({ data: { month: '2025-12', position: 0 } });
    await ctx.prisma.row.create({ data: { month: '2026-09', position: 1 } });
    await ctx.prisma.row.create({ data: { month: '2026-01', position: 0 } });

    const res = await request(ctx.app.getHttpServer())
      .get('/api/months')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body).toEqual([
      { month: '2025-12', count: 1 },
      { month: '2026-01', count: 1 },
      { month: '2026-09', count: 2 },
    ]);
  });

  it('ne compte pas les lignes archivées et omet un mois entièrement archivé', async () => {
    await ctx.prisma.row.create({ data: { month: '2026-08', position: 0 } });
    await ctx.prisma.row.create({ data: { month: '2026-08', position: 1, archived: true } });
    await ctx.prisma.row.create({ data: { month: '2025-03', position: 0, archived: true } });

    const res = await request(ctx.app.getHttpServer())
      .get('/api/months')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body).toEqual([{ month: '2026-08', count: 1 }]);
  });

  it('refuse un visiteur non authentifié : 401', async () => {
    await request(ctx.app.getHttpServer()).get('/api/months').expect(401);
  });
});
