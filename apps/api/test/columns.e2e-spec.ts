import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { ColumnDTO } from '@suivi/shared';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  closeConfigTestContext,
  createConfigTestContext,
  resetConfigTables,
  reseedConfigTables,
  type ConfigTestContext,
} from './helpers/config-test-app';

jest.setTimeout(30_000);

describe('Colonnes (e2e)', () => {
  let ctx: ConfigTestContext;
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;

  beforeAll(async () => {
    ctx = await createConfigTestContext();
    app = ctx.app;
    prisma = ctx.prisma;
    cookie = ctx.cookie;
  });

  beforeEach(async () => {
    await resetConfigTables(prisma);
  });

  afterAll(async () => {
    // Restaure la base de données au état seedé pour les suites voisines
    await reseedConfigTables(prisma);
    await closeConfigTestContext(ctx);
  });

  describe('GET /api/columns', () => {
    it('refuse un appel sans cookie (401)', async () => {
      const res = await request(app.getHttpServer()).get('/api/columns');
      expect(res.status).toBe(401);
    });

    it("renvoie un tableau vide quand aucune colonne n'existe", async () => {
      const res = await request(app.getHttpServer()).get('/api/columns').set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('trie les colonnes par position et les choix par position', async () => {
      await prisma.column.create({
        data: { key: 'client', label: 'CLIENT', type: 'TEXT', position: 1, width: 200 },
      });
      await prisma.column.create({
        data: {
          key: 'statut',
          label: 'INSTALLATION',
          type: 'SELECT',
          position: 0,
          width: 150,
          choices: {
            create: [
              { label: 'CLOTUREE', position: 1, bgColor: '#D5D8DC', textColor: '#4D5656' },
              { label: 'NEW', position: 0, bgColor: '#F7DC6F', textColor: '#6B5504', bold: true },
            ],
          },
        },
      });

      const res = await request(app.getHttpServer()).get('/api/columns').set('Cookie', cookie);

      expect(res.status).toBe(200);
      const columns = res.body as ColumnDTO[];
      expect(columns.map((c) => c.key)).toEqual(['statut', 'client']);
      expect(columns[0].choices.map((c) => c.label)).toEqual(['NEW', 'CLOTUREE']);
      expect(columns[0].choices[0]).toMatchObject({
        label: 'NEW',
        bgColor: '#F7DC6F',
        textColor: '#6B5504',
        bold: true,
        position: 0,
        archived: false,
      });
      expect(columns[1]).toMatchObject({
        key: 'client',
        label: 'CLIENT',
        type: 'TEXT',
        position: 1,
        width: 200,
        visible: true,
        choices: [],
      });
    });
  });

  describe('POST /api/columns', () => {
    it('refuse un appel sans cookie (401)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/columns')
        .send({ label: 'CLIENT', type: 'TEXT' });

      expect(res.status).toBe(401);
    });

    it('crée la première colonne avec key slugifiée, position 0 et largeur 150', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: 'CP CLIENT', type: 'TEXT' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        key: 'cp_client',
        label: 'CP CLIENT',
        type: 'TEXT',
        position: 0,
        width: 150,
        visible: true,
        choices: [],
      });
      expect(typeof (res.body as ColumnDTO).id).toBe('string');
    });

    it('retire les accents de la clé', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: 'Matériel reçu', type: 'SELECT' });

      expect(res.status).toBe(201);
      expect((res.body as ColumnDTO).key).toBe('materiel_recu');
    });

    it('place chaque nouvelle colonne en dernière position (max + 1)', async () => {
      await prisma.column.create({
        data: { key: 'client', label: 'CLIENT', type: 'TEXT', position: 4, width: 150 },
      });

      const res = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: 'TECH', type: 'SELECT' });

      expect(res.status).toBe(201);
      expect((res.body as ColumnDTO).position).toBe(5);
    });

    it('suffixe la clé en cas de collision (_2 puis _3)', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: 'CLIENT', type: 'TEXT' });
      const second = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: 'Client', type: 'TEXT' });
      const third = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: 'client', type: 'TEXT' });

      expect([first.status, second.status, third.status]).toEqual([201, 201, 201]);
      expect((first.body as ColumnDTO).key).toBe('client');
      expect((second.body as ColumnDTO).key).toBe('client_2');
      expect((third.body as ColumnDTO).key).toBe('client_3');
    });

    it('se rabat sur la clé "colonne" quand le libellé n\'a aucun caractère alphanumérique', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: '***', type: 'TEXT' });

      expect(res.status).toBe(201);
      expect((res.body as ColumnDTO).key).toBe('colonne');
    });

    it('refuse un type hors enum (422 VALIDATION_FAILED)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: 'CASE À COCHER', type: 'CHECKBOX' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toBe('Données invalides.');
    });

    it('refuse un libellé vide (422 VALIDATION_FAILED)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/columns')
        .set('Cookie', cookie)
        .send({ label: '   ', type: 'TEXT' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('PATCH /api/columns/:id', () => {
    async function seedThreeColumns(): Promise<string[]> {
      const a = await prisma.column.create({
        data: { key: 'impe', label: 'IMPE', type: 'DATE', position: 0, width: 150 },
      });
      const b = await prisma.column.create({
        data: { key: 'client', label: 'CLIENT', type: 'TEXT', position: 1, width: 150 },
      });
      const c = await prisma.column.create({
        data: { key: 'dpt', label: 'DPT', type: 'TEXT', position: 2, width: 150 },
      });
      return [a.id, b.id, c.id];
    }

    async function keysInOrder(): Promise<string[]> {
      const columns = await prisma.column.findMany({ orderBy: { position: 'asc' } });
      return columns.map((column) => column.key);
    }

    it("renomme la colonne sans changer sa cle", async () => {
      const [, clientId] = await seedThreeColumns();

      const res = await request(app.getHttpServer())
        .patch(`/api/columns/${clientId}`)
        .set('Cookie', cookie)
        .send({ label: 'CLIENT FINAL' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ key: 'client', label: 'CLIENT FINAL' });
    });

    it("met a jour largeur et visibilite", async () => {
      const [impeId] = await seedThreeColumns();

      const res = await request(app.getHttpServer())
        .patch(`/api/columns/${impeId}`)
        .set('Cookie', cookie)
        .send({ width: 240, visible: false });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ width: 240, visible: false, position: 0 });
    });

    it("change le type d une colonne remplie sans toucher aux valeurs", async () => {
      const [, clientId] = await seedThreeColumns();
      const row = await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { client: '12345' } },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/columns/${clientId}`)
        .set('Cookie', cookie)
        .send({ type: 'NUMBER' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ key: 'client', type: 'NUMBER' });

      // Les valeurs deja saisies sont conservees telles quelles (aucune conversion).
      const reloaded = await prisma.row.findUniqueOrThrow({ where: { id: row.id } });
      expect((reloaded.data as Record<string, unknown>).client).toBe('12345');
    });

    it("deplace une colonne vers le haut et decale les autres", async () => {
      const [, , dptId] = await seedThreeColumns();

      const res = await request(app.getHttpServer())
        .patch(`/api/columns/${dptId}`)
        .set('Cookie', cookie)
        .send({ position: 0 });

      expect(res.status).toBe(200);
      expect((res.body as ColumnDTO).position).toBe(0);
      expect(await keysInOrder()).toEqual(['dpt', 'impe', 'client']);
    });

    it("deplace une colonne vers le bas et decale les autres", async () => {
      const [impeId] = await seedThreeColumns();

      const res = await request(app.getHttpServer())
        .patch(`/api/columns/${impeId}`)
        .set('Cookie', cookie)
        .send({ position: 2 });

      expect(res.status).toBe(200);
      expect((res.body as ColumnDTO).position).toBe(2);
      expect(await keysInOrder()).toEqual(['client', 'dpt', 'impe']);
    });

    it("borne une position cible trop grande a la derniere place", async () => {
      const [impeId] = await seedThreeColumns();

      const res = await request(app.getHttpServer())
        .patch(`/api/columns/${impeId}`)
        .set('Cookie', cookie)
        .send({ position: 99 });

      expect(res.status).toBe(200);
      expect((res.body as ColumnDTO).position).toBe(2);
      expect(await keysInOrder()).toEqual(['client', 'dpt', 'impe']);
    });

    it("renvoie 404 NOT_FOUND pour un id inconnu", async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/columns/col_inexistante')
        .set('Cookie', cookie)
        .send({ label: 'PEU IMPORTE' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Colonne introuvable.');
    });

    it("refuse une largeur non entiere (422 VALIDATION_FAILED)", async () => {
      const [impeId] = await seedThreeColumns();

      const res = await request(app.getHttpServer())
        .patch(`/api/columns/${impeId}`)
        .set('Cookie', cookie)
        .send({ width: 150.5 });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('DELETE /api/columns/:id', () => {
    it('supprime une colonne sans données (204)', async () => {
      const column = await prisma.column.create({
        data: { key: 'num_chrono', label: 'N° CHRONO', type: 'TEXT', position: 0, width: 150 },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/columns/${column.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(204);
      expect(await prisma.column.count()).toBe(0);
    });

    it('refuse la suppression quand une ligne porte une valeur (409 COLUMN_HAS_DATA)', async () => {
      const column = await prisma.column.create({
        data: { key: 'client', label: 'CLIENT', type: 'TEXT', position: 0, width: 150 },
      });
      await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { client: 'ARCADIA' } },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/columns/${column.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('COLUMN_HAS_DATA');
      expect(res.body.message).toContain('CLIENT');
      expect(res.body.details).toEqual({ rowCount: 1 });
      expect(await prisma.column.count()).toBe(1);
    });

    it('ne considère pas une valeur vide comme une donnée', async () => {
      const column = await prisma.column.create({
        data: { key: 'client', label: 'CLIENT', type: 'TEXT', position: 0, width: 150 },
      });
      await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { client: '', statut: 'NEW' } },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/columns/${column.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(204);
    });

    it('supprime avec ?force=true et retire la clé des données de toutes les lignes', async () => {
      const column = await prisma.column.create({
        data: { key: 'client', label: 'CLIENT', type: 'TEXT', position: 0, width: 150 },
      });
      const first = await prisma.row.create({
        data: { month: '2026-08', position: 0, data: { client: 'ARCADIA', statut: 'NEW' } },
      });
      const second = await prisma.row.create({
        data: { month: '2026-09', position: 0, data: { client: 'BETA', statut: 'CLOTUREE' } },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/columns/${column.id}?force=true`)
        .set('Cookie', cookie);

      expect(res.status).toBe(204);
      expect(await prisma.column.count()).toBe(0);
      const rows = await prisma.row.findMany({
        where: { id: { in: [first.id, second.id] } },
        orderBy: { month: 'asc' },
      });
      expect(rows[0].data).toEqual({ statut: 'NEW' });
      expect(rows[1].data).toEqual({ statut: 'CLOTUREE' });
    });

    it('supprime aussi les choix de la colonne (cascade)', async () => {
      const column = await prisma.column.create({
        data: {
          key: 'statut',
          label: 'INSTALLATION',
          type: 'SELECT',
          position: 0,
          width: 150,
          choices: { create: [{ label: 'NEW', position: 0 }, { label: 'CLOTUREE', position: 1 }] },
        },
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/columns/${column.id}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(204);
      expect(await prisma.choice.count()).toBe(0);
    });

    it('renvoie 404 NOT_FOUND pour un id inconnu', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/columns/col_inexistante')
        .set('Cookie', cookie);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });
});
