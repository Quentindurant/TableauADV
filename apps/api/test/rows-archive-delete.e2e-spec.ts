import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('Archivage et suppression de lignes (e2e)', () => {
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

  it('archive une ligne : elle quitte le mois et rejoint les archives', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B', 'C']);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[1]}/archive`)
      .set('Cookie', cookie)
      .send({ archived: true })
      .expect(200);

    expect(res.body).toMatchObject({ id: ids[1], archived: true });
    expect(await clientsOf('2026-08')).toEqual(['A', 'C']);

    const archives = await request(ctx.app.getHttpServer())
      .get('/api/rows?archived=true')
      .set('Cookie', cookie)
      .expect(200);
    expect(archives.body.map((row: { id: string }) => row.id)).toEqual([ids[1]]);
  });

  it('renumérote le mois après archivage', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B', 'C']);
    await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/archive`)
      .set('Cookie', cookie)
      .send({ archived: true })
      .expect(200);

    const rest = await ctx.prisma.row.findMany({
      where: { month: '2026-08', archived: false },
      orderBy: { position: 'asc' },
      select: { position: true },
    });
    expect(rest.map((row) => row.position)).toEqual([0, 1]);
  });

  it('désarchive une ligne : elle revient en fin de son mois', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B']);
    await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/archive`)
      .set('Cookie', cookie)
      .send({ archived: true })
      .expect(200);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/archive`)
      .set('Cookie', cookie)
      .send({ archived: false })
      .expect(200);

    expect(res.body).toMatchObject({ archived: false, position: 1 });
    expect(await clientsOf('2026-08')).toEqual(['B', 'A']);
  });

  it('consigne un RowEvent archive', async () => {
    const ids = await seedMonth('2026-08', ['A']);
    await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/archive`)
      .set('Cookie', cookie)
      .send({ archived: true })
      .expect(200);

    const events = await ctx.prisma.rowEvent.findMany({ where: { rowId: ids[0], type: 'archive' } });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({ archived: true });
  });

  it('refuse un archivage sur une ligne inconnue : 404 NOT_FOUND', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/rows/inconnue/archive')
      .set('Cookie', cookie)
      .send({ archived: true })
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('refuse un corps d archivage invalide : 422 VALIDATION_FAILED', async () => {
    const ids = await seedMonth('2026-08', ['A']);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/rows/${ids[0]}/archive`)
      .set('Cookie', cookie)
      .send({ archived: 'oui' })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('supprime une ligne : 204, mois renuméroté', async () => {
    const ids = await seedMonth('2026-08', ['A', 'B', 'C']);

    await request(ctx.app.getHttpServer())
      .delete(`/api/rows/${ids[0]}`)
      .set('Cookie', cookie)
      .expect(204);

    expect(await clientsOf('2026-08')).toEqual(['B', 'C']);
    const rest = await ctx.prisma.row.findMany({
      where: { month: '2026-08' },
      orderBy: { position: 'asc' },
      select: { position: true },
    });
    expect(rest.map((row) => row.position)).toEqual([0, 1]);
  });

  it('supprime en cascade les événements de la ligne (aucun événement delete conservé)', async () => {
    const ids = await seedMonth('2026-08', ['A']);
    await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${ids[0]}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { statut: 'NEW' } })
      .expect(200);
    expect(await ctx.prisma.rowEvent.count({ where: { rowId: ids[0] } })).toBe(1);

    await request(ctx.app.getHttpServer())
      .delete(`/api/rows/${ids[0]}`)
      .set('Cookie', cookie)
      .expect(204);

    expect(await ctx.prisma.rowEvent.count({ where: { rowId: ids[0] } })).toBe(0);
  });

  it('refuse la suppression d une ligne inconnue : 404 NOT_FOUND', async () => {
    const res = await request(ctx.app.getHttpServer())
      .delete('/api/rows/inconnue')
      .set('Cookie', cookie)
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
