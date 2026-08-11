import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('PATCH /api/rows/:id (e2e)', () => {
  let ctx: TestContext;
  let cookie: string[];
  let userId: string;
  let rowId: string;

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
    const row = await ctx.prisma.row.create({
      data: { month: '2026-08', position: 0, data: { client: 'ARCADIA' } },
    });
    rowId = row.id;
  });

  it('fusionne le patch clé par clé et incrémente la version', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { statut: 'NEW' } })
      .expect(200);

    expect(res.body.data).toEqual({ client: 'ARCADIA', statut: 'NEW' });
    expect(res.body.version).toBe(1);
  });

  it('efface une clé quand la valeur envoyée est null', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { client: null } })
      .expect(200);
    expect(res.body.data).toEqual({});
  });

  it('fusionne les formats et retire un format avec null', async () => {
    await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, formats: { num_chrono: { bg: '#FF0000' } } })
      .expect(200);

    const ajout = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 1, formats: { impe: { bg: '#FFFF00' } } })
      .expect(200);
    expect(ajout.body.formats).toEqual({
      num_chrono: { bg: '#FF0000' },
      impe: { bg: '#FFFF00' },
    });

    const retrait = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 2, formats: { num_chrono: null } })
      .expect(200);
    expect(retrait.body.formats).toEqual({ impe: { bg: '#FFFF00' } });
    expect(retrait.body.version).toBe(3);
  });

  it('consigne un RowEvent update avec version, changedKeys et diff', async () => {
    await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { client: 'AUTRE', statut: 'NEW' } })
      .expect(200);

    const events = await ctx.prisma.rowEvent.findMany({ where: { rowId, type: 'update' } });
    expect(events).toHaveLength(1);
    expect(events[0].userId).toBe(userId);
    expect(events[0].payload).toEqual({
      version: 1,
      changedKeys: ['client', 'statut'],
      diff: {
        client: { from: 'ARCADIA', to: 'AUTRE' },
        statut: { from: null, to: 'NEW' },
      },
    });
  });

  it('accepte une version dépassée si les clés touchées sont différentes', async () => {
    await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { statut: 'NEW' } })
      .expect(200);

    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { heure: '14H' } })
      .expect(200);

    expect(res.body.data).toEqual({ client: 'ARCADIA', statut: 'NEW', heure: '14H' });
    expect(res.body.version).toBe(2);
  });

  it('refuse une version dépassée sur une clé déjà modifiée : 409 VERSION_CONFLICT', async () => {
    await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { client: 'PREMIER' } })
      .expect(200);

    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { client: 'SECOND', heure: '14H' } })
      .expect(409);

    expect(res.body.code).toBe('VERSION_CONFLICT');
    expect(res.body.details.conflictKeys).toEqual(['client']);
    expect(res.body.details.current).toMatchObject({
      id: rowId,
      version: 1,
      data: { client: 'PREMIER' },
    });
  });

  it('détecte le conflit sur une clé de formats', async () => {
    await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, formats: { impe: { bg: '#FF0000' } } })
      .expect(200);

    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, formats: { impe: { bg: '#FFFF00' } } })
      .expect(409);

    expect(res.body.details.conflictKeys).toEqual(['impe']);
  });

  it('laisse passer deux PATCH concurrents portant sur des clés différentes', async () => {
    const [a, b] = await Promise.all([
      request(ctx.app.getHttpServer())
        .patch(`/api/rows/${rowId}`)
        .set('Cookie', cookie)
        .send({ expectedVersion: 0, patch: { statut: 'NEW' } }),
      request(ctx.app.getHttpServer())
        .patch(`/api/rows/${rowId}`)
        .set('Cookie', cookie)
        .send({ expectedVersion: 0, patch: { heure: '14H' } }),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    const row = await ctx.prisma.row.findUniqueOrThrow({ where: { id: rowId } });
    expect(row.data).toEqual({ client: 'ARCADIA', statut: 'NEW', heure: '14H' });
    expect(row.version).toBe(2);
  });

  it('refuse une ligne inconnue : 404 NOT_FOUND', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch('/api/rows/inconnue')
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { client: 'X' } })
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('refuse un corps sans expectedVersion : 422 VALIDATION_FAILED', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ patch: { client: 'X' } })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('refuse une valeur de patch non scalaire : 422 VALIDATION_FAILED', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/rows/${rowId}`)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, patch: { client: { nom: 'X' } } })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});
