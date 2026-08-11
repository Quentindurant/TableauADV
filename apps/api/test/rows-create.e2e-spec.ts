import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('POST /api/rows (e2e)', () => {
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

  it('crée une ligne vide en fin de mois quand position est absente', async () => {
    await ctx.prisma.row.create({ data: { month: '2026-08', position: 0 } });
    await ctx.prisma.row.create({ data: { month: '2026-08', position: 1 } });

    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows')
      .set('Cookie', cookie)
      .send({ month: '2026-08' })
      .expect(201);

    expect(res.body).toMatchObject({
      month: '2026-08',
      position: 2,
      data: {},
      formats: {},
      version: 0,
      archived: false,
    });
    expect(typeof res.body.id).toBe('string');
  });

  it('crée la première ligne d un mois en position 0', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows')
      .set('Cookie', cookie)
      .send({ month: '2026-09' })
      .expect(201);
    expect(res.body.position).toBe(0);
  });

  it('insère à la position demandée et décale les lignes suivantes', async () => {
    const first = await ctx.prisma.row.create({
      data: { month: '2026-08', position: 0, data: { client: 'ALPHA' } },
    });
    const second = await ctx.prisma.row.create({
      data: { month: '2026-08', position: 1, data: { client: 'BETA' } },
    });

    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows')
      .set('Cookie', cookie)
      .send({ month: '2026-08', position: 1 })
      .expect(201);

    expect(res.body.position).toBe(1);
    const positions = await ctx.prisma.row.findMany({
      where: { month: '2026-08' },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    });
    expect(positions).toEqual([
      { id: first.id, position: 0 },
      { id: res.body.id, position: 1 },
      { id: second.id, position: 2 },
    ]);
  });

  it('ne décale pas les lignes d un autre mois', async () => {
    const autre = await ctx.prisma.row.create({ data: { month: '2026-09', position: 0 } });
    await request(ctx.app.getHttpServer())
      .post('/api/rows')
      .set('Cookie', cookie)
      .send({ month: '2026-08', position: 0 })
      .expect(201);
    const reloaded = await ctx.prisma.row.findUniqueOrThrow({ where: { id: autre.id } });
    expect(reloaded.position).toBe(0);
  });

  it('consigne un RowEvent create attribué à l auteur', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows')
      .set('Cookie', cookie)
      .send({ month: '2026-08' })
      .expect(201);

    const events = await ctx.prisma.rowEvent.findMany({ where: { rowId: res.body.id } });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('create');
    expect(events[0].userId).toBe(userId);
    expect(events[0].payload).toEqual({ month: '2026-08', position: 0 });
  });

  it('refuse un mois mal formé : 422 VALIDATION_FAILED', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows')
      .set('Cookie', cookie)
      .send({ month: 'AOUT 2026' })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('refuse une position négative : 422 VALIDATION_FAILED', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows')
      .set('Cookie', cookie)
      .send({ month: '2026-08', position: -1 })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});
