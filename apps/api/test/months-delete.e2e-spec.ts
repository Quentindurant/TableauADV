import request from 'supertest';
import { createTestApp, resetDb, seedUserAndLogin, type TestContext } from './helpers/e2e-app';

describe('Corbeille des mois : suppression et restauration (e2e)', () => {
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
    await ctx.prisma.monthTrash.deleteMany();
    const session = await seedUserAndLogin(ctx);
    cookie = session.cookie;
    userId = session.userId;
  });

  interface SeedLigne {
    client: string;
    archived?: boolean;
    formats?: Record<string, { bg?: string }>;
    version?: number;
  }

  /** Sème un mois : positions 0..n-1 dans l'ordre du tableau fourni. */
  async function seedMonth(month: string, lignes: SeedLigne[]): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 0; index < lignes.length; index += 1) {
      const ligne = lignes[index];
      const row = await ctx.prisma.row.create({
        data: {
          month,
          position: index,
          data: { client: ligne.client },
          formats: ligne.formats ?? {},
          version: ligne.version ?? 0,
          archived: ligne.archived ?? false,
          createdBy: userId,
        },
      });
      ids.push(row.id);
    }
    return ids;
  }

  function supprimer(month: string): request.Test {
    return request(ctx.app.getHttpServer())
      .delete(`/api/months/${month}`)
      .set('Cookie', cookie);
  }

  function corbeille(): request.Test {
    return request(ctx.app.getHttpServer()).get('/api/months/corbeille').set('Cookie', cookie);
  }

  function restaurer(month: string): request.Test {
    return request(ctx.app.getHttpServer())
      .post(`/api/months/${month}/restore`)
      .set('Cookie', cookie);
  }

  describe('DELETE /api/months/:month', () => {
    it('supprime les lignes actives seulement et conserve les archivées', async () => {
      const ids = await seedMonth('2026-08', [
        { client: 'ALPHA' },
        { client: 'BETA' },
        { client: 'ARCHIVE', archived: true },
      ]);

      const res = await supprimer('2026-08').expect(200);
      expect(res.body).toEqual({ deleted: 2 });

      const restantes = await ctx.prisma.row.findMany({ where: { month: '2026-08' } });
      expect(restantes).toHaveLength(1);
      expect(restantes[0].id).toBe(ids[2]);
      expect(restantes[0].archived).toBe(true);
    });

    it('enregistre un instantané de corbeille avec le bon count', async () => {
      await seedMonth('2026-08', [
        { client: 'ALPHA' },
        { client: 'BETA' },
        { client: 'ARCHIVE', archived: true },
      ]);

      await supprimer('2026-08').expect(200);

      const entry = await ctx.prisma.monthTrash.findUniqueOrThrow({ where: { month: '2026-08' } });
      expect(entry.count).toBe(2);
      expect(Array.isArray(entry.rows)).toBe(true);
      expect(entry.rows).toHaveLength(2);
    });

    it('efface les RowEvent en cascade avec les lignes', async () => {
      const ids = await seedMonth('2026-08', [{ client: 'ALPHA' }]);
      await ctx.prisma.rowEvent.create({
        data: { rowId: ids[0], userId, type: 'update', payload: { version: 1 } },
      });

      await supprimer('2026-08').expect(200);

      expect(await ctx.prisma.rowEvent.count()).toBe(0);
    });

    it('retourne deleted 0 sur un mois vide sans écraser l instantané existant', async () => {
      await seedMonth('2026-08', [{ client: 'ALPHA' }]);
      await supprimer('2026-08').expect(200);
      const avant = await ctx.prisma.monthTrash.findUniqueOrThrow({ where: { month: '2026-08' } });

      const res = await supprimer('2026-08').expect(200);
      expect(res.body).toEqual({ deleted: 0 });

      const apres = await ctx.prisma.monthTrash.findUniqueOrThrow({ where: { month: '2026-08' } });
      expect(apres.deletedAt).toEqual(avant.deletedAt);
      expect(apres.count).toBe(avant.count);
      expect(apres.rows).toEqual(avant.rows);
    });

    it('écrase l instantané précédent quand le mois est re-supprimé avec de nouvelles lignes', async () => {
      await seedMonth('2026-08', [{ client: 'ALPHA' }]);
      await supprimer('2026-08').expect(200);
      await seedMonth('2026-08', [{ client: 'NOUVEAU-1' }, { client: 'NOUVEAU-2' }]);

      const res = await supprimer('2026-08').expect(200);
      expect(res.body).toEqual({ deleted: 2 });

      const entry = await ctx.prisma.monthTrash.findUniqueOrThrow({ where: { month: '2026-08' } });
      expect(entry.count).toBe(2);
    });

    it('refuse un mois mal formé : 422 VALIDATION_FAILED', async () => {
      const res = await supprimer('2026-13').expect(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('refuse un visiteur non authentifié : 401', async () => {
      await request(ctx.app.getHttpServer()).delete('/api/months/2026-08').expect(401);
    });
  });

  describe('GET /api/months/corbeille', () => {
    it('liste les instantanés du plus récent au plus ancien avec leur count', async () => {
      await seedMonth('2026-07', [{ client: 'JUILLET' }]);
      await seedMonth('2026-08', [{ client: 'AOUT-1' }, { client: 'AOUT-2' }]);
      await supprimer('2026-07').expect(200);
      await supprimer('2026-08').expect(200);

      const res = await corbeille().expect(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({ month: '2026-08', count: 2 });
      expect(res.body[1]).toMatchObject({ month: '2026-07', count: 1 });
      expect(new Date(res.body[0].deletedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(res.body[1].deletedAt).getTime(),
      );
    });

    it('retourne un tableau vide sans aucune suppression', async () => {
      const res = await corbeille().expect(200);
      expect(res.body).toEqual([]);
    });

    it('refuse un visiteur non authentifié : 401', async () => {
      await request(ctx.app.getHttpServer()).get('/api/months/corbeille').expect(401);
    });
  });

  describe('POST /api/months/:month/restore', () => {
    it('réinsère les lignes à l identique : ids, positions, data, formats, version', async () => {
      await seedMonth('2026-08', [
        { client: 'ALPHA', formats: { client: { bg: '#FFEE00' } }, version: 7 },
        { client: 'BETA' },
      ]);
      const avant = await ctx.prisma.row.findMany({
        where: { month: '2026-08' },
        orderBy: { position: 'asc' },
      });

      await supprimer('2026-08').expect(200);
      const res = await restaurer('2026-08').expect(200);
      expect(res.body).toEqual({ restored: 2 });

      const apres = await ctx.prisma.row.findMany({
        where: { month: '2026-08' },
        orderBy: { position: 'asc' },
      });
      expect(apres).toHaveLength(2);
      for (let index = 0; index < avant.length; index += 1) {
        expect(apres[index].id).toBe(avant[index].id);
        expect(apres[index].position).toBe(avant[index].position);
        expect(apres[index].data).toEqual(avant[index].data);
        expect(apres[index].formats).toEqual(avant[index].formats);
        expect(apres[index].version).toBe(avant[index].version);
        expect(apres[index].archived).toBe(false);
        expect(apres[index].createdBy).toBe(avant[index].createdBy);
        expect(apres[index].createdAt).toEqual(avant[index].createdAt);
      }
    });

    it('retire l entrée de corbeille après restauration', async () => {
      await seedMonth('2026-08', [{ client: 'ALPHA' }]);
      await supprimer('2026-08').expect(200);

      await restaurer('2026-08').expect(200);

      expect(await ctx.prisma.monthTrash.count()).toBe(0);
      const res = await corbeille().expect(200);
      expect(res.body).toEqual([]);
    });

    it('consigne un RowEvent create par ligne restaurée avec le payload du contrat', async () => {
      const ids = await seedMonth('2026-08', [{ client: 'ALPHA' }, { client: 'BETA' }]);
      await supprimer('2026-08').expect(200);
      expect(await ctx.prisma.rowEvent.count()).toBe(0);

      await restaurer('2026-08').expect(200);

      const events = await ctx.prisma.rowEvent.findMany({ orderBy: { at: 'asc' } });
      expect(events).toHaveLength(2);
      for (const event of events) {
        expect(event.type).toBe('create');
        expect(event.userId).toBe(userId);
        expect(event.payload).toEqual({ restauredDe: 'corbeille', month: '2026-08' });
        expect(ids).toContain(event.rowId);
      }
    });

    it('refuse la restauration d un mois contenant déjà des lignes actives : 409 sans modification', async () => {
      await seedMonth('2026-08', [{ client: 'ALPHA' }]);
      await supprimer('2026-08').expect(200);
      const nouvelles = await seedMonth('2026-08', [{ client: 'NOUVELLE' }]);

      const res = await restaurer('2026-08').expect(409);
      expect(res.body.code).toBe('VERSION_CONFLICT');

      // Rien n'est modifié : la nouvelle ligne reste seule, l'instantané subsiste.
      const lignes = await ctx.prisma.row.findMany({ where: { month: '2026-08' } });
      expect(lignes).toHaveLength(1);
      expect(lignes[0].id).toBe(nouvelles[0]);
      expect(await ctx.prisma.monthTrash.count({ where: { month: '2026-08' } })).toBe(1);
      expect(await ctx.prisma.rowEvent.count()).toBe(0);
    });

    it('autorise la restauration quand le mois ne contient que des lignes archivées', async () => {
      await seedMonth('2026-08', [{ client: 'ALPHA' }, { client: 'ARCHIVE', archived: true }]);
      await supprimer('2026-08').expect(200);

      const res = await restaurer('2026-08').expect(200);
      expect(res.body).toEqual({ restored: 1 });

      const lignes = await ctx.prisma.row.findMany({ where: { month: '2026-08' } });
      expect(lignes).toHaveLength(2);
    });

    it('refuse la restauration sans instantané : 404 NOT_FOUND', async () => {
      const res = await restaurer('2026-08').expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('refuse un mois mal formé : 422 VALIDATION_FAILED', async () => {
      const res = await restaurer('aout-2026').expect(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('refuse un visiteur non authentifié : 401', async () => {
      await request(ctx.app.getHttpServer()).post('/api/months/2026-08/restore').expect(401);
    });
  });
});
