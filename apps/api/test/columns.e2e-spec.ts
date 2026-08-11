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
              { label: 'CLOTUREE', position: 1, bgColor: '#A6A6A6', textColor: '#ABEBC6' },
              { label: 'NEW', position: 0, bgColor: '#FFFF00', textColor: '#FF0000', bold: true },
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
        bgColor: '#FFFF00',
        textColor: '#FF0000',
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
});
