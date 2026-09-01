import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('Disposition des colonnes par utilisateur (e2e)', () => {
  let ctx: TestContext;
  let cookieAlice: string[];
  let cookieBob: string[];
  let colClientId: string;
  let colStatutId: string;

  // Clés préfixées : la suite crée/supprime ses propres colonnes sans toucher
  // celles des autres suites e2e (base partagée, maxWorkers 1).
  const PREFIXE = 'layout-e2e-';

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.prisma.column.deleteMany({ where: { key: { startsWith: PREFIXE } } });
    await ctx.app.close();
  });

  beforeEach(async () => {
    // resetDb supprime tous les comptes : leurs entrées de disposition
    // partent en cascade. Les colonnes de la suite sont recréées à neuf.
    await resetDb(ctx.prisma);
    await ctx.prisma.column.deleteMany({ where: { key: { startsWith: PREFIXE } } });
    const colClient = await ctx.prisma.column.create({
      data: { key: `${PREFIXE}client`, label: 'Client', type: 'TEXT', position: 100 },
    });
    const colStatut = await ctx.prisma.column.create({
      data: { key: `${PREFIXE}statut`, label: 'Statut', type: 'TEXT', position: 101 },
    });
    colClientId = colClient.id;
    colStatutId = colStatut.id;

    const alice = await seedUserAndLogin(ctx, 'alice@suivi.local');
    const bob = await seedUserAndLogin(ctx, 'bob@suivi.local');
    cookieAlice = alice.cookie;
    cookieBob = bob.cookie;
  });

  function lire(cookie: string[]): request.Test {
    return request(ctx.app.getHttpServer()).get('/api/me/column-layout').set('Cookie', cookie);
  }

  function modifier(cookie: string[], columnId: string, body: unknown): request.Test {
    return request(ctx.app.getHttpServer())
      .patch(`/api/me/column-layout/${columnId}`)
      .set('Cookie', cookie)
      .send(body as object);
  }

  function reinitialiser(cookie: string[]): request.Test {
    return request(ctx.app.getHttpServer()).delete('/api/me/column-layout').set('Cookie', cookie);
  }

  describe('GET /api/me/column-layout', () => {
    it('retourne un tableau vide sans aucune entrée', async () => {
      const res = await lire(cookieAlice).expect(200);
      expect(res.body).toEqual([]);
    });

    it('ne retourne que les entrées de l utilisateur courant', async () => {
      await modifier(cookieAlice, colClientId, { width: 220 }).expect(200);

      const alice = await lire(cookieAlice).expect(200);
      expect(alice.body).toEqual([
        { columnId: colClientId, width: 220, position: null, hidden: false },
      ]);

      const bob = await lire(cookieBob).expect(200);
      expect(bob.body).toEqual([]);
    });

    it('refuse un visiteur non authentifié : 401', async () => {
      await request(ctx.app.getHttpServer()).get('/api/me/column-layout').expect(401);
    });
  });

  describe('PATCH /api/me/column-layout/:columnId', () => {
    it('crée l entrée au premier PATCH : champs absents hérités du standard', async () => {
      const res = await modifier(cookieAlice, colClientId, { width: 220 }).expect(200);
      expect(res.body).toEqual({
        columnId: colClientId,
        width: 220,
        position: null,
        hidden: false,
      });
    });

    it('cumule les écritures partielles : width seul puis hidden true', async () => {
      await modifier(cookieAlice, colClientId, { width: 220 }).expect(200);
      const res = await modifier(cookieAlice, colClientId, { hidden: true }).expect(200);
      expect(res.body).toEqual({
        columnId: colClientId,
        width: 220,
        position: null,
        hidden: true,
      });

      // Une seule entrée en base : l'upsert n'a pas dupliqué.
      const liste = await lire(cookieAlice).expect(200);
      expect(liste.body).toHaveLength(1);
    });

    it('n affecte pas la disposition de l autre compte', async () => {
      await modifier(cookieAlice, colClientId, { width: 300, hidden: true }).expect(200);
      await modifier(cookieBob, colClientId, { width: 180 }).expect(200);

      const bob = await lire(cookieBob).expect(200);
      expect(bob.body).toEqual([
        { columnId: colClientId, width: 180, position: null, hidden: false },
      ]);
    });

    it('refuse une colonne inconnue : 404 NOT_FOUND', async () => {
      const res = await modifier(cookieAlice, 'colonne-inexistante', { width: 220 }).expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('refuse une largeur négative : 422 VALIDATION_FAILED sans rien écrire', async () => {
      const res = await modifier(cookieAlice, colClientId, { width: -1 }).expect(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(await ctx.prisma.userColumnLayout.count()).toBe(0);
    });

    it('refuse un body vide : 422 VALIDATION_FAILED', async () => {
      const res = await modifier(cookieAlice, colClientId, {}).expect(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('refuse un visiteur non authentifié : 401', async () => {
      await request(ctx.app.getHttpServer())
        .patch(`/api/me/column-layout/${colClientId}`)
        .send({ width: 220 })
        .expect(401);
    });
  });

  describe('DELETE /api/me/column-layout', () => {
    it('purge uniquement l utilisateur courant et retourne le compte', async () => {
      await modifier(cookieAlice, colClientId, { width: 220 }).expect(200);
      await modifier(cookieAlice, colStatutId, { hidden: true }).expect(200);
      await modifier(cookieBob, colClientId, { width: 180 }).expect(200);

      const res = await reinitialiser(cookieAlice).expect(200);
      expect(res.body).toEqual({ deleted: 2 });

      const alice = await lire(cookieAlice).expect(200);
      expect(alice.body).toEqual([]);

      const bob = await lire(cookieBob).expect(200);
      expect(bob.body).toEqual([
        { columnId: colClientId, width: 180, position: null, hidden: false },
      ]);
    });

    it('retourne deleted 0 sans aucune entrée', async () => {
      const res = await reinitialiser(cookieAlice).expect(200);
      expect(res.body).toEqual({ deleted: 0 });
    });

    it('refuse un visiteur non authentifié : 401', async () => {
      await request(ctx.app.getHttpServer()).delete('/api/me/column-layout').expect(401);
    });
  });

  describe('cascade à la suppression de la colonne', () => {
    it('emporte les entrées de disposition de tous les comptes', async () => {
      await modifier(cookieAlice, colClientId, { width: 220 }).expect(200);
      await modifier(cookieAlice, colStatutId, { position: 3 }).expect(200);
      await modifier(cookieBob, colClientId, { hidden: true }).expect(200);

      await ctx.prisma.column.delete({ where: { id: colClientId } });

      const alice = await lire(cookieAlice).expect(200);
      expect(alice.body).toEqual([
        { columnId: colStatutId, width: null, position: 3, hidden: false },
      ]);

      const bob = await lire(cookieBob).expect(200);
      expect(bob.body).toEqual([]);
    });
  });
});
