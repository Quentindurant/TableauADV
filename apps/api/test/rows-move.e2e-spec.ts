import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('POST /api/rows/:id/move (e2e)', () => {
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

  async function seedMonth(month: string, clients: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 0; index < clients.length; index += 1) {
      const row = await ctx.prisma.row.create({
        data: { month, position: index, data: { client: clients[index] } },
      });
      ids.push(row.id);
    }
    return ids;
  }

  async function clientsOf(month: string): Promise<string[]> {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/rows?month=${month}`)
      .set('Cookie', cookie)
      .expect(200);
    return res.body.map((row: { data: { client: string } }) => row.data.client);
  }

  it('remonte une ligne dans son mois et renumérote de 0 à n-1', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B', 'C']);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[2]}/move`)
      .set('Cookie', cookie)
      .send({ position: 0 })
      .expect(200);

    expect(res.body.position).toBe(0);
    expect(await clientsOf('2026-08')).toEqual(['C', 'A', 'B']);
    const positions = await ctx.prisma.row.findMany({
      where: { month: '2026-08' },
      orderBy: { position: 'asc' },
      select: { position: true },
    });
    expect(positions.map((p) => p.position)).toEqual([0, 1, 2]);
  });

  it('descend une ligne dans son mois', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B', 'C']);
    await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/move`)
      .set('Cookie', cookie)
      .send({ position: 2 })
      .expect(200);
    expect(await clientsOf('2026-08')).toEqual(['B', 'C', 'A']);
  });

  it('déplace vers un autre mois en fin de liste et renumérote la source', async () => {
    const aout = await seedMonth('2026-08', ['A', 'B', 'C']);
    await seedMonth('2026-09', ['X', 'Y']);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${aout[1]}/move`)
      .set('Cookie', cookie)
      .send({ month: '2026-09' })
      .expect(200);

    expect(res.body).toMatchObject({ month: '2026-09', position: 2 });
    expect(await clientsOf('2026-08')).toEqual(['A', 'C']);
    expect(await clientsOf('2026-09')).toEqual(['X', 'Y', 'B']);
    const source = await ctx.prisma.row.findMany({
      where: { month: '2026-08' },
      orderBy: { position: 'asc' },
      select: { position: true },
    });
    expect(source.map((p) => p.position)).toEqual([0, 1]);
  });

  it('déplace vers un autre mois à une position donnée', async () => {
    const aout = await seedMonth('2026-08', ['A', 'B']);
    await seedMonth('2026-09', ['X', 'Y']);

    await request(ctx.app.getHttpServer())
      .post(`/api/rows/${aout[0]}/move`)
      .set('Cookie', cookie)
      .send({ month: '2026-09', position: 1 })
      .expect(200);

    expect(await clientsOf('2026-09')).toEqual(['X', 'A', 'Y']);
  });

  it('borne une position supérieure au nombre de lignes', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B']);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/move`)
      .set('Cookie', cookie)
      .send({ position: 99 })
      .expect(200);
    expect(res.body.position).toBe(1);
    expect(await clientsOf('2026-08')).toEqual(['B', 'A']);
  });

  it('consigne un RowEvent move décrivant l origine et la destination', async () => {
    const aout = await seedMonth('2026-08', ['A', 'B']);
    await request(ctx.app.getHttpServer())
      .post(`/api/rows/${aout[1]}/move`)
      .set('Cookie', cookie)
      .send({ month: '2026-09', position: 0 })
      .expect(200);

    const events = await ctx.prisma.rowEvent.findMany({ where: { rowId: aout[1], type: 'move' } });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({
      fromMonth: '2026-08',
      toMonth: '2026-09',
      fromPosition: 1,
      toPosition: 0,
    });
  });

  it('ne change pas la version de la ligne', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B']);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/move`)
      .set('Cookie', cookie)
      .send({ position: 1 })
      .expect(200);
    expect(res.body.version).toBe(0);
  });

  it('refuse une ligne inconnue : 404 NOT_FOUND', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows/inconnue/move')
      .set('Cookie', cookie)
      .send({ position: 0 })
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('refuse un mois mal formé : 422 VALIDATION_FAILED', async () => {
    const ids = await seedMonth('2026-08', ['A']);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/move`)
      .set('Cookie', cookie)
      .send({ month: '2026-13' })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});
